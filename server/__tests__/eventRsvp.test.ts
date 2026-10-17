/**
 * Feature parity, Phase 2.2: RSVPs. An event asks for no RSVP, only who can't
 * make it, or a full RSVP, and can be for the whole team or chosen roles.
 * "Can't make it" with a reason excuses the member on that day's attendance;
 * changing the answer takes the excuse back. Bruno answers through an RSVP card.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "", ana = "", ben = "";
let anaId = 0, benId = 0;
let builders = 0;
const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const put = (path: string, body: any, session: string) => t.api(path, { method: "PUT", session, body: JSON.stringify(body), headers: { "x-cp-client": "1" } });

beforeAll(async () => {
  t = await startTestServer("cp-rsvp-");
  team = await seedTeam(t.db, "Robo");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@rsvp.test", "admin"));
  anaId = await seedMember(t.db, team, "Ana", "ana@rsvp.test");
  benId = await seedMember(t.db, team, "Ben", "ben@rsvp.test");
  ana = await t.session(anaId);
  ben = await t.session(benId);
  builders = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Builders', '[]')", args: [team] })).lastInsertRowid);
  await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [anaId, builders] });
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("RSVP", () => {
  it("full RSVP: answers, counts and your own answer in the events list; reasons only for managers", async () => {
    const id = (await t.post("/api/events", { title: "Build night", date: "2099-03-01", start_time: "18:00", rsvp_mode: "full" }, admin)).body.id;
    expect((await put(`/api/events/${id}/rsvp`, { status: "going" }, ana)).status).toBe(200);
    expect((await put(`/api/events/${id}/rsvp`, { status: "maybe", reason: "Might have a test" }, ben)).status).toBe(200);
    expect((await put(`/api/events/${id}/rsvp`, { status: "sometimes" }, ben)).status).toBe(400);
    const list = (await t.api("/api/events", { session: ana })).body;
    const ev = list.find((e: any) => e.id === id);
    expect(ev).toMatchObject({ rsvp_mode: "full", invited: true, rsvp_counts: { going: 1, maybe: 1, not_going: 0 }, my_rsvp: { status: "going" } });
    const asAna = (await t.api(`/api/events/${id}/rsvps`, { session: ana })).body;
    expect(asAna.answers.find((a: any) => a.name === "Ben")).not.toHaveProperty("reason");
    const asAdmin = (await t.api(`/api/events/${id}/rsvps`, { session: admin })).body;
    expect(asAdmin.answers.find((a: any) => a.name === "Ben").reason).toBe("Might have a test");
    expect(asAdmin.no_answer).toBe(1); // Ada
    // Taking it back.
    expect((await put(`/api/events/${id}/rsvp`, { status: null }, ana)).status).toBe(200);
    expect(await rows("SELECT * FROM event_rsvps WHERE event_id = ? AND member_id = ?", id, anaId)).toHaveLength(0);
  });

  it("can't-make-it only: a reason excuses that day (without copying the reason); taking it back removes the excuse", async () => {
    const id = (await t.post("/api/events", { title: "Practice", date: "2099-03-05", rsvp_mode: "decline_only" }, admin)).body.id;
    expect((await put(`/api/events/${id}/rsvp`, { status: "going" }, ana)).status).toBe(400);
    const r = await put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "Dentist" }, ana);
    expect(r.body).toMatchObject({ success: true, excused: true });
    // The private reason stays in the RSVP; attendance (team-readable) only says it came from an RSVP.
    expect((await rows("SELECT status, reason, is_excused, rsvp_event_id FROM attendance WHERE member_id = ? AND date = '2099-03-05'", anaId))[0]).toMatchObject({ status: "E", reason: "Can't make it (RSVP)", is_excused: 1, rsvp_event_id: id });
    expect((await put(`/api/events/${id}/rsvp`, { status: null }, ana)).status).toBe(200);
    expect(await rows("SELECT id FROM attendance WHERE member_id = ? AND date = '2099-03-05'", anaId)).toHaveLength(0);
    // A record that already existed is never overwritten or removed, and the answer says so.
    await t.db.execute({ sql: "INSERT INTO attendance (team_id, member_id, date, status) VALUES (?, ?, '2099-03-05', 'A')", args: [team, benId] });
    expect((await put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "Sick" }, ben)).body.excused).toBe(false);
    expect((await put(`/api/events/${id}/rsvp`, { status: null }, ben)).status).toBe(200);
    expect((await rows("SELECT status FROM attendance WHERE member_id = ? AND date = '2099-03-05'", benId))[0].status).toBe("A");
  });

  it("an excuse follows its event when it moves, goes when it's deleted, and becomes a manager's once they mark that day", async () => {
    const id = (await t.post("/api/events", { title: "Field day", date: "2099-05-01", rsvp_mode: "decline_only" }, admin)).body.id;
    await put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "Trip" }, ana);
    expect((await t.patch(`/api/events/${id}`, { date: "2099-05-02" }, admin)).status).toBe(200);
    expect((await rows("SELECT date FROM attendance WHERE member_id = ? AND rsvp_event_id = ?", anaId, id)).map((r) => r.date)).toEqual(["2099-05-02"]);
    expect((await t.api(`/api/events/${id}`, { method: "DELETE", session: admin, headers: { "x-cp-client": "1" } })).status).toBe(200);
    expect(await rows("SELECT id FROM attendance WHERE member_id = ? AND date IN ('2099-05-01', '2099-05-02')", anaId)).toHaveLength(0);
    // A manager marking the day takes the record over: taking the RSVP back leaves their mark.
    const id2 = (await t.post("/api/events", { title: "Field day 2", date: "2099-05-08", rsvp_mode: "decline_only" }, admin)).body.id;
    await put(`/api/events/${id2}/rsvp`, { status: "not_going", reason: "Trip" }, ana);
    expect((await t.post("/api/attendance/batch", { date: "2099-05-08", records: [{ member_id: anaId, status: "E" }] }, admin)).status).toBe(200);
    await put(`/api/events/${id2}/rsvp`, { status: null }, ana);
    expect((await rows("SELECT status, rsvp_event_id FROM attendance WHERE member_id = ? AND date = '2099-05-08'", anaId))[0]).toMatchObject({ status: "E", rsvp_event_id: null });
  });

  it("moving a whole series by one week keeps every occurrence's excuse", async () => {
    const head = (await t.post("/api/events", { title: "Weekly sync", date: "2099-06-01", rsvp_mode: "decline_only", repeat: { freq: "weekly", interval: 1, count: 2 } }, admin)).body.id;
    const occ = (await rows("SELECT id, date FROM events WHERE series_id = ? ORDER BY date", head)).map((r) => Number(r.id));
    for (const id of occ) await put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "Away" }, ana);
    // The first moves onto the second's old date; the second moves a week on.
    expect((await t.patch(`/api/events/${occ[0]}`, { date: "2099-06-08", scope: "following" }, admin)).status).toBe(200);
    expect((await rows("SELECT date FROM attendance WHERE member_id = ? AND rsvp_event_id IN (?, ?) ORDER BY date", anaId, occ[0], occ[1])).map((r) => r.date)).toEqual(["2099-06-08", "2099-06-15"]);
  });

  it("answers saved at the same time leave the excuse matching the last one", async () => {
    const id = (await t.post("/api/events", { title: "Race day", date: "2099-05-20", rsvp_mode: "full" }, admin)).body.id;
    await Promise.all([
      put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "R1" }, ana),
      put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "R2" }, ana),
      put(`/api/events/${id}/rsvp`, { status: "going" }, ana),
    ]);
    const [rsvp] = await rows("SELECT status FROM event_rsvps WHERE event_id = ? AND member_id = ?", id, anaId);
    const owned = await rows("SELECT id FROM attendance WHERE rsvp_event_id = ? AND member_id = ?", id, anaId);
    expect(owned.length).toBe(rsvp.status === "not_going" ? 1 : 0);
  });

  it("an event for chosen roles: only they can answer, and only they are notified", async () => {
    // Team updates go to the inbox or the digest, depending on each member's settings.
    const heard = async (memberId: number, text: string) => Number((await rows("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND content LIKE ?", memberId, `%${text}%`))[0].n)
      + Number((await rows("SELECT COUNT(*) AS n FROM notification_digest WHERE member_id = ? AND content LIKE ?", memberId, `%${text}%`))[0].n);
    const id = (await t.post("/api/events", { title: "Builders only", date: "2099-03-10", rsvp_mode: "full", attendee_roles: [builders] }, admin)).body.id;
    expect((await put(`/api/events/${id}/rsvp`, { status: "going" }, ben)).status).toBe(400);
    expect((await put(`/api/events/${id}/rsvp`, { status: "going" }, ana)).status).toBe(200);
    expect((await t.api("/api/events", { session: ben })).body.find((e: any) => e.id === id).invited).toBe(false);
    // Notifications go out in the background.
    await vi.waitFor(async () => expect(await heard(anaId, "Builders only")).toBe(1), { timeout: 5000 });
    expect(await heard(benId, "Builders only")).toBe(0);
    // Roles from another team or junk are refused.
    expect((await t.post("/api/events", { title: "Bad", date: "2099-03-11", attendee_roles: [999999] }, admin)).status).toBe(400);
    expect((await t.post("/api/events", { title: "Bad", date: "2099-03-11", rsvp_mode: "maybe-ish" }, admin)).status).toBe(400);
  });

  it("Bruno's RSVP card answers as the confirming member; his lookup shows the counts", async () => {
    const id = (await t.post("/api/events", { title: "Scrimmage day", date: "2099-04-01", rsvp_mode: "full" }, admin)).body.id;
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "event-rsvp", items: [{ id, status: "not_going", reason: "Family trip" }] }] }, ben);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await rows("SELECT status, reason FROM event_rsvps WHERE event_id = ? AND member_id = ?", id, benId))[0]).toMatchObject({ status: "not_going", reason: "Family trip" });
    const noRsvp = (await t.post("/api/events", { title: "No RSVP", date: "2099-04-02" }, admin)).body.id;
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "event-rsvp", items: [{ id: noRsvp, status: "going" }] }] }, ben)).status).toBe(400);
    const out = await runLookups(((sql: string, ...a: any[]) => rows(sql, ...a)) as any, team, "UTC", [{ kind: "events", query: "Scrimmage day" } as any]);
    expect(out).toMatch(/RSVP: 0 going, 0 maybe, 1 can't make it; can't make it: Ben\)/);
    expect(out).not.toMatch(/Family trip/); // reasons stay private
  });
});

describe("RSVP follow-through", () => {
  it("counts who said going and who of them came; Bruno's facts say so", async () => {
    const id = (await t.post("/api/events", { title: "Turnout night", date: "2026-10-10", rsvp_mode: "full" }, admin)).body.id;
    await put(`/api/events/${id}/rsvp`, { status: "going" }, ana);
    await put(`/api/events/${id}/rsvp`, { status: "going" }, ben);
    await t.db.execute({ sql: "INSERT INTO attendance (team_id, member_id, date, status) VALUES (?, ?, '2026-10-10', 'P')", args: [team, anaId] });
    const r = await t.api("/api/attendance/rsvp-turnout?from=2026-10-01&to=2026-10-31", { session: admin });
    expect(r.body.find((x: any) => x.event_id === id)).toMatchObject({ said_going: 2, going_came: 1, came: 1 });
    const { loadWorkspaceFacts, formatWorkspaceFacts } = await import("../workspaceFacts");
    const db = { dbGet: async (sql: string, ...a: any[]) => (await t.db.execute({ sql, args: a })).rows[0], dbAll: async (sql: string, ...a: any[]) => (await t.db.execute({ sql, args: a })).rows as any[] };
    const f = (await loadWorkspaceFacts(db as any, team, "UTC", new Date("2026-10-16T12:00:00Z")))!;
    expect(formatWorkspaceFacts(f)).toMatch(/RSVP follow-through .*1 of 2 who said going came \(50%\)/);
  });
});

describe("event attendance (2.3)", () => {
  const nyNow = (minutesFromNow: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(Date.now() + minutesFromNow * 60_000)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  };

  it("marking the rest absent: only after the late window, only invitees, never over an existing mark", async () => {
    await t.db.execute({ sql: "UPDATE teams SET timezone = 'America/New_York' WHERE id = ?", args: [team] });
    const soon = nyNow(5);
    const early = (await t.post("/api/events", { title: "Not yet", date: soon.date, start_time: soon.time }, admin)).body.id;
    expect((await t.post(`/api/events/${early}/mark-absent`, {}, admin)).status).toBe(400);
    const started = nyNow(-30);
    if (started.date !== nyNow(0).date) return; // just after midnight: no "today" event 30 minutes ago
    const id = (await t.post("/api/events", { title: "Builders practice", date: started.date, start_time: started.time, attendee_roles: [builders] }, admin)).body.id;
    expect((await t.post(`/api/events/${id}/mark-absent`, {}, ana)).status).toBe(403);
    const r = await t.post(`/api/events/${id}/mark-absent`, {}, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await rows("SELECT status FROM attendance WHERE member_id = ? AND date = ?", anaId, started.date))[0]?.status).toBe("U");
    expect(await rows("SELECT id FROM attendance WHERE member_id = ? AND date = ?", benId, started.date)).toHaveLength(0); // not a builder
    // An arrival in the meantime is kept.
    await t.db.execute({ sql: "UPDATE attendance SET status = 'P' WHERE member_id = ? AND date = ?", args: [anaId, started.date] });
    expect((await t.post(`/api/events/${id}/mark-absent`, {}, admin)).body.marked).toBe(0);
    expect((await rows("SELECT status FROM attendance WHERE member_id = ? AND date = ?", anaId, started.date))[0].status).toBe("P");
  });

  it("follow-through leaves out today's events; Bruno gets names with any characters", async () => {
    const today = nyNow(0).date;
    const id = (await t.post("/api/events", { title: "Tonight", date: today, rsvp_mode: "full" }, admin)).body.id;
    await put(`/api/events/${id}/rsvp`, { status: "going" }, ben);
    const rowsNow = (await t.api(`/api/attendance/rsvp-turnout?from=${today}&to=${today}`, { session: admin })).body;
    expect(Array.isArray(rowsNow) ? rowsNow.some((x: any) => x.event_id === id) : false).toBe(false);
    await t.db.execute({ sql: "UPDATE members SET name = 'Ben | Build' WHERE id = ?", args: [benId] });
    const out = await runLookups(((sql: string, ...a: any[]) => rows(sql, ...a)) as any, team, "America/New_York", [{ kind: "events", query: "Tonight" } as any]);
    expect(out).toMatch(/going: Ben \| Build/);
    await t.db.execute({ sql: "UPDATE members SET name = 'Ben' WHERE id = ?", args: [benId] });
  });
});
