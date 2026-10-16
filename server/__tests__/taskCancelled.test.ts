/**
 * Feature parity, Phase 1.1b: a Cancelled task status. Cancelled tasks are
 * kept (and can be restored) but never count as open or overdue anywhere:
 * the task page, Bruno's workspace facts and lookups. Only task managers
 * cancel or restore; any other status string is refused.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { loadWorkspaceFacts } from "../workspaceFacts";
import { isOpenStatus } from "../../src/types/taskStatus";
import { isTaskOverdue } from "../../src/utils/countdown";
import { normalizeTaskUpdate } from "../../src/utils/brunoTasks";

vi.setConfig({ testTimeout: 30_000 });

describe("status helpers", () => {
  it("only To do and In progress are open; a cancelled task is never overdue", () => {
    expect(["todo", "in-progress", "done", "cancelled"].map(isOpenStatus)).toEqual([true, true, false, false]);
    expect(isTaskOverdue({ due_date: "2020-01-01", status: "cancelled" })).toBe(false);
    expect(isTaskOverdue({ due_date: "2020-01-01", status: "todo" })).toBe(true);
  });
  it("Bruno's task-update reads cancel / canceled / cancelled", () => {
    for (const s of ["cancel", "canceled", "Cancelled"]) expect(normalizeTaskUpdate({ id: 4, status: s }, [])?.changes).toEqual({ status: "cancelled" });
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
  t = await startTestServer("cp-task-cancel-");
  team = await seedTeam(t.db, "Cancel Team");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@cancel.test", "admin"));
  studentId = await seedMember(t.db, team, "Sam", "sam@cancel.test");
  student = await t.session(studentId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("task API", () => {
  let id = 0;
  it("a manager cancels a task and restores it", async () => {
    id = (await t.post("/api/tasks", { title: "Paint the frame", due_date: "2020-01-01", assignee_ids: [studentId] }, admin)).body.id;
    expect((await t.patch(`/api/tasks/${id}`, { status: "cancelled" }, admin)).status).toBe(200);
    expect(await dbGet("SELECT status, completed_at FROM tasks WHERE id = ?", id)).toMatchObject({ status: "cancelled", completed_at: null });
    expect((await t.patch(`/api/tasks/${id}`, { status: "todo" }, admin)).status).toBe(200);
    expect((await dbGet("SELECT status FROM tasks WHERE id = ?", id)).status).toBe("todo");
  });

  it("an assignee can't cancel or restore, and unknown statuses are refused", async () => {
    expect((await t.patch(`/api/tasks/${id}`, { status: "cancelled" }, student)).status).toBe(403);
    expect((await t.patch(`/api/tasks/${id}`, { status: "in-progress" }, student)).status).toBe(200);
    await t.patch(`/api/tasks/${id}`, { status: "cancelled" }, admin);
    expect((await t.patch(`/api/tasks/${id}`, { status: "todo" }, student)).status).toBe(403);
    expect((await t.patch(`/api/tasks/${id}`, { status: "archived" }, admin)).status).toBe(400);
  });

  it("an assignee can't finish a cancelled task through the completion route either", async () => {
    const r = await t.api(`/api/tasks/${id}/complete`, { method: "POST", session: student, body: JSON.stringify({ notes: "Did it anyway" }) });
    expect(r.status).toBe(403);
    expect(await dbGet("SELECT status, completion_notes FROM tasks WHERE id = ?", id)).toMatchObject({ status: "cancelled", completion_notes: null });
  });

  it("cancelled tasks aren't open or overdue for Bruno", async () => {
    await t.post("/api/tasks", { title: "Wire the hub", due_date: "2020-01-02" }, admin);
    const facts = await loadWorkspaceFacts({ dbGet, dbAll }, team, "America/New_York");
    expect(facts?.openTaskTotal).toBe(1);
    expect(facts?.overdueTaskTotal).toBe(1);
    expect(facts?.openTasks.map((x) => x.title)).toEqual(["Wire the hub"]);
    const open = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", status: "open" } as any]);
    expect(open).toContain("Wire the hub");
    expect(open).not.toContain("Paint the frame");
    const cancelled = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", status: "cancelled" } as any]);
    expect(cancelled).toMatch(/Paint the frame — cancelled/);
  });
});

describe("Bruno", () => {
  it("a confirmed task-update card cancels a task; a member without task access is refused", async () => {
    const id = (await t.post("/api/tasks", { title: "Drop this", assignee_ids: [studentId] }, admin)).body.id;
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id, status: "cancelled" }] }] }, student)).status).toBe(403);
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id, status: "cancelled" }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await dbGet("SELECT status FROM tasks WHERE id = ?", id)).status).toBe("cancelled");
  });
});
