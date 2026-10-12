/**
 * Google Calendar refresh tokens are encrypted at rest with CALENDAR_TOKEN_KEY;
 * tokens stored before encryption existed are encrypted at startup; without a
 * key, linking is refused and nothing is written in plaintext.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@libsql/client";
import {
  calendarKeyFromEnv, encryptCalendarToken, encryptStoredCalendarTokens, isEncryptedCalendarToken, readCalendarToken,
} from "../calendarTokens";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

const KEY = "k".repeat(40);

describe("calendar token encryption", () => {
  it("needs a key of at least 32 characters", () => {
    const saved = process.env.CALENDAR_TOKEN_KEY;
    delete process.env.CALENDAR_TOKEN_KEY;
    try { expect(calendarKeyFromEnv()).toBeNull(); }
    finally { if (saved !== undefined) process.env.CALENDAR_TOKEN_KEY = saved; }
    expect(calendarKeyFromEnv("")).toBeNull();
    expect(calendarKeyFromEnv("short-key")).toBeNull();
    expect(calendarKeyFromEnv(KEY)).toBeInstanceOf(Buffer);
  });

  it("round-trips, and the stored value doesn't contain the token", () => {
    const key = calendarKeyFromEnv(KEY)!;
    const stored = encryptCalendarToken("1//refresh-secret", key);
    expect(isEncryptedCalendarToken(stored)).toBe(true);
    expect(stored).not.toContain("refresh-secret");
    expect(readCalendarToken(stored, key)).toBe("1//refresh-secret");
  });

  it("returns null for a token encrypted with a different key", () => {
    const stored = encryptCalendarToken("1//refresh-secret", calendarKeyFromEnv(KEY)!);
    expect(readCalendarToken(stored, calendarKeyFromEnv("z".repeat(40))!)).toBeNull();
  });

  it("encrypts existing plaintext tokens in place and leaves encrypted ones alone", async () => {
    const db = createClient({ url: ":memory:" });
    await db.execute("CREATE TABLE google_calendar_links (member_id INTEGER PRIMARY KEY, google_email TEXT, refresh_token TEXT, linked_at TEXT)");
    const key = calendarKeyFromEnv(KEY)!;
    const already = encryptCalendarToken("1//already", key);
    await db.execute({ sql: "INSERT INTO google_calendar_links (member_id, refresh_token) VALUES (1, ?), (2, ?), (3, NULL)", args: ["1//plain", already] });
    const deps = {
      all: async (sql: string, ...args: any[]) => (await db.execute({ sql, args })).rows as any[],
      run: async (sql: string, ...args: any[]) => db.execute({ sql, args }),
    };
    expect(await encryptStoredCalendarTokens(deps, key)).toBe(1);
    const rows = (await db.execute("SELECT member_id, refresh_token FROM google_calendar_links ORDER BY member_id")).rows as any[];
    expect(isEncryptedCalendarToken(rows[0].refresh_token)).toBe(true);
    expect(readCalendarToken(rows[0].refresh_token, key)).toBe("1//plain");
    expect(rows[1].refresh_token).toBe(already);
    expect(rows[2].refresh_token).toBeNull();
    // Running again finds nothing left to do.
    expect(await encryptStoredCalendarTokens(deps, key)).toBe(0);
    db.close();
  });
});

describe("server without CALENDAR_TOKEN_KEY", () => {
  let t: TestServer;
  let session = "";
  let team = 0;
  let adaId = 0;
  beforeAll(async () => {
    t = await startTestServer("cp-caltok-", { CALENDAR_TOKEN_KEY: "", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" });
    team = await seedTeam(t.db, "Robo");
    adaId = await seedMember(t.db, team, "Ada", "ada@caltok.test", "admin");
    session = await t.session(adaId);
  }, 120_000);
  afterAll(async () => { await t?.stop(); });

  it("reports calendar linking as unavailable", async () => {
    const r = await t.api("/api/calendar/link", { session });
    expect(r.status).toBe(200);
    expect(r.body.available).toBe(false);
  });

  it("refuses to start linking instead of storing a plaintext token", async () => {
    const headers = new Headers();
    const { withSession } = await import("./helpers/session");
    withSession(headers, session);
    const res = await fetch(`${t.base}/api/auth/google/calendar`, { headers, redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/settings?cal_error=unavailable");
  });

  it("queues the Google copy of a deleted event instead of losing it", async () => {
    await t.db.execute({ sql: "INSERT INTO google_calendar_links (member_id, google_email, refresh_token, linked_at) VALUES (?, 'ada@gmail.test', '1//legacy-plain', datetime('now'))", args: [adaId] });
    const created = await t.post("/api/events", { title: "Build session", date: "2099-02-03", start_time: "10:00", end_time: "12:00", event_type: "meeting" }, session);
    expect(created.status).toBeLessThan(300);
    const eventId = Number(created.body?.id ?? created.body?.event?.id);
    expect(eventId).toBeGreaterThan(0);
    await t.db.execute({ sql: "INSERT INTO event_calendar_sync (event_id, member_id, google_event_id) VALUES (?, ?, 'g-evt-1')", args: [eventId, adaId] });
    const del = await t.api(`/api/events/${eventId}`, { method: "DELETE", session });
    expect(del.status).toBeLessThan(300);
    let pending: any[] = [];
    for (let i = 0; i < 40 && !pending.length; i++) {
      pending = (await t.db.execute({ sql: "SELECT member_id, google_event_id FROM calendar_pending_deletes", args: [] })).rows as any[];
      if (!pending.length) await new Promise((r) => setTimeout(r, 100));
    }
    expect(pending.map((r) => [Number(r.member_id), r.google_event_id])).toEqual([[adaId, "g-evt-1"]]);
  });
});
