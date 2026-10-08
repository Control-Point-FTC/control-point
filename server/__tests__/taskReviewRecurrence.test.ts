/**
 * V3.5 tasks: priority and repeat are stored; finishing a repeating task
 * schedules the next one exactly once; done tasks wait for a manager's
 * review (approve, or send back with a note); quick-add puts time, priority
 * and assignee in their own fields.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
let member = "";
let memberId = 0;
beforeAll(async () => {
  t = await startTestServer("cp-tasks35-");
  team = await seedTeam(t.db, "Robo");
  await t.db.execute({ sql: "UPDATE teams SET timezone = 'America/New_York' WHERE id = ?", args: [team] });
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@t35.test", "admin"));
  memberId = await seedMember(t.db, team, "Arnav Patel", "arnav@t35.test");
  member = await t.session(memberId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

const task = async (id: number) => (await t.db.execute({ sql: "SELECT * FROM tasks WHERE id = ?", args: [id] })).rows[0] as any;

describe("priority + repeat", () => {
  it("stores them and rejects junk quietly", async () => {
    const r = await t.post("/api/tasks", { title: "Charge batteries", priority: "HIGH", recurrence: { freq: "weekly", interval: 1 }, due_date: "2026-10-10", assignee_ids: [memberId] }, admin);
    expect(r.status).toBe(200);
    const row = await task(r.body.id ?? r.body.task?.id);
    expect(row.priority).toBe("high");
    expect(JSON.parse(row.recurrence)).toEqual({ freq: "weekly", interval: 1 });
    const bad = await t.post("/api/tasks", { title: "x", priority: "whenever", recurrence: { freq: "yearly" } }, admin);
    const badRow = await task(bad.body.id ?? bad.body.task?.id);
    expect(badRow.priority).toBeNull();
    expect(badRow.recurrence).toBeNull();
  });

  it("finishing a repeating task schedules the next one, once", async () => {
    const r = await t.post("/api/tasks", { title: "Weekly build log", recurrence: { freq: "weekly", interval: 1 }, due_date: "2099-01-03", due_time: "18:00", assignee_ids: [memberId] }, admin);
    const id = r.body.id ?? r.body.task?.id;
    const done = await t.post(`/api/tasks/${id}/complete`, { notes: "Logged it" }, member);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const first = await task(id);
    expect(first.review_status).toBe("pending");
    expect(first.next_task_id).toBeGreaterThan(0);
    const next = await task(first.next_task_id);
    expect(next).toMatchObject({ title: "Weekly build log", status: "todo", due_date: "2099-01-10", due_time: "18:00", assigned_to: memberId });
    const who = (await t.db.execute({ sql: "SELECT member_id FROM task_assignees WHERE task_id = ?", args: [first.next_task_id] })).rows.map((r: any) => Number(r.member_id));
    expect(who).toEqual([memberId]);
    // Completing again (re-proof) doesn't make a second copy.
    await t.post(`/api/tasks/${id}/complete`, { notes: "More proof" }, member);
    const n = (await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE title = 'Weekly build log'", args: [] })).rows[0] as any;
    expect(Number(n.n)).toBe(2);
  });
});

describe("repeat catch-up", () => {
  it("a series years behind jumps to the first date from today on", async () => {
    const r = await t.post("/api/tasks", { title: "Daily log (old)", recurrence: { freq: "daily", interval: 1 }, due_date: "2020-01-01" }, admin);
    const id = r.body.id ?? r.body.task?.id;
    await t.post(`/api/tasks/${id}/complete`, { notes: "caught up" }, admin);
    const next = await task((await task(id)).next_task_id);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    expect(next.due_date >= today).toBe(true);
    expect(next.due_date <= new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)).toBe(true);
  });
});

describe("review", () => {
  it("managers approve or send back with a note; members can't review", async () => {
    const r = await t.post("/api/tasks", { title: "Wire the hub", assignee_ids: [memberId] }, admin);
    const id = r.body.id ?? r.body.task?.id;
    await t.post(`/api/tasks/${id}/complete`, { notes: "Done, see photo" }, member);
    expect((await t.post(`/api/tasks/${id}/review`, { action: "approve" }, member)).status).toBe(403);
    expect((await t.post(`/api/tasks/${id}/review`, { action: "send_back", note: "" }, admin)).status).toBe(400);
    const back = await t.post(`/api/tasks/${id}/review`, { action: "send_back", note: "Zip-tie the wires" }, admin);
    expect(back.status).toBe(200);
    expect(await task(id)).toMatchObject({ status: "in-progress", review_status: "changes_requested", review_note: "Zip-tie the wires", completed_at: null });
    const note = (await t.db.execute({ sql: "SELECT content FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1", args: [memberId] })).rows[0] as any;
    expect(note.content).toMatch(/sent back "Wire the hub": Zip-tie the wires/);
    await t.post(`/api/tasks/${id}/complete`, { notes: "Tidied" }, member);
    expect((await t.post(`/api/tasks/${id}/review`, { action: "approve" }, admin)).status).toBe(200);
    expect((await task(id)).review_status).toBe("approved");
  });

  it("a manager finishing a task approves it", async () => {
    const r = await t.post("/api/tasks", { title: "Order parts" }, admin);
    const id = r.body.id ?? r.body.task?.id;
    await t.post(`/api/tasks/${id}/complete`, { notes: "Ordered" }, admin);
    expect((await task(id)).review_status).toBe("approved");
  });
});

describe("quick-add parse (no AI configured in tests)", () => {
  it("puts time, priority and assignee in their fields", async () => {
    const r = await t.post("/api/tasks/parse", { text: "Test autonomous paths, high priority, assign to Arnav, due Thursday at 4:30pm" }, admin);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    const it0 = r.body.items[0];
    expect(it0).toMatchObject({ title: "Test autonomous paths", priority: "high", due_time: "16:30", assigned_to: memberId, assignee_ids: [memberId] });
    expect(it0.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("each pasted line keeps its own fields, even with a duplicate line", async () => {
    const r = await t.post("/api/tasks/parse", { text: "Charge batteries tomorrow 5pm\nCharge batteries tomorrow 5pm\nOrder parts friday" }, admin);
    expect(r.body.items.map((i: any) => [i.title, i.due_time])).toEqual([["Charge batteries", "17:00"], ["Order parts", null]]);
    expect(r.body.items[1].due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.body.items.every((i: any) => !("_source" in i))).toBe(true);
  });
});
