/**
 * Google Calendar sync against a fake Google (token, revoke and Calendar API):
 * timed events carry the team's time zone, edits send dates and times, the
 * switch is per team, turning it on sends upcoming events, unlinking deletes
 * the copies and revokes the grant, a server-side token error doesn't unlink
 * anyone, and links from before the fix are reset once.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { googleEventBody, isDeadRefreshToken } from "../googleCalendar";
import { calendarKeyFromEnv, encryptCalendarToken } from "../calendarTokens";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 60_000 });

describe("the Google copy of an event", () => {
  const ev = { title: "Build", description: "Bring tools", location: "Shop", date: "2099-03-01" };
  it("timed events carry the team's time zone", () => {
    expect(googleEventBody({ ...ev, start_time: "16:00", end_time: "17:30" }, "America/Chicago")).toMatchObject({
      summary: "Build", location: "Shop",
      start: { dateTime: "2099-03-01T16:00:00", timeZone: "America/Chicago" },
      end: { dateTime: "2099-03-01T17:30:00", timeZone: "America/Chicago" },
    });
  });
  it("no end time means one hour; an end before the start runs past midnight", () => {
    expect(googleEventBody({ ...ev, start_time: "23:30", end_time: "" }, "UTC")).toMatchObject({
      end: { dateTime: "2099-03-02T00:30:00", timeZone: "UTC" },
    });
    expect(googleEventBody({ ...ev, start_time: "22:00", end_time: "01:00" }, "UTC")).toMatchObject({
      end: { dateTime: "2099-03-02T01:00:00" },
    });
  });
  it("events without a time are all-day", () => {
    expect(googleEventBody({ ...ev, start_time: "" }, "UTC")).toMatchObject({ start: { date: "2099-03-01" }, end: { date: "2099-03-02" } });
  });
  it("only invalid_grant means the refresh token is dead", () => {
    expect(isDeadRefreshToken(400, { error: "invalid_grant" })).toBe(true);
    expect(isDeadRefreshToken(400, { error: "invalid_client" })).toBe(false);
    expect(isDeadRefreshToken(500, { error: "invalid_grant" })).toBe(false);
  });
});

type Call = { method: string; path: string; body: any };
const KEY = "c".repeat(40);

describe("sync against a fake Google", () => {
  let google: Server;
  let calls: Call[] = [];
  let n = 0;
  let t: TestServer;
  const teams: Record<string, number> = {};
  const members: Record<string, number> = {};
  const sessions: Record<string, string> = {};

  const q = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
  const link = (memberId: number, refresh: string, linkedAt = "2026-10-12 10:00:00") => t.db.execute({
    sql: "INSERT OR REPLACE INTO google_calendar_links (member_id, google_email, refresh_token, linked_at) VALUES (?, 'x@gmail.test', ?, ?)",
    args: [memberId, encryptCalendarToken(refresh, calendarKeyFromEnv(KEY)!), linkedAt],
  });
  const waitFor = async (pred: () => boolean | Promise<boolean>, ms = 15_000) => {
    for (const end = Date.now() + ms; Date.now() < end;) {
      if (await pred()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  const eventCalls = (method: string) => calls.filter((c) => c.method === method && c.path.startsWith("/calendar/v3/calendars/primary/events"));

  beforeAll(async () => {
    google = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = req.headers["content-type"]?.includes("json") ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
        calls.push({ method: req.method!, path: req.url!, body });
        const json = (status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
        if (req.url === "/token") {
          if (body.refresh_token === "dead") return json(400, { error: "invalid_grant" });
          if (body.refresh_token === "misconfigured") return json(401, { error: "invalid_client" });
          return json(200, { access_token: `at-${body.refresh_token}`, expires_in: 3600 });
        }
        if (req.url === "/revoke") return json(200, {});
        if (req.method === "POST") return json(200, { id: `g${++n}` });
        if (req.method === "PATCH") return json(200, {});
        if (req.method === "DELETE") { res.writeHead(204); return res.end(); }
        json(404, {});
      });
    });
    await new Promise<void>((r) => google.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(google.address() as any).port}`;
    t = await startTestServer("cp-gcal-", {
      CALENDAR_TOKEN_KEY: KEY, GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret",
      GOOGLE_CALENDAR_API_BASE: `${base}/calendar/v3`, GOOGLE_TOKEN_URL: `${base}/token`, GOOGLE_REVOKE_URL: `${base}/revoke`,
      CALENDAR_RESET_DELAY_MS: "12000",
    });
    // Links from before the fix, queued for the one-time reset (the queue
    // was filled by migration 128 at boot; this stands in for it).
    teams.old = await seedTeam(t.db, "Old");
    members.old = await seedMember(t.db, teams.old, "Olu", "olu@gcal.test");
    await link(members.old, "old-token", "2026-10-01 09:00:00");
    await t.db.execute({ sql: "INSERT INTO event_calendar_sync (event_id, member_id, google_event_id) SELECT id, ?, 'g-old' FROM events LIMIT 0", args: [members.old] });
    await t.db.execute({ sql: "INSERT INTO calendar_links_to_reset (member_id, linked_at) VALUES (?, '2026-10-01 09:00:00')", args: [members.old] });

    for (const name of ["a", "b", "c"]) {
      teams[name] = await seedTeam(t.db, `Team ${name}`);
      await t.db.execute({ sql: "UPDATE teams SET timezone = 'America/Chicago' WHERE id = ?", args: [teams[name]] });
      members[name] = await seedMember(t.db, teams[name], `Admin ${name}`, `admin-${name}@gcal.test`, "admin");
      sessions[name] = await t.session(members[name]);
      await link(members[name], `rt-${name}`);
    }
  }, 120_000);
  afterAll(async () => { await t?.stop(); google?.close(); });

  it("turning sync on is per team", async () => {
    const r = await t.api("/api/calendar/team-sync", { method: "PUT", body: JSON.stringify({ enabled: true }), session: sessions.a });
    expect(r.status).toBe(200);
    const rows = await q("SELECT id, google_calendar_sync FROM teams WHERE id IN (?, ?)", teams.a, teams.b);
    expect(Object.fromEntries(rows.map((x) => [Number(x.id), Number(x.google_calendar_sync)]))).toEqual({ [teams.a]: 1, [teams.b]: 0 });
    const status = await t.api("/api/calendar/link", { session: sessions.a });
    expect(status.body).toMatchObject({ linked: true, team_sync_enabled: true, can_manage_sync: true });
  });

  it("a new timed event reaches Google with the team's time zone", async () => {
    calls = [];
    const created = await t.post("/api/events", { title: "Build", date: "2099-03-01", start_time: "16:00", end_time: "17:30", event_type: "meeting" }, sessions.a);
    expect(created.status).toBe(200);
    expect(await waitFor(async () => (await q("SELECT 1 FROM event_calendar_sync WHERE event_id = ?", created.body.id)).length === 1)).toBe(true);
    expect(eventCalls("POST")[0].body).toMatchObject({
      summary: "Build",
      start: { dateTime: "2099-03-01T16:00:00", timeZone: "America/Chicago" },
      end: { dateTime: "2099-03-01T17:30:00", timeZone: "America/Chicago" },
    });
  });

  it("another team's events don't sync while its switch is off", async () => {
    calls = [];
    const created = await t.post("/api/events", { title: "Scrimmage", date: "2099-03-02", start_time: "10:00", end_time: "12:00", event_type: "meeting" }, sessions.b);
    expect(created.status).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));
    expect(eventCalls("POST")).toHaveLength(0);
  });

  it("an edit sends the new date and times", async () => {
    const ev = (await q("SELECT e.id, s.google_event_id FROM events e JOIN event_calendar_sync s ON s.event_id = e.id WHERE e.team_id = ?", teams.a))[0];
    calls = [];
    const r = await t.patch(`/api/events/${ev.id}`, { date: "2099-03-05", start_time: "18:00", end_time: "19:00" }, sessions.a);
    expect(r.status).toBe(200);
    expect(await waitFor(() => eventCalls("PATCH").length === 1)).toBe(true);
    const patch = eventCalls("PATCH")[0];
    expect(patch.path).toContain(encodeURIComponent(ev.google_event_id));
    expect(patch.body).toMatchObject({ start: { dateTime: "2099-03-05T18:00:00", timeZone: "America/Chicago" }, end: { dateTime: "2099-03-05T19:00:00" } });
  });

  it("turning sync on sends the team's upcoming events (and only those)", async () => {
    await t.db.execute({ sql: "INSERT INTO events (title, date, start_time, end_time, team_id) VALUES ('Past', '2000-01-01', '', '', ?), ('Kickoff', '2099-04-01', '', '', ?)", args: [teams.c, teams.c] });
    calls = [];
    const r = await t.api("/api/calendar/team-sync", { method: "PUT", body: JSON.stringify({ enabled: true }), session: sessions.c });
    expect(r.status).toBe(200);
    expect(await waitFor(() => eventCalls("POST").length >= 1)).toBe(true);
    await new Promise((r2) => setTimeout(r2, 500));
    expect(eventCalls("POST").map((c) => c.body.summary)).toEqual(["Kickoff"]);
  });

  it("unlinking deletes the copies and revokes the grant", async () => {
    const copies = await q("SELECT google_event_id FROM event_calendar_sync WHERE member_id = ?", members.c);
    expect(copies.length).toBe(1);
    calls = [];
    const r = await t.api("/api/calendar/link", { method: "DELETE", session: sessions.c });
    expect(r.status).toBe(200);
    expect(await q("SELECT 1 FROM google_calendar_links WHERE member_id = ?", members.c)).toHaveLength(0);
    expect(await waitFor(() => calls.some((c) => c.path === "/revoke"))).toBe(true);
    expect(eventCalls("DELETE").map((c) => c.path)).toEqual([`/calendar/v3/calendars/primary/events/${copies[0].google_event_id}`]);
    expect(calls.find((c) => c.path === "/revoke")!.body.token).toBe("rt-c");
  });

  it("a server-side token error keeps the link; a dead token drops it", async () => {
    await link(members.b, "misconfigured");
    await t.api("/api/calendar/team-sync", { method: "PUT", body: JSON.stringify({ enabled: true }), session: sessions.b });
    await new Promise((r) => setTimeout(r, 1500));
    expect(await q("SELECT 1 FROM google_calendar_links WHERE member_id = ?", members.b)).toHaveLength(1);
    await link(members.b, "dead");
    await t.post("/api/events", { title: "Dead", date: "2099-05-01", event_type: "meeting" }, sessions.b);
    expect(await waitFor(async () => (await q("SELECT 1 FROM google_calendar_links WHERE member_id = ?", members.b)).length === 0)).toBe(true);
  });

  it("links from before the fix are reset once", async () => {
    expect(await waitFor(async () => (await q("SELECT 1 FROM calendar_links_to_reset")).length === 0, 30_000)).toBe(true);
    expect(await q("SELECT 1 FROM google_calendar_links WHERE member_id = ?", members.old)).toHaveLength(0);
  });
});
