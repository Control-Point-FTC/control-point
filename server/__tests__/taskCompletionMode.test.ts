/**
 * Feature parity, Phase 1.1d: "everyone assigned completes it separately".
 * Each assignee finishes their own part (with proof); the task is done once
 * every current assignee has. Reopening starts everyone over; a manager can
 * finish it for everyone. Shared tasks (the default) are unchanged. Bruno can
 * set the mode and sees the progress in lookups.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { normalizeBrunoTask, normalizeTaskUpdate, readCompletionMode } from "../../src/utils/brunoTasks";

vi.setConfig({ testTimeout: 30_000 });

describe("mode parsing", () => {
  it("reads each / separately / everyone as 'each'; anything else is shared", () => {
    expect(["each", "Separately", "everyone", "individual"].map(readCompletionMode)).toEqual(["each", "each", "each", "each"]);
    expect(["shared", "", null, 3].map(readCompletionMode)).toEqual([null, null, null, null]);
    expect(normalizeBrunoTask({ title: "Safety form", completion_mode: "each" }, "2026-10-16", [], { fromText: false }).completion_mode).toBe("each");
    expect(normalizeTaskUpdate({ id: 3, completion_mode: "shared" }, [])?.changes).toEqual({ completion_mode: null });
  });
});

let t: TestServer;
let team = 0;
let admin = "";
let ana = 0, ben = 0;
let anaS = "", benS = "";
const dbAll = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const dbGet = async (sql: string, ...args: any[]) => (await dbAll(sql, ...args))[0];
const complete = (id: number, session: string, body: any = { notes: "Done my part" }) =>
  t.api(`/api/tasks/${id}/complete`, { method: "POST", session, body: JSON.stringify(body) });
const listed = async (id: number) => ((await t.api("/api/tasks", { session: admin })).body as any[]).find((x) => x.id === id);

beforeAll(async () => {
  t = await startTestServer("cp-task-each-");
  team = await seedTeam(t.db, "Each Team");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@each.test", "admin"));
  ana = await seedMember(t.db, team, "Ana", "ana@each.test");
  ben = await seedMember(t.db, team, "Ben", "ben@each.test");
  anaS = await t.session(ana);
  benS = await t.session(ben);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("everyone completes it separately", () => {
  let id = 0;
  it("one assignee's part leaves the task open with progress; the last one finishes it", async () => {
    id = (await t.post("/api/tasks", { title: "Read the safety guide", assignee_ids: [ana, ben], completion_mode: "each" }, admin)).body.id;
    const first = await complete(id, anaS);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ partial: true, done: 1, of: 2 });
    expect(await listed(id)).toMatchObject({ status: "in-progress", completion_mode: "each", done_assignee_ids: [ana] });
    const last = await complete(id, benS);
    expect(last.body.partial).toBeUndefined();
    expect(await dbGet("SELECT status, review_status FROM tasks WHERE id = ?", id)).toMatchObject({ status: "done", review_status: "pending" });
  });

  it("reopening starts everyone over", async () => {
    expect((await t.patch(`/api/tasks/${id}`, { status: "todo" }, admin)).status).toBe(200);
    expect((await listed(id)).done_assignee_ids).toEqual([]);
  });

  it("a manager can finish it for everyone", async () => {
    await complete(id, anaS);
    const r = await complete(id, admin, { notes: "Checked everyone in person", whole: "1" });
    expect(r.status).toBe(200);
    expect((await dbGet("SELECT status FROM tasks WHERE id = ?", id)).status).toBe("done");
  });

  it("a shared task (the default) is still finished by whoever completes it", async () => {
    const shared = (await t.post("/api/tasks", { title: "Order wheels", assignee_ids: [ana, ben] }, admin)).body.id;
    const r = await complete(shared, anaS);
    expect(r.body.partial).toBeUndefined();
    expect((await dbGet("SELECT status FROM tasks WHERE id = ?", shared)).status).toBe("done");
  });

  it("the last part's proof is recorded once", async () => {
    const solo = (await t.post("/api/tasks", { title: "Solo each", assignee_ids: [ana], completion_mode: "each" }, admin)).body.id;
    await complete(solo, anaS, { notes: "All mine" });
    const row = await dbGet("SELECT status, completion_history FROM tasks WHERE id = ?", solo);
    expect(row.status).toBe("done");
    expect(JSON.parse(row.completion_history)).toHaveLength(1);
  });

  it("removing the last unfinished person closes the task", async () => {
    const pair = (await t.post("/api/tasks", { title: "Pair each", assignee_ids: [ana, ben], completion_mode: "each" }, admin)).body.id;
    await complete(pair, anaS);
    expect((await t.patch(`/api/tasks/${pair}`, { assignee_ids: [ana] }, admin)).status).toBe(200);
    expect((await dbGet("SELECT status FROM tasks WHERE id = ?", pair)).status).toBe("done");
  });

  it("deleting a task removes its progress rows", async () => {
    const gone = (await t.post("/api/tasks", { title: "Gone each", assignee_ids: [ana, ben], completion_mode: "each" }, admin)).body.id;
    await complete(gone, anaS);
    expect((await t.api(`/api/tasks/${gone}`, { method: "DELETE", session: admin })).status).toBe(200);
    expect(await dbAll("SELECT * FROM task_assignee_done WHERE task_id = ?", gone)).toHaveLength(0);
  });

  it("only managers change the mode", async () => {
    expect((await t.patch(`/api/tasks/${id}`, { completion_mode: null }, anaS)).status).toBe(403);
  });
});

describe("Bruno", () => {
  it("reopening through a task-update card starts everyone over", async () => {
    const id = (await t.post("/api/tasks", { title: "Reopen each", assignee_ids: [ana, ben], completion_mode: "each" }, admin)).body.id;
    await complete(id, anaS);
    await complete(id, benS);
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id, status: "todo" }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await dbAll("SELECT * FROM task_assignee_done WHERE task_id = ?", id)).toHaveLength(0);
  });

  it("lookups count a task that only has the legacy assigned_to", async () => {
    const id = Number((await t.db.execute({ sql: "INSERT INTO tasks (team_id, title, status, assigned_to, completion_mode) VALUES (?, 'Legacy each', 'todo', ?, 'each')", args: [team, ana] })).lastInsertRowid);
    const out = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", query: "Legacy each" } as any]);
    expect(out).toMatch(/\(0 of 1 done\)/);
    expect(id).toBeGreaterThan(0);
  });

  it("a tasks card can make a task each-person; lookups show the progress", async () => {
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{ title: "Sign the travel form", assignees: ["Ana", "Ben"], completion_mode: "each" }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const id = r.body.created.task[0];
    expect((await dbGet("SELECT completion_mode FROM tasks WHERE id = ?", id)).completion_mode).toBe("each");
    await complete(id, benS);
    const out = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", query: "travel form" } as any]);
    expect(out).toMatch(/completes it separately \(1 of 2 done\)/);
  });
});
