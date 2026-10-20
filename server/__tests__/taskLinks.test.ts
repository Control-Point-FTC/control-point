/**
 * Feature parity, Phase 1.1c: task dependencies and related tasks. A task is
 * blocked while a task that blocks it is open. Links stay inside the team,
 * never show hidden board tasks, never form a loop, and go when a task is
 * deleted. Bruno can set them on a task-update card and sees "blocked by" in
 * lookups, workspace facts and the open-task screen context.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { loadWorkspaceFacts, formatWorkspaceFacts } from "../workspaceFacts";
import { planLinkChanges } from "../taskLinks";
import { cleanTaskIds } from "../../src/types/taskLinks";
import { normalizeTaskUpdate } from "../../src/utils/brunoTasks";

vi.setConfig({ testTimeout: 30_000 });

describe("link planning", () => {
  const all = () => true;
  it("refuses a loop, directly or through other tasks", () => {
    const rows = [{ from_id: 1, to_id: 2, kind: "blocks" }, { from_id: 2, to_id: 3, kind: "blocks" }];
    expect(planLinkChanges(rows, [{ id: 1, kind: "blocked_by", ids: [3] }], all)).toMatchObject({ error: expect.stringMatching(/loop/) });
    expect(planLinkChanges(rows, [{ id: 3, kind: "blocks", ids: [1] }], all)).toMatchObject({ error: expect.stringMatching(/loop/) });
    // Replacing a link removes it before the loop check.
    expect(planLinkChanges(rows, [{ id: 2, kind: "blocked_by", ids: [] }], all)).toEqual({ remove: [rows[0]], add: [] });
  });
  it("checks one card's changes together: two links that only loop together are refused", () => {
    expect(planLinkChanges([], [{ id: 1, kind: "blocked_by", ids: [2] }, { id: 2, kind: "blocked_by", ids: [1] }], all)).toMatchObject({ error: expect.stringMatching(/loop/) });
  });
  it("caps links at both ends, counting links the viewer can't see", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ from_id: 100 + i, to_id: 1, kind: "blocks" }));
    // Task 50 adding "blocks 1" would give task 1 its 21st blocker.
    expect(planLinkChanges(rows, [{ id: 50, kind: "blocks", ids: [1] }], (o) => o === 50 || o === 1)).toMatchObject({ error: expect.stringMatching(/#1 would have more than 20/) });
  });
  it("related links are stored once, smaller id first; unknown tasks are refused", () => {
    expect(planLinkChanges([], [{ id: 7, kind: "related", ids: [3] }], all)).toEqual({ remove: [], add: [{ from_id: 3, to_id: 7, kind: "relates" }] });
    expect(planLinkChanges([], [{ id: 7, kind: "related", ids: [3] }], (o) => o !== 3)).toMatchObject({ error: expect.stringMatching(/#3/) });
  });
  it("ids are cleaned for Bruno: '#12', duplicates and the task itself", () => {
    expect(cleanTaskIds(["#12", 12, "4", 0, -1, "x", 5], 5)).toEqual([12, 4]);
    expect(normalizeTaskUpdate({ id: 5, blocked_by: ["#9"], related: null }, [])?.changes).toEqual({ blocked_by: [9], related: [] });
  });
});

let t: TestServer;
let team = 0;
let admin = "";
let studentId = 0;
let student = "";
const dbAll = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const dbGet = async (sql: string, ...args: any[]) => (await dbAll(sql, ...args))[0];
const task = async (title: string, extra: any = {}) => (await t.post("/api/tasks", { title, ...extra }, admin)).body.id as number;
const list = async (session: string) => (await t.api("/api/tasks", { session })).body as any[];

beforeAll(async () => {
  t = await startTestServer("cp-task-links-");
  team = await seedTeam(t.db, "Links Team");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@links.test", "admin"));
  studentId = await seedMember(t.db, team, "Sam", "sam@links.test");
  student = await t.session(studentId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("task API", () => {
  let cad = 0, print = 0, assemble = 0;
  it("links tasks; the list carries blocked_by / blocks / related", async () => {
    cad = await task("Finish intake CAD");
    print = await task("Print intake parts");
    assemble = await task("Assemble the intake");
    expect((await t.post(`/api/tasks/${print}/links`, { kind: "blocked_by", other_id: cad }, admin)).status).toBe(200);
    expect((await t.post(`/api/tasks/${assemble}/links`, { kind: "blocked_by", other_id: print }, admin)).status).toBe(200);
    expect((await t.post(`/api/tasks/${assemble}/links`, { kind: "related", other_id: cad }, admin)).status).toBe(200);
    const byId = new Map((await list(admin)).map((x) => [x.id, x]));
    expect(byId.get(print)).toMatchObject({ blocked_by: [cad], blocks: [assemble], related: [] });
    expect(byId.get(cad)).toMatchObject({ blocks: [print], related: [assemble] });
  });

  it("refuses a loop, a task from another team and members without task access", async () => {
    expect((await t.post(`/api/tasks/${cad}/links`, { kind: "blocked_by", other_id: assemble }, admin)).status).toBe(400);
    const otherTeam = await seedTeam(t.db, "Other");
    const foreign = Number((await t.db.execute({ sql: "INSERT INTO tasks (team_id, title, status) VALUES (?, 'Theirs', 'todo')", args: [otherTeam] })).lastInsertRowid);
    expect((await t.post(`/api/tasks/${cad}/links`, { kind: "blocks", other_id: foreign }, admin)).status).toBe(400);
    expect((await t.post(`/api/tasks/${cad}/links`, { kind: "related", other_id: print }, student)).status).toBe(403);
  });

  it("a hidden board task never shows up as a link for members who can't see it", async () => {
    const board = await task("Board budget", { is_board: 1 });
    expect((await t.post(`/api/tasks/${cad}/links`, { kind: "related", other_id: board }, admin)).status).toBe(200);
    const mine = new Map((await list(student)).map((x) => [x.id, x]));
    expect(mine.get(cad).related).toEqual([assemble]);
    // Removing another link as an admin keeps the board link.
    await t.api(`/api/tasks/${cad}/links?kind=related&other_id=${assemble}`, { method: "DELETE", session: admin });
    expect(new Map((await list(admin)).map((x) => [x.id, x])).get(cad).related).toEqual([board]);
  });

  it("a loop through a hidden board task is refused without naming it", async () => {
    // Members who manage tasks but can't see board tasks.
    const lead = await seedMember(t.db, team, "Lee", "lee@links.test");
    const role = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions, position) VALUES (?, 'Task lead', '[\"manage_tasks\"]', 9)", args: [team] })).lastInsertRowid);
    await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [lead, role] });
    const leadSession = await t.session(lead);
    const a = await task("Visible A");
    const h = await task("Hidden board H", { is_board: 1 });
    const b = await task("Visible B");
    await t.post(`/api/tasks/${a}/links`, { kind: "blocks", other_id: h }, admin);
    await t.post(`/api/tasks/${h}/links`, { kind: "blocks", other_id: b }, admin);
    const r = await t.post(`/api/tasks/${b}/links`, { kind: "blocks", other_id: a }, leadSession);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/tasks you can't see/);
    expect(r.body.error).not.toContain(`#${h}`);
  });

  it("deleting a task removes its links", async () => {
    const temp = await task("Temporary");
    await t.post(`/api/tasks/${temp}/links`, { kind: "blocks", other_id: cad }, admin);
    expect((await t.api(`/api/tasks/${temp}`, { method: "DELETE", session: admin })).status).toBe(200);
    expect(await dbAll("SELECT * FROM task_links WHERE from_id = ? OR to_id = ?", temp, temp)).toHaveLength(0);
  });
});

describe("Bruno and task links", () => {
  it("a card whose two edits only loop together is refused, and nothing is saved", async () => {
    const x = await task("Loop X");
    const y = await task("Loop Y");
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: x, blocked_by: [y], title: "X changed" }, { id: y, blocked_by: [x] }] }] }, admin);
    expect(r.status).toBe(400);
    expect(await dbAll("SELECT * FROM task_links WHERE from_id IN (?, ?) OR to_id IN (?, ?)", x, y, x, y)).toHaveLength(0);
    expect((await dbGet("SELECT title FROM tasks WHERE id = ?", x)).title).toBe("Loop X");
  });

  it("a card refused by a later action saves none of its links", async () => {
    const x = await task("Refused X");
    const y = await task("Refused Y");
    const r = await t.post("/api/ai/apply-actions", { actions: [
      { kind: "communication", items: [{ recipient: "REV", subject: "Re: order", parent_id: 999999 }] },
      { kind: "task-update", items: [{ id: y, blocked_by: [x] }] },
    ] }, admin);
    expect(r.status).toBe(400);
    expect(await dbAll("SELECT * FROM task_links WHERE to_id = ?", y)).toHaveLength(0);
  });

  it("two managers adding opposite links at once can't form a loop", async () => {
    const x = await task("Race X");
    const y = await task("Race Y");
    const [a, b] = await Promise.all([
      t.post(`/api/tasks/${x}/links`, { kind: "blocks", other_id: y }, admin),
      t.post(`/api/tasks/${y}/links`, { kind: "blocks", other_id: x }, admin),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(await dbAll("SELECT * FROM task_links WHERE kind = 'blocks' AND from_id IN (?, ?) AND to_id IN (?, ?)", x, y, x, y)).toHaveLength(1);
  });

  it("a task-update card sets blocked_by; a loop refuses the whole card", async () => {
    const a = await task("Wire the hub");
    const b = await task("Test autonomous");
    let r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: b, blocked_by: [a], priority: "high" }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await dbGet("SELECT priority FROM tasks WHERE id = ?", b)).toMatchObject({ priority: "high" });
    expect(await dbAll("SELECT from_id FROM task_links WHERE to_id = ? AND kind = 'blocks'", b)).toEqual([expect.objectContaining({ from_id: a })]);
    r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: a, blocked_by: [b], title: "Should not change" }] }] }, admin);
    expect(r.status).toBe(400);
    expect((await dbGet("SELECT title FROM tasks WHERE id = ?", a)).title).toBe("Wire the hub");
  });

  it("lookups and facts say what's blocking a task, until the blocker is done", async () => {
    let out = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", query: "autonomous" } as any]);
    expect(out).toMatch(/Test autonomous.*blocked by task #\d+ \(still open\)/);
    const facts = formatWorkspaceFacts((await loadWorkspaceFacts({ dbGet, dbAll }, team, "America/New_York"))!);
    expect(facts).toMatch(/Test autonomous.*BLOCKED by task #\d+/);
    const hub = (await dbGet("SELECT id FROM tasks WHERE title = 'Wire the hub'")).id;
    await t.db.execute({ sql: "UPDATE tasks SET status = 'done' WHERE id = ?", args: [hub] });
    out = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks", query: "autonomous" } as any]);
    expect(out).not.toMatch(/blocked by/);
  });
});

describe("two link edits at once", () => {
  it("both blockers stay: neither edit replaces the list the other just changed", async () => {
    for (let round = 0; round < 3; round++) {
      const target = await task(`Wire the robot ${round}`);
      const others: number[] = [];
      for (let i = 0; i < 8; i++) others.push(await task(`Wiring step ${round}.${i}`));
      const results = await Promise.all(others.map((o) => t.post(`/api/tasks/${target}/links`, { kind: "blocked_by", other_id: o }, admin)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      const stored = (await t.db.execute({ sql: "SELECT from_id FROM task_links WHERE to_id = ? AND kind = 'blocks' ORDER BY from_id", args: [target] })).rows.map((r: any) => Number(r.from_id));
      expect(stored).toEqual([...others].sort((a, b) => a - b));
    }
  });
});
