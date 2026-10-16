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

  it("can't-make-it only: a reason excuses that day; changing the answer takes the excuse back", async () => {
    const id = (await t.post("/api/events", { title: "Practice", date: "2099-03-05", rsvp_mode: "decline_only" }, admin)).body.id;
    expect((await put(`/api/events/${id}/rsvp`, { status: "going" }, ana)).status).toBe(400);
    expect((await put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "Dentist" }, ana)).status).toBe(200);
    expect((await rows("SELECT status, reason, is_excused FROM attendance WHERE member_id = ? AND date = '2099-03-05'", anaId))[0]).toMatchObject({ status: "E", reason: "RSVP: Dentist", is_excused: 1 });
    expect((await put(`/api/events/${id}/rsvp`, { status: null }, ana)).status).toBe(200);
    expect(await rows("SELECT id FROM attendance WHERE member_id = ? AND date = '2099-03-05'", anaId)).toHaveLength(0);
    // A record someone already took is never overwritten (or removed).
    await t.db.execute({ sql: "INSERT INTO attendance (team_id, member_id, date, status) VALUES (?, ?, '2099-03-05', 'P')", args: [team, benId] });
    expect((await put(`/api/events/${id}/rsvp`, { status: "not_going", reason: "Sick" }, ben)).status).toBe(200);
    expect((await put(`/api/events/${id}/rsvp`, { status: null }, ben)).status).toBe(200);
    expect((await rows("SELECT status FROM attendance WHERE member_id = ? AND date = '2099-03-05'", benId))[0].status).toBe("P");
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
    expect(out).toMatch(/RSVP: 0 going, 0 maybe, 1 can't make it/);
  });
});
