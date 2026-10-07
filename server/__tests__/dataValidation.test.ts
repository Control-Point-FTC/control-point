/**
 * Server-side input validation for calendar events (H-1), budget entries
 * (M-1 / H-6 / L-1) and attendance marks (L-4). The forms validate too, but
 * the API must never trust them.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
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
    // Through the API too — see the note below about reading the DB file.
    const list = await t.api("/api/budget", { session: admin });
    const row = list.body.find((b: any) => b.id === r.body.id);
    expect(Number(row.amount)).toBe(1500);
    // Notifications are written fire-and-forget after the response.
    // Read through the API, not the DB file: a second process reading the
    // SQLite file while the server writes can make that write fail BUSY.
    let note: any;
    for (let i = 0; i < 30 && !note; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const list = await t.api(`/api/notifications/${adminId}`, { session: admin });
      note = Array.isArray(list.body) ? list.body.find((n: any) => String(n.content).includes("Sponsor")) : undefined;
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

describe("Bruno-applied writes", () => {
  it("budget items follow the same rules, and budget/calendar writes are live-synced", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
    const seen: string[] = [];
    ws.on("message", (d) => { try { seen.push(JSON.parse(String(d)).type); } catch { /* ignore */ } });
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    ws.send(JSON.stringify({ type: "hello", sessionId: admin }));
    await new Promise((r) => setTimeout(r, 400));

    const before = Number(((await t.db.execute("SELECT COUNT(*) AS n FROM budget")).rows[0] as any).n);
    const r = await t.post("/api/ai/apply-actions", {
      actions: [
        { kind: "budget", items: [
          { type: "expense", amount: 0.004, category: "Rounds to zero" },
          { type: "expense", amount: 2000000, category: "Over the cap" },
          { type: "expense", amount: 12, category: "Bad date", date: "2026-02-30" },
        ] },
        { kind: "event", items: [{ title: "Bruno practice", date: "2026-11-05", time: "17:00" }] },
      ],
    }, admin);
    expect(r.status).toBe(200);
    const rows = (await t.db.execute(`SELECT amount, category, date FROM budget ORDER BY id DESC LIMIT ${3}`)).rows as any[];
    const after = Number(((await t.db.execute("SELECT COUNT(*) AS n FROM budget")).rows[0] as any).n);
    expect(after - before).toBe(1); // only the valid one, dated today instead of Feb 30
    expect(rows[0].category).toBe("Bad date");
    expect(rows[0].date).not.toBe("2026-02-30");

    await new Promise((r2) => setTimeout(r2, 500));
    ws.close();
    expect(seen).toContain("budget_changed");
    expect(seen).toContain("events_changed");
  });
});

describe("Bruno-applied events keep their end time (L-2)", () => {
  it("saves a valid end after the start, and drops an end that isn't", async () => {
    const r = await t.post("/api/ai/apply-actions", {
      actions: [{ kind: "event", items: [
        { title: "Range night", date: "2026-11-06", time: "15:00", end: "17:00" },
        { title: "Backwards end", date: "2026-11-07", time: "18:00", end: "17:00" },
        { title: "No start", date: "2026-11-08", end: "17:00" },
      ] }],
    }, admin);
    expect(r.status).toBe(200);
    const row = async (title: string) => (await t.db.execute({ sql: "SELECT start_time, end_time FROM events WHERE title = ?", args: [title] })).rows[0] as any;
    expect(await row("Range night")).toMatchObject({ start_time: "15:00", end_time: "17:00" });
    expect(await row("Backwards end")).toMatchObject({ start_time: "18:00", end_time: "" });
    expect(await row("No start")).toMatchObject({ start_time: "", end_time: "" });
  });
});
