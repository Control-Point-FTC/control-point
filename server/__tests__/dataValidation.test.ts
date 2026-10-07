/**
 * Server-side input validation for calendar events (H-1), budget entries
 * (M-1 / H-6 / L-1) and attendance marks (L-4). The forms validate too, but
 * the API must never trust them.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let admin = "";
let member = "";
let memberId = 0;
let adminId = 0;

beforeAll(async () => {
  t = await startTestServer("cp-validate-");
  const team = await seedTeam(t.db, "Validation Team");
  adminId = await seedMember(t.db, team, "Admin", "admin@test.local", "admin");
  memberId = await seedMember(t.db, team, "Member", "member@test.local");
  await t.db.execute({ sql: "UPDATE members SET is_board = 1 WHERE id = ?", args: [adminId] });
  admin = await t.session(adminId);
  member = await t.session(memberId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

describe("calendar events (H-1)", () => {
  it("rejects an end time before the start on create", async () => {
    const r = await t.post("/api/events", { title: "Practice", date: "2026-11-01", start_time: "15:59", end_time: "04:59" }, admin);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/after the start/);
  });

  it("rejects an impossible date and a missing title", async () => {
    expect((await t.post("/api/events", { title: "Practice", date: "2026-02-30" }, admin)).status).toBe(400);
    expect((await t.post("/api/events", { title: "  ", date: "2026-11-01" }, admin)).status).toBe(400);
  });

  it("validates an edit against the stored event, and a corrected edit saves", async () => {
    const created = await t.post("/api/events", { title: "Practice", date: "2026-11-01", start_time: "14:00", end_time: "16:00" }, admin);
    expect(created.status).toBe(200);
    const id = created.body.id;
    // Only the end time sent — merged with the stored 14:00 start it's invalid.
    const bad = await t.patch(`/api/events/${id}`, { end_time: "13:00" }, admin);
    expect(bad.status).toBe(400);
    const good = await t.patch(`/api/events/${id}`, { end_time: "17:00" }, admin);
    expect(good.status).toBe(200);
    const row = (await t.db.execute({ sql: "SELECT start_time, end_time, created_by FROM events WHERE id = ?", args: [id] })).rows[0] as any;
    expect(row.end_time).toBe("17:00");
    expect(Number(row.created_by)).toBe(adminId);
  });

  it("ignores a client-supplied created_by", async () => {
    const r = await t.post("/api/events", { title: "Spoof", date: "2026-11-02", created_by: memberId }, admin);
    const row = (await t.db.execute({ sql: "SELECT created_by FROM events WHERE id = ?", args: [r.body.id] })).rows[0] as any;
    expect(Number(row.created_by)).toBe(adminId);
  });
});

describe("budget entries (M-1 / H-6 / L-1)", () => {
  const entry = { type: "expense", amount: 25, category: "Parts", description: "Motors", date: "2026-10-01" };

  it("rejects absurd magnitudes on both signs, zero and junk", async () => {
    for (const amount of [999999999999.99, -1000000000000, 0, "abc", 1000000.01]) {
      const r = await t.post("/api/budget", { ...entry, amount }, admin);
      expect(r.status, `amount ${amount}`).toBe(400);
    }
    const n = (await t.db.execute("SELECT COUNT(*) AS n FROM budget")).rows[0] as any;
    expect(Number(n.n)).toBe(0);
  });

  it("rejects a bad type or date", async () => {
    expect((await t.post("/api/budget", { ...entry, type: "gift" }, admin)).status).toBe(400);
    expect((await t.post("/api/budget", { ...entry, date: "yesterday" }, admin)).status).toBe(400);
  });

  it("stores a valid amount rounded to cents and notifies with a single $", async () => {
    const r = await t.post("/api/budget", { ...entry, type: "income", amount: "1500.004", category: "Sponsor" }, admin);
    expect(r.status).toBe(200);
    const row = (await t.db.execute({ sql: "SELECT amount FROM budget WHERE id = ?", args: [r.body.id] })).rows[0] as any;
    expect(Number(row.amount)).toBe(1500);
    // Notifications are written fire-and-forget after the response.
    let note: any;
    for (let i = 0; i < 100 && !note; i++) {
      note = (await t.db.execute({ sql: "SELECT content FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1", args: [adminId] })).rows[0];
      if (!note) await new Promise((r) => setTimeout(r, 100));
    }
    expect(note.content).toBe("New budget income: $1,500 for Sponsor");
    expect(note.content).not.toContain("$$");
  });

  it("validates edits against the stored row", async () => {
    const r = await t.post("/api/budget", entry, admin);
    expect((await t.patch(`/api/budget/${r.body.id}`, { amount: -5 }, admin)).status).toBe(400);
    expect((await t.patch(`/api/budget/${r.body.id}`, { amount: 30 }, admin)).status).toBe(200);
  });
});

describe("attendance marks (L-4)", () => {
  it("allows only Excused / School event on a future day", async () => {
    const future = iso(5);
    const bad = await t.post("/api/attendance/batch", { date: future, records: [{ member_id: memberId, status: "P" }] }, admin);
    expect(bad.status).toBe(400);
    const ok = await t.post("/api/attendance/batch", { date: future, records: [{ member_id: memberId, status: "E" }] }, admin);
    expect(ok.status).toBe(200);
  });

  it("rejects unknown status codes", async () => {
    const r = await t.post("/api/attendance/batch", { date: iso(-1), records: [{ member_id: memberId, status: "Z" }] }, admin);
    expect(r.status).toBe(400);
  });

  it("lets a member self-report today but not another day", async () => {
    const today = await t.post("/api/attendance/batch", { date: iso(0), records: [{ member_id: memberId, status: "P" }] }, member);
    expect(today.status).toBe(200);
    const past = await t.post("/api/attendance/batch", { date: iso(-10), records: [{ member_id: memberId, status: "P" }] }, member);
    expect(past.status).toBe(403);
  });

  it("still allows clearing a mark", async () => {
    const r = await t.post("/api/attendance/batch", { date: iso(5), records: [{ member_id: memberId, status: null }] }, admin);
    expect(r.status).toBe(200);
  });
});
