/**
 * V3.5 calendar: repeating events (one row per occurrence, edit/delete this
 * one, this and following, or the whole series), reminders (one inbox
 * notification per member, sent once), and the ICS subscribe feed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let otherTeam = 0;
let admin = "";
let adminId = 0;
let member = "";
let memberId = 0;
let outsider = "";
beforeAll(async () => {
  t = await startTestServer("cp-cal35-", { EVENT_REMINDER_SWEEP_MS: "400" });
  team = await seedTeam(t.db, "Robo");
  otherTeam = await seedTeam(t.db, "Other");
  await t.db.execute({ sql: "UPDATE teams SET timezone = 'America/New_York' WHERE id = ?", args: [team] });
  adminId = await seedMember(t.db, team, "Ada", "ada@cal35.test", "admin");
  admin = await t.session(adminId);
  memberId = await seedMember(t.db, team, "Arnav", "arnav@cal35.test");
  member = await t.session(memberId);
  outsider = await t.session(await seedMember(t.db, otherTeam, "Olu", "olu@cal35.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const series = (id: number) => rows("SELECT * FROM events WHERE series_id = ? ORDER BY date", id);
const del = (path: string, session: string) => t.api(path, { method: "DELETE", session, headers: { "x-cp-client": "1" } });

describe("repeating events", () => {
  it("creates one row per occurrence sharing a series id", async () => {
    const r = await t.post("/api/events", {
      title: "Build session", date: "2099-01-03", start_time: "10:00", end_time: "16:00", location: "Shop",
      event_type: "meeting", repeat: { freq: "weekly", interval: 1, count: 4 }, reminder_minutes: 60,
    }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.count).toBe(4);
    const all = await series(r.body.id);
    expect(all.map((e) => e.date)).toEqual(["2099-01-03", "2099-01-10", "2099-01-17", "2099-01-24"]);
    for (const e of all) {
      expect(e).toMatchObject({ title: "Build session", start_time: "10:00", end_time: "16:00", location: "Shop", reminder_minutes: 60, team_id: team });
      expect(JSON.parse(e.recurrence)).toEqual({ freq: "weekly", interval: 1, count: 4 });
    }
  });

  it("rejects a bad rule or an end date before the start", async () => {
    expect((await t.post("/api/events", { title: "x", date: "2099-02-01", repeat: { freq: "yearly" } }, admin)).status).toBe(400);
    expect((await t.post("/api/events", { title: "x", date: "2099-02-01", repeat: { freq: "weekly", until: "2099-01-01" } }, admin)).status).toBe(400);
  });

  it("edits just one occurrence, or this and following (dates shift together)", async () => {
    const r = await t.post("/api/events", { title: "Standup", date: "2099-03-01", start_time: "18:00", repeat: { freq: "daily", interval: 1, count: 5 } }, admin);
    const all = await series(r.body.id);
    // Just one.
    expect((await t.patch(`/api/events/${all[1].id}`, { title: "Standup (short)" }, admin)).status).toBe(200);
    expect((await series(r.body.id)).map((e) => e.title)).toEqual(["Standup", "Standup (short)", "Standup", "Standup", "Standup"]);
    // This and following, moved a day later at a new time.
    const f = await t.patch(`/api/events/${all[2].id}`, { title: "Late standup", date: "2099-03-04", start_time: "19:00", scope: "following" }, admin);
    expect(f.body.updated).toBe(3);
    const after = await series(r.body.id);
    expect(after.map((e) => [e.date, e.title, e.start_time])).toEqual([
      ["2099-03-01", "Standup", "18:00"],
      ["2099-03-02", "Standup (short)", "18:00"],
      ["2099-03-04", "Late standup", "19:00"],
      ["2099-03-05", "Late standup", "19:00"],
      ["2099-03-06", "Late standup", "19:00"],
    ]);
  });

  it("a this-and-following edit is checked on every occurrence; a bad one changes nothing", async () => {
    const r = await t.post("/api/events", { title: "Scrim", date: "2099-07-01", start_time: "10:00", end_time: "11:00", repeat: { freq: "daily", interval: 1, count: 3 } }, admin);
    const all = await series(r.body.id);
    // The first occurrence runs longer; the later ones still end at 11:00.
    await t.patch(`/api/events/${all[0].id}`, { end_time: "12:00" }, admin);
    const bad = await t.patch(`/api/events/${all[0].id}`, { start_time: "11:30", scope: "following" }, admin);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/End time must be after the start time \(on 2099-07-02\)/);
    expect((await series(r.body.id)).map((e) => [e.start_time, e.end_time])).toEqual([["10:00", "12:00"], ["10:00", "11:00"], ["10:00", "11:00"]]);
  });

  it("the series head and its followers are written together", async () => {
    const r = await t.post("/api/events", { title: "Atomic", date: "2099-09-01", repeat: { freq: "weekly", interval: 1, count: 3 } }, admin);
    const all = await series(r.body.id);
    expect(all).toHaveLength(3);
    expect(all.every((e) => Number(e.series_id) === r.body.id)).toBe(true);
    expect(Number(all[0].id)).toBe(r.body.id);
  });

  it("changing the rule replaces later occurrences; a one-off can become a series", async () => {
    const r = await t.post("/api/events", { title: "Review", date: "2099-04-01", repeat: { freq: "weekly", interval: 1, count: 6 } }, admin);
    const all = await series(r.body.id);
    await t.patch(`/api/events/${all[2].id}`, { repeat: { freq: "weekly", interval: 2, count: 2 }, scope: "following" }, admin);
    expect((await series(r.body.id)).map((e) => e.date)).toEqual(["2099-04-01", "2099-04-08", "2099-04-15", "2099-04-29"]);
    // Stop repeating from the 3rd on: only the first three remain.
    await t.patch(`/api/events/${all[2].id}`, { repeat: null, scope: "following" }, admin);
    expect((await series(r.body.id)).map((e) => e.date)).toEqual(["2099-04-01", "2099-04-08", "2099-04-15"]);

    const one = await t.post("/api/events", { title: "Kickoff", date: "2099-05-01" }, admin);
    await t.patch(`/api/events/${one.body.id}`, { repeat: { freq: "monthly", interval: 1, count: 3 } }, admin);
    expect((await series(one.body.id)).map((e) => e.date)).toEqual(["2099-05-01", "2099-06-01", "2099-07-01"]);
  });

  it("deletes one, this and following, or the whole series; never another team's", async () => {
    const r = await t.post("/api/events", { title: "Drive practice", date: "2099-06-01", repeat: { freq: "daily", interval: 1, count: 5 } }, admin);
    const all = await series(r.body.id);
    expect((await del(`/api/events/${all[0].id}?scope=all`, outsider)).status).toBe(404);
    expect((await del(`/api/events/${all[4].id}`, admin)).body.deleted).toBe(1);
    expect((await del(`/api/events/${all[2].id}?scope=following`, admin)).body.deleted).toBe(2);
    expect((await series(r.body.id)).map((e) => e.date)).toEqual(["2099-06-01", "2099-06-02"]);
    expect((await del(`/api/events/${all[1].id}?scope=all`, admin)).body.deleted).toBe(2);
    expect(await series(r.body.id)).toHaveLength(0);
  });
});

describe("reminders", () => {
  it("sends one notification per member when the lead time arrives, once", async () => {
    // Starts 20 minutes from now in the team's timezone, 30-minute reminder: due now.
    const at = new Date(Date.now() + 20 * 60_000);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at).map((x) => [x.type, x.value]));
    const r = await t.post("/api/events", { title: "Pit check", date: `${p.year}-${p.month}-${p.day}`, start_time: `${p.hour}:${p.minute}`, reminder_minutes: 30 }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    let got: any[] = [];
    for (let i = 0; i < 40 && got.length < 2; i++) {
      await new Promise((res) => setTimeout(res, 250));
      got = await rows("SELECT user_id, content FROM notifications WHERE content LIKE 'Reminder: Pit check%'");
    }
    expect(got.map((n) => Number(n.user_id)).sort()).toEqual([adminId, memberId].sort());
    expect(got[0].content).toBe("Reminder: Pit check starts in 30 minutes");
    await new Promise((res) => setTimeout(res, 1200));
    expect(await rows("SELECT id FROM notifications WHERE content LIKE 'Reminder: Pit check%'")).toHaveLength(2);
    // A new time re-arms it.
    await t.patch(`/api/events/${r.body.id}`, { date: "2099-12-01" }, admin);
    expect((await rows("SELECT reminder_sent_at FROM events WHERE id = ?", r.body.id))[0].reminder_sent_at).toBeNull();
  });

  it("does not remind for events far in the future", async () => {
    const r = await t.post("/api/events", { title: "Far away", date: "2099-08-01", start_time: "10:00", reminder_minutes: 10 }, admin);
    await new Promise((res) => setTimeout(res, 1000));
    expect((await rows("SELECT reminder_sent_at FROM events WHERE id = ?", r.body.id))[0].reminder_sent_at).toBeNull();
  });
});

describe("ICS subscribe feed", () => {
  it("gives each member a private URL that serves the team calendar", async () => {
    expect((await t.api("/api/calendar/feed", { session: member })).body.url).toBeNull();
    const made = await t.post("/api/calendar/feed", {}, member);
    expect(made.status).toBe(200);
    const url: string = made.body.url;
    expect(url).toMatch(/\/api\/calendar\/feed\/[A-Za-z0-9_-]{24,}\.ics$/);
    // Same URL on a second call, until it's reset.
    expect((await t.post("/api/calendar/feed", {}, member)).body.url).toBe(url);
    const path = new URL(url).pathname;
    const res = await fetch(`${t.base}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/calendar/);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Build session");
    expect(body).toContain("X-WR-CALNAME:Robo · Control Point");
    // Reset: the old URL stops working.
    const fresh = (await t.post("/api/calendar/feed", { reset: true }, member)).body.url;
    expect(fresh).not.toBe(url);
    expect((await fetch(`${t.base}${path}`)).status).toBe(404);
    expect((await fetch(`${t.base}${new URL(fresh).pathname}`)).status).toBe(200);
    // Leaving the workspace kills the feed.
    await t.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [memberId] });
    expect((await fetch(`${t.base}${new URL(fresh).pathname}`)).status).toBe(404);
    await t.db.execute({ sql: "UPDATE members SET is_active = 1 WHERE id = ?", args: [memberId] });
    expect((await fetch(`${t.base}/api/calendar/feed/not-a-token.ics`)).status).toBe(404);
  });

  it("never includes another team's events", async () => {
    await t.post("/api/events", { title: "Secret other-team event", date: "2099-01-05" }, outsider);
    const url = (await t.post("/api/calendar/feed", {}, admin)).body.url;
    const body = await (await fetch(`${t.base}${new URL(url).pathname}`)).text();
    expect(body).not.toContain("Secret other-team event");
  });
});
