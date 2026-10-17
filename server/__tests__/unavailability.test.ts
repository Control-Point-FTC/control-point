/**
 * Feature parity, Phase 2.4: unavailable times. Members mark when they can't
 * be there (a range of days or a weekly slot); the team sees who is away on
 * clashing events, the note stays private to the member and attendance
 * managers, and Bruno can list them and add or remove the member's own.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { cleanUnavailability, coversSlot, describeUnavailability, overlapsRange } from "../../src/utils/unavailability";

vi.setConfig({ testTimeout: 30_000 });

describe("unavailability rules", () => {
  it("validates ranges, weekly slots and times", () => {
    expect(cleanUnavailability({ start_date: "2026-12-05", end_date: "2026-12-07" })).toEqual({ value: { start_date: "2026-12-05", end_date: "2026-12-07", weekday: null, start_time: null, end_time: null, note: "" } });
    expect(cleanUnavailability({ start_date: "2026-12-05" })).toMatchObject({ value: { end_date: "2026-12-05" } });
    expect(cleanUnavailability({ weekday: 2, start_date: "2026-10-20", start_time: "16:00", end_time: "18:00" })).toMatchObject({ value: { weekday: 2, end_date: null } });
    expect(cleanUnavailability({ start_date: "2026-12-07", end_date: "2026-12-05" })).toHaveProperty("error");
    expect(cleanUnavailability({ start_date: "2026-02-30" })).toHaveProperty("error");
    expect(cleanUnavailability({ start_date: "2026-01-01", end_date: "2027-01-01" })).toHaveProperty("error");
    expect(cleanUnavailability({ start_date: "2026-12-05", start_time: "16:00" })).toHaveProperty("error");
    expect(cleanUnavailability({ start_date: "2026-12-05", start_time: "18:00", end_time: "16:00" })).toHaveProperty("error");
    expect(cleanUnavailability({ weekday: 7, start_date: "2026-12-05" })).toHaveProperty("error");
  });
  it("clashes: dates, weekdays and overlapping times", () => {
    const trip = { start_date: "2026-12-05", end_date: "2026-12-07", weekday: null, start_time: null, end_time: null };
    expect(coversSlot(trip, "2026-12-06", "18:00", "20:00")).toBe(true);
    expect(coversSlot(trip, "2026-12-08", null, null)).toBe(false);
    // Tuesdays 4–6 PM (2026-10-20 is a Tuesday).
    const piano = { start_date: "2026-10-20", end_date: null, weekday: 2, start_time: "16:00", end_time: "18:00" };
    expect(coversSlot(piano, "2026-10-27", "17:00", "19:00")).toBe(true);
    expect(coversSlot(piano, "2026-10-27", "18:00", "20:00")).toBe(false);
    expect(coversSlot(piano, "2026-10-28", "17:00", "19:00")).toBe(false); // a Wednesday
    expect(coversSlot(piano, "2026-10-27", null, null)).toBe(true); // all-day event that day
    expect(coversSlot(piano, "2026-10-13", "17:00", "19:00")).toBe(false); // before it starts
    expect(coversSlot(piano, "2026-10-27", "15:30", null)).toBe(true); // a start-only event runs an hour
    expect(overlapsRange(piano, "2026-10-21", "2026-10-26")).toBe(false); // Wed..Mon, no Tuesday
    expect(overlapsRange(piano, "2026-10-21", "2026-10-27")).toBe(true);
    expect(describeUnavailability(piano)).toBe("Tuesdays 4 PM – 6 PM from Oct 20");
    expect(describeUnavailability({ ...piano, end_date: "2027-01-09" })).toBe("Tuesdays 4 PM – 6 PM from Oct 20 until Jan 9");
    expect(describeUnavailability(trip)).toBe("Dec 5 – Dec 7");
  });
});

let t: TestServer;
let team = 0, other = 0;
let admin = "", ana = "", ben = "", stranger = "";
let anaId = 0, benId = 0;
const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const del = (path: string, session: string) => t.api(path, { method: "DELETE", session, headers: { "x-cp-client": "1" } });

beforeAll(async () => {
  t = await startTestServer("cp-away-");
  team = await seedTeam(t.db, "Robo");
  other = await seedTeam(t.db, "Other");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@away.test", "admin"));
  anaId = await seedMember(t.db, team, "Ana", "ana@away.test");
  benId = await seedMember(t.db, team, "Ben", "ben@away.test");
  ana = await t.session(anaId);
  ben = await t.session(benId);
  stranger = await t.session(await seedMember(t.db, other, "Zed", "zed@away.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("unavailable times", () => {
  it("only current entries count toward the limit, and a card at the limit saves nothing", async () => {
    const cy = await seedMember(t.db, team, "Cy", "cy@away.test");
    const cySession = await t.session(cy);
    // 100 ended entries don't block a new one.
    for (let i = 0; i < 100; i++) await t.db.execute({ sql: "INSERT INTO member_unavailability (team_id, member_id, start_date, end_date, created_at) VALUES (?, ?, '2001-01-01', '2001-01-02', 'x')", args: [team, cy] });
    expect((await t.post("/api/unavailability", { start_date: "2099-05-01" }, cySession)).status).toBe(200);
    // 99 more current ones fill the limit.
    for (let i = 0; i < 99; i++) await t.db.execute({ sql: "INSERT INTO member_unavailability (team_id, member_id, start_date, end_date, created_at) VALUES (?, ?, '2099-06-01', '2099-06-02', 'x')", args: [team, cy] });
    const r = await t.post("/api/unavailability", { start_date: "2099-05-02" }, cySession);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/current unavailable times/);
    // A Bruno card that would pass it saves none of its entries.
    const before = (await rows("SELECT COUNT(*) AS n FROM member_unavailability WHERE member_id = ?", cy))[0].n;
    const card = await t.post("/api/ai/apply-actions", { actions: [{ kind: "away", items: [{ start_date: "2099-07-01" }, { start_date: "2099-07-02" }] }] }, cySession);
    expect(card.status).toBe(400);
    expect((await rows("SELECT COUNT(*) AS n FROM member_unavailability WHERE member_id = ?", cy))[0].n).toBe(before);
    // Removing one and adding one in the same card fits.
    const one = (await rows("SELECT id FROM member_unavailability WHERE member_id = ? AND start_date = '2099-06-01' LIMIT 1", cy))[0].id;
    const swap = await t.post("/api/ai/apply-actions", { actions: [{ kind: "away", items: [{ remove: one }, { start_date: "2099-07-03" }] }] }, cySession);
    expect(swap.status).toBe(200);
    expect(swap.body.applied.away).toBe(2);
    await t.db.execute({ sql: "DELETE FROM member_unavailability WHERE member_id = ?", args: [cy] });
  });

  it("members add their own; everyone sees who and when; notes only for the member and managers", async () => {
    const r = await t.post("/api/unavailability", { start_date: "2099-12-05", end_date: "2099-12-07", note: "Family trip" }, ana);
    expect(r.status).toBe(200);
    expect((await t.post("/api/unavailability", { start_date: "2099-12-07", end_date: "2099-12-05" }, ana)).status).toBe(400);
    // Only managers add for someone else.
    expect((await t.post("/api/unavailability", { member_id: anaId, start_date: "2099-12-10" }, ben)).status).toBe(403);
    expect((await t.post("/api/unavailability", { member_id: benId, weekday: 2, start_date: "2099-01-01", start_time: "16:00", end_time: "18:00", note: "Piano" }, admin)).status).toBe(200);
    const q = "/api/unavailability?from=2099-01-01&to=2099-12-31";
    const asBen = (await t.api(q, { session: ben })).body;
    const anaTrip = asBen.items.find((u: any) => u.member_name === "Ana");
    expect(anaTrip).toMatchObject({ start_date: "2099-12-05", end_date: "2099-12-07" });
    expect(anaTrip).not.toHaveProperty("note");
    expect(asBen.items.find((u: any) => u.member_name === "Ben").note).toBe("Piano");
    expect(asBen.can_manage).toBe(false);
    const asAdmin = (await t.api(q, { session: admin })).body;
    expect(asAdmin.items.find((u: any) => u.member_name === "Ana").note).toBe("Family trip");
    // Another team sees none of it.
    expect((await t.api(q, { session: stranger })).body.items).toEqual([]);
  });

  it("members remove only their own; attendance managers anyone's", async () => {
    const id = (await t.post("/api/unavailability", { start_date: "2099-11-01" }, ana)).body.id;
    expect((await del(`/api/unavailability/${id}`, ben)).status).toBe(403);
    expect((await del(`/api/unavailability/${id}`, stranger)).status).toBe(404);
    expect((await del(`/api/unavailability/${id}`, ana)).status).toBe(200);
    const id2 = (await t.post("/api/unavailability", { start_date: "2099-11-02" }, ana)).body.id;
    expect((await del(`/api/unavailability/${id2}`, admin)).status).toBe(200);
    expect(await rows("SELECT * FROM member_unavailability WHERE id IN (?, ?)", id, id2)).toHaveLength(0);
  });

  it("removed members drop out of the list", async () => {
    const gone = await seedMember(t.db, team, "Gil", "gil@away.test");
    await t.post("/api/unavailability", { start_date: "2099-10-01" }, await t.session(gone));
    await t.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [gone] });
    const list = (await t.api("/api/unavailability?from=2099-01-01&to=2099-12-31", { session: admin })).body.items;
    expect(list.some((u: any) => u.member_name === "Gil")).toBe(false);
  });

  it("Bruno: events show who's away, availability lists entries (no notes), and an away card adds or removes the member's own", async () => {
    await t.post("/api/events", { title: "Tuesday build", date: "2099-03-03", start_time: "17:00", end_time: "19:00" }, admin);
    const db = ((sql: string, ...a: any[]) => rows(sql, ...a)) as any;
    const ev = await runLookups(db, team, "UTC", [{ kind: "events", query: "Tuesday build" } as any]);
    expect(ev).toMatch(/away: Ben/); // Ben's Tuesday piano slot (2099-03-03 is a Tuesday)
    const list = await runLookups(db, team, "UTC", [{ kind: "availability", from: "2099-12-01", to: "2099-12-31" } as any]);
    expect(list).toMatch(/Ana unavailable 2099-12-05 to 2099-12-07, all day/);
    expect(list).not.toMatch(/Family trip/);
    expect(list).toMatch(/Ben unavailable every Tuesday/);
    // Filtered to one person (the LIKE needs a real escape character).
    const anaOnly = await runLookups(db, team, "UTC", [{ kind: "availability", from: "2099-01-01", to: "2099-12-31", person: "ana" } as any]);
    expect(anaOnly).toMatch(/Ana unavailable 2099-12-05/);
    expect(anaOnly).not.toMatch(/Ben unavailable/);

    const add = await t.post("/api/ai/apply-actions", { actions: [{ kind: "away", items: [{ start_date: "2099-08-10", end_date: "2099-08-12", note: "Camp" }] }] }, ben);
    expect(add.status).toBe(200);
    expect(add.body.applied.away).toBe(1);
    const mine = await rows("SELECT * FROM member_unavailability WHERE member_id = ? AND start_date = '2099-08-10'", benId);
    expect(mine).toHaveLength(1);
    // A bad entry saves nothing, and Ben can't remove Ana's through Bruno.
    const anaRow = (await rows("SELECT id FROM member_unavailability WHERE member_id = ? LIMIT 1", anaId))[0];
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "away", items: [{ start_date: "2099-08-20" }, { start_date: "nope" }] }] }, ben)).status).toBe(400);
    expect(await rows("SELECT * FROM member_unavailability WHERE start_date = '2099-08-20'")).toHaveLength(0);
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "away", items: [{ remove: anaRow.id }] }] }, ben)).status).toBe(400);
    const rm = await t.post("/api/ai/apply-actions", { actions: [{ kind: "away", items: [{ remove: mine[0].id }] }] }, ben);
    expect(rm.body.applied.away).toBe(1);
    expect(await rows("SELECT * FROM member_unavailability WHERE id = ?", mine[0].id)).toHaveLength(0);
  });
});
