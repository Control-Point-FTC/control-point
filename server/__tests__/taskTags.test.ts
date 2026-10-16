/**
 * Feature parity, Phase 1.1a: tasks carry a start date and subsystem,
 * award and label tags. The task API and Bruno's confirmed cards save them
 * with the same rules; Bruno's lookups, facts and screen context show them.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { loadWorkspaceFacts, formatWorkspaceFacts } from "../workspaceFacts";
import { taskTagColumns } from "../taskTags";
import { cleanAwards, cleanLabels, cleanRecordSubsystems } from "../../src/types/taskTags";
import { normalizeBrunoTask, normalizeTaskUpdate } from "../../src/utils/brunoTasks";

vi.setConfig({ testTimeout: 30_000 });

describe("tag helpers", () => {
  it("awards by id or name, in taxonomy order; unknown ones dropped", () => {
    expect(cleanAwards(["Reach", "think", "nope", "THINK"])).toEqual(["think", "reach"]);
  });
  it("labels are trimmed, de-duplicated and capped", () => {
    expect(cleanLabels([" TeleOp ", "teleop", "", "x".repeat(40)])).toEqual(["TeleOp", "x".repeat(24)]);
    expect(cleanLabels(Array.from({ length: 15 }, (_, i) => `L${i}`))).toHaveLength(10);
  });
  it("subsystems must be on the team's list and take its spelling", () => {
    expect(cleanRecordSubsystems(["intake", "Lift", "ARM"], ["Intake", "Arm"])).toEqual(["Intake", "Arm"]);
  });
  it("taskTagColumns only touches the fields sent, and rejects a bad start date", () => {
    expect(taskTagColumns({ labels: [] }, ["Intake"]).cols).toEqual({ labels: null });
    expect(taskTagColumns({ start_date: "2026-02-30" }, []).error).toBeTruthy();
    expect(taskTagColumns({ start_date: null, subsystems: ["intake"] }, ["Intake"]).cols).toEqual({ start_date: null, subsystems: '["Intake"]' });
  });
  it("Bruno's task and task-update normalizers carry the tags", () => {
    const t = normalizeBrunoTask({ title: "Tune intake", start_date: "2026-10-20", due_date: "2026-10-22", subsystems: ["intake", "Moon"], awards: ["control"], labels: ["TeleOp"] }, "2026-10-16", [], { fromText: false, subsystems: ["Intake"] });
    expect(t).toMatchObject({ start_date: "2026-10-20", subsystems: ["Intake"], awards: ["control"], labels: ["TeleOp"] });
    // A start after the due date is dropped rather than saved.
    expect(normalizeBrunoTask({ title: "X", start_date: "2026-10-25", due_date: "2026-10-22" }, "2026-10-16", [], { fromText: false }).start_date).toBeNull();
    const u = normalizeTaskUpdate({ id: 3, awards: [], labels: ["Auto"], start_date: null }, [], null, ["Intake"]);
    expect(u?.changes).toEqual({ awards: [], labels: ["Auto"], start_date: null });
  });
});

let t: TestServer;
let team = 0;
let admin = "";
let studentId = 0;
let student = "";
const dbAll = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const dbGet = async (sql: string, ...args: any[]) => (await dbAll(sql, ...args))[0];

beforeAll(async () => {
  t = await startTestServer("cp-task-tags-");
  team = await seedTeam(t.db, "Tags Team");
  await t.db.execute({ sql: "UPDATE teams SET subsystems = ? WHERE id = ?", args: ['["Drivetrain","Intake","Arm"]', team] });
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@tags.test", "admin"));
  studentId = await seedMember(t.db, team, "Sam", "sam@tags.test");
  student = await t.session(studentId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("task API", () => {
  let id = 0;
  it("creates a task with a start date and tags (unknown subsystem and award dropped)", async () => {
    const r = await t.post("/api/tasks", { title: "Tune the intake", start_date: "2026-10-18", due_date: "2026-10-20", subsystems: ["intake", "Lift"], awards: ["think", "fake"], labels: ["TeleOp", "teleop"] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    id = r.body.id;
    const row = await dbGet("SELECT start_date, subsystems, awards, labels FROM tasks WHERE id = ?", id);
    expect(row).toMatchObject({ start_date: "2026-10-18", subsystems: '["Intake"]', awards: '["think"]', labels: '["TeleOp"]' });
  });

  it("refuses a start date after the due date, on create and on edit", async () => {
    expect((await t.post("/api/tasks", { title: "Backwards", start_date: "2026-10-25", due_date: "2026-10-20" }, admin)).status).toBe(400);
    expect((await t.patch(`/api/tasks/${id}`, { due_date: "2026-10-10" }, admin)).status).toBe(400);
  });

  it("an edit changes only the fields it sends; [] clears a list", async () => {
    expect((await t.patch(`/api/tasks/${id}`, { labels: [], subsystems: ["Arm"] }, admin)).status).toBe(200);
    const row = await dbGet("SELECT start_date, subsystems, awards, labels FROM tasks WHERE id = ?", id);
    expect(row).toMatchObject({ start_date: "2026-10-18", subsystems: '["Arm"]', awards: '["think"]', labels: null });
  });

  it("an assignee without manage_tasks can't change tags", async () => {
    await t.patch(`/api/tasks/${id}`, { assignee_ids: [studentId] }, admin);
    expect((await t.patch(`/api/tasks/${id}`, { labels: ["Mine"] }, student)).status).toBe(403);
  });

  it("the next task in a repeating series keeps the tags but not the start date", async () => {
    const r = await t.post("/api/tasks", { title: "Weekly drive check", due_date: "2026-10-20", start_date: "2026-10-19", recurrence: { freq: "weekly", interval: 1 }, subsystems: ["Drivetrain"], labels: ["Routine"] }, admin);
    const tid = r.body.id;
    const done = await t.api(`/api/tasks/${tid}/complete`, { method: "POST", session: admin, body: JSON.stringify({ notes: "Checked" }) });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    const next = await dbGet("SELECT subsystems, labels, start_date FROM tasks WHERE id = (SELECT next_task_id FROM tasks WHERE id = ?)", tid);
    expect(next).toMatchObject({ subsystems: '["Drivetrain"]', labels: '["Routine"]', start_date: null });
  });
});

describe("Bruno and task tags", () => {
  it("a confirmed tasks card saves the tags; a task-update card changes them", async () => {
    let r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{ title: "Library demo prep", subsystems: ["Arm"], awards: ["reach"], labels: ["Outreach"], start_date: "2026-10-17", due_date: "2026-10-19" }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const id = r.body.created.task[0];
    expect(await dbGet("SELECT subsystems, awards, labels, start_date FROM tasks WHERE id = ?", id)).toMatchObject({ subsystems: '["Arm"]', awards: '["reach"]', labels: '["Outreach"]', start_date: "2026-10-17" });
    r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id, awards: ["reach", "inspire"], labels: [] }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await dbGet("SELECT awards, labels FROM tasks WHERE id = ?", id)).toMatchObject({ awards: '["reach","inspire"]', labels: null });
  });

  it("an impossible start date is left off, and the other tags still save", async () => {
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{ title: "Bad start", start_date: "2026-02-30", labels: ["Keep"], awards: ["think"] }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const id = r.body.created.task[0];
    expect(await dbGet("SELECT start_date, labels, awards FROM tasks WHERE id = ?", id)).toMatchObject({ start_date: null, labels: '["Keep"]', awards: '["think"]' });
    const u = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id, start_date: "2026-13-01", labels: ["New"] }] }] }, admin);
    expect(u.status, JSON.stringify(u.body)).toBe(200);
    expect(await dbGet("SELECT start_date, labels FROM tasks WHERE id = ?", id)).toMatchObject({ start_date: null, labels: '["New"]' });
  });

  it("an edit that would make a task due before it starts is refused, and nothing is saved", async () => {
    const r = await t.post("/api/tasks", { title: "Dated", start_date: "2026-10-18", due_date: "2026-10-20" }, admin);
    const id = r.body.id;
    const u = await t.post("/api/ai/apply-actions", { actions: [
      { kind: "task", items: [{ title: "Should not be created" }] },
      { kind: "task-update", items: [{ id, due_date: "2026-10-10" }] },
    ] }, admin);
    expect(u.status).toBe(400);
    expect(await dbGet("SELECT due_date FROM tasks WHERE id = ?", id)).toMatchObject({ due_date: "2026-10-20" });
    expect(await dbAll("SELECT id FROM tasks WHERE title = 'Should not be created'")).toHaveLength(0);
    // Moving both together is fine.
    const ok = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id, due_date: "2026-10-10" }, { id, start_date: "2026-10-08" }] }] }, admin);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(await dbGet("SELECT start_date, due_date FROM tasks WHERE id = ?", id)).toMatchObject({ start_date: "2026-10-08", due_date: "2026-10-10" });
  });

  it("the card context gives the team's subsystems", async () => {
    const r = await t.api("/api/ai/proposal-context", { session: admin });
    expect(r.body.subsystems).toEqual(["Drivetrain", "Intake", "Arm"]);
  });

  it("tasks lookup filters by priority, subsystem and label", async () => {
    await t.post("/api/tasks", { title: "Filter me intake", priority: "urgent", subsystems: ["Intake"], labels: ["Pit"] }, admin);
    await t.post("/api/tasks", { title: "Filter me arm", subsystems: ["Arm"] }, admin);
    const run = async (q: any) => runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", query: "Filter me", ...q }]);
    expect(await run({ priority: "urgent" })).toMatch(/Filter me intake/);
    expect(await run({ priority: "urgent" })).not.toMatch(/Filter me arm/);
    expect(await run({ priority: "none" })).toMatch(/Filter me arm/);
    expect(await run({ subsystem: "intake" })).not.toMatch(/Filter me arm/);
    expect(await run({ label: "PIT" })).toMatch(/Filter me intake/);
    // A tag filter never drops the status filter.
    await t.post("/api/tasks", { title: "Filter me done pit", labels: ["Pit"], status: "done" }, admin);
    const todo = await run({ label: "pit", status: "todo" });
    expect(todo).toMatch(/Filter me intake/);
    expect(todo).not.toMatch(/Filter me done pit/);
  });

  it("tasks lookup shows and searches tags; facts list subsystems on open tasks", async () => {
    const out = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", query: "reach" } as any]);
    expect(out).toContain("Library demo prep");
    expect(out).toMatch(/Reach, Inspire award evidence/);
    const facts = await loadWorkspaceFacts({ dbGet, dbAll }, team, "America/New_York");
    expect(formatWorkspaceFacts(facts!)).toMatch(/Tune the intake.*subsystems "Arm"/);
  });
});
