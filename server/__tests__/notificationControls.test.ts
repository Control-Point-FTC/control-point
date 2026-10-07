/**
 * Notification controls (audit item 26): team updates follow each member's
 * choice (instant / digest / off), digests arrive as one summary, @everyone
 * respects opt-outs and a per-sender cap, and admin changes to your roles
 * always reach you.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { DEFAULT_PREFS, PingLimiter, digestText, parsePrefs, prefsPatch } from "../notifyPrefs";

vi.setConfig({ testTimeout: 30_000 });

describe("notifyPrefs helpers", () => {
  it("defaults anything missing or invalid", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"team_updates":"loud","everyone_pings":"yes"}')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"team_updates":"off","everyone_pings":false}')).toEqual({ team_updates: "off", everyone_pings: false });
  });
  it("validates patches", () => {
    expect(prefsPatch({ team_updates: "instant" })).toEqual({ patch: { team_updates: "instant" } });
    expect(prefsPatch({ team_updates: "sometimes" })).toHaveProperty("error");
    expect(prefsPatch({ everyone_pings: "no" })).toHaveProperty("error");
    expect(prefsPatch({ other: 1 })).toHaveProperty("error");
  });
  it("writes a readable digest", () => {
    expect(digestText("Robo", ["budget", "outreach", "budget", "event"])).toBe("Robo: 2 budget entries, 1 outreach event and 1 calendar event were added.");
    expect(digestText("Robo", ["event"])).toBe("Robo: 1 calendar event was added.");
    expect(digestText("Robo", [])).toBe("");
  });
  it("caps pings per sender per window", () => {
    const l = new PingLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => l.allow(1, 7, 0))).toEqual([true, true, true, false]);
    expect(l.allow(1, 8, 0)).toBe(true); // someone else
    expect(l.allow(1, 7, 1500)).toBe(true); // window passed
  });
});

let t: TestServer;
let team = 0;
const ids: Record<string, number> = {};
const sess: Record<string, string> = {};

beforeAll(async () => {
  t = await startTestServer("cp-notify-", { NOTIFY_DIGEST_FLUSH_MS: "300" });
  team = await seedTeam(t.db, "Robo");
  ids.admin = await seedMember(t.db, team, "Admin", "admin@n.test", "admin");
  ids.instant = await seedMember(t.db, team, "Instant", "instant@n.test");
  ids.digest = await seedMember(t.db, team, "Digest", "digest@n.test");
  ids.off = await seedMember(t.db, team, "Off", "off@n.test");
  // A second workspace row for the same person: prefs follow the account.
  const other = await seedTeam(t.db, "Other");
  ids.instantElsewhere = await seedMember(t.db, other, "Instant", "instant@n.test");
  for (const k of ["admin", "instant", "digest", "off"]) sess[k] = await t.session(ids[k]);
}, 120_000);
afterAll(async () => { await t?.stop(); });

const count = async (sql: string, ...args: any[]) => Number(((await t.db.execute({ sql, args })).rows[0] as any).n);
const notes = (id: number) => count("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?", id);
const queued = (id: number) => count("SELECT COUNT(*) AS n FROM notification_digest WHERE member_id = ?", id);
/** Poll until `check` holds (fire-and-forget writes can lag under load). */
const until = async (check: () => Promise<boolean>, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await new Promise((r) => setTimeout(r, 100)); }
};

describe("preferences API", () => {
  it("reads defaults, validates, and saves on every row of the account", async () => {
    const r = await t.api("/api/notification-prefs", { session: sess.instant });
    expect(r.body).toEqual(DEFAULT_PREFS);
    expect((await t.patch("/api/notification-prefs", { team_updates: "loud" }, sess.instant)).status).toBe(400);
    const ok = await t.patch("/api/notification-prefs", { team_updates: "instant" }, sess.instant);
    expect(ok.body).toEqual({ team_updates: "instant", everyone_pings: true });
    const elsewhere = (await t.db.execute({ sql: "SELECT notify_prefs FROM members WHERE id = ?", args: [ids.instantElsewhere] })).rows[0] as any;
    expect(parsePrefs(elsewhere.notify_prefs).team_updates).toBe("instant");
    await t.patch("/api/notification-prefs", { team_updates: "off", everyone_pings: false }, sess.off);
  });
});

describe("team updates", () => {
  it("instant notifies now, digest queues, off stays quiet, and the actor is skipped", async () => {
    const before = { admin: await notes(ids.admin), instant: await notes(ids.instant), digest: await notes(ids.digest), off: await notes(ids.off) };
    const r = await t.post("/api/outreach", { title: "Library demo", date: "2026-11-01", location: "Library" }, sess.admin);
    expect(r.status).toBe(200);
    await until(async () => (await notes(ids.instant)) === before.instant + 1 && (await queued(ids.digest)) === 1);
    expect(await notes(ids.instant)).toBe(before.instant + 1);
    expect(await notes(ids.off)).toBe(before.off);
    expect(await notes(ids.admin)).toBe(before.admin);
    expect(await queued(ids.digest)).toBe(1);
    expect(await queued(ids.off)).toBe(0);
  });

  it("a due digest arrives as one summary and empties the queue", async () => {
    // Age the queued items past the digest window, then let the flush run.
    await t.db.execute({ sql: "UPDATE notification_digest SET created_at = ? WHERE member_id = ?", args: [new Date(Date.now() - 5 * 3600_000).toISOString(), ids.digest] });
    await t.db.execute({
      sql: "INSERT INTO notification_digest (member_id, team_id, kind, content, meta, created_at) VALUES (?, ?, 'event', 'x', '{\"count\":2}', ?)",
      args: [ids.digest, team, new Date().toISOString()],
    });
    const before = await notes(ids.digest);
    await until(async () => (await queued(ids.digest)) === 0 && (await notes(ids.digest)) === before + 1);
    expect(await notes(ids.digest)).toBe(before + 1);
    expect(await queued(ids.digest)).toBe(0);
    const last = (await t.db.execute({ sql: "SELECT content FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1", args: [ids.digest] })).rows[0] as any;
    expect(last.content).toBe("Robo: 1 outreach event and 2 calendar events were added.");
  });
});

describe("@everyone", () => {
  it("skips members who opted out and stops fanning out after 3 pings an hour", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    ws.send(JSON.stringify({ type: "hello", sessionId: sess.admin }));
    await new Promise((r) => setTimeout(r, 400));
    const before = { instant: await notes(ids.instant), off: await notes(ids.off) };
    for (let i = 0; i < 4; i++) {
      ws.send(JSON.stringify({ type: "chat", content: `@everyone standup ${i}` }));
      await new Promise((r) => setTimeout(r, 250));
    }
    await until(async () => (await count("SELECT COUNT(*) AS n FROM messages WHERE content LIKE '@everyone standup %'")) === 4
      && (await notes(ids.instant)) >= before.instant + 3);
    await new Promise((r) => setTimeout(r, 300)); // a 4th fan-out would land by now
    ws.close();
    expect(await notes(ids.instant)).toBe(before.instant + 3);
    expect(await notes(ids.off)).toBe(before.off);
    // All four messages still posted.
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE content LIKE '@everyone standup %'")).toBe(4);
  });
});

describe("admin changes to your roles", () => {
  it("are always delivered to the member they affect", async () => {
    const role = (await t.db.execute({ sql: "SELECT id FROM roles WHERE team_id = ? AND is_system = 0 LIMIT 1", args: [team] })).rows[0] as any
      ?? { id: Number((await t.post("/api/roles", { name: "Drive Team", color: "#3B82F6", permissions: [] }, sess.admin)).body.id) };
    const before = await notes(ids.off); // even with team updates off
    const r = await t.post(`/api/members/${ids.off}/roles`, { role_id: Number(role.id) }, sess.admin);
    expect(r.status).toBe(200);
    await until(async () => (await notes(ids.off)) === before + 1);
    expect(await notes(ids.off)).toBe(before + 1);
  });
});
