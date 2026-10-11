/**
 * V5 audit M2: board-only tasks were hidden only on screen. The task API,
 * live updates and Bruno's context gave them to every member. They now reach
 * only people who manage members (the task page's rule).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { loadWorkspaceFacts } from "../workspaceFacts";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
let member = "";
let memberId = 0;
let boardId = 0;
let openId = 0;
beforeAll(async () => {
  t = await startTestServer("cp-board-");
  team = await seedTeam(t.db, "Board Team");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@board.test", "admin"));
  memberId = await seedMember(t.db, team, "Max", "max@board.test");
  member = await t.session(memberId);
  boardId = Number((await t.db.execute({ sql: "INSERT INTO tasks (team_id, title, status, is_board) VALUES (?, 'Board budget review', 'todo', 1)", args: [team] })).lastInsertRowid);
  openId = Number((await t.db.execute({ sql: "INSERT INTO tasks (team_id, title, status, is_board) VALUES (?, 'Wire the hub', 'todo', 0)", args: [team] })).lastInsertRowid);
}, 120_000);
afterAll(async () => { await t?.stop(); });

const titles = (rows: any[]) => rows.map((r) => r.title).sort();
const dbAll = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const dbGet = async (sql: string, ...args: any[]) => (await dbAll(sql, ...args))[0];

describe("board-only tasks", () => {
  it("the task list gives them only to people who manage members", async () => {
    expect(titles((await t.api("/api/tasks", { session: admin })).body)).toEqual(["Board budget review", "Wire the hub"]);
    expect(titles((await t.api("/api/tasks", { session: member })).body)).toEqual(["Wire the hub"]);
  });

  it("Bruno's task lookup and workspace facts leave them out unless the viewer may see them", async () => {
    const hidden = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks" } as any]);
    expect(hidden).toContain("Wire the hub");
    expect(hidden).not.toContain("Board budget review");
    const shown = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "tasks" } as any], undefined, undefined, undefined, true);
    expect(shown).toContain("Board budget review");
    const facts = await loadWorkspaceFacts({ dbGet, dbAll }, team, "America/New_York");
    expect(facts?.openTaskTotal).toBe(1);
    expect(facts?.openTasks.map((x) => x.id)).toEqual([openId]);
    expect((await loadWorkspaceFacts({ dbGet, dbAll }, team, "America/New_York", new Date(), true))?.openTaskTotal).toBe(2);
  });

  it("live updates: a member never receives a board task, and one that becomes board-only disappears", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
    const seen: any[] = [];
    ws.on("message", (d) => { try { seen.push(JSON.parse(String(d))); } catch { /* ignore */ } });
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    ws.send(JSON.stringify({ type: "hello", sessionId: member }));
    await new Promise((r) => setTimeout(r, 400));

    await t.patch(`/api/tasks/${boardId}`, { title: "Board budget review (Q4)" }, admin);
    await t.patch(`/api/tasks/${openId}`, { is_board: 1 }, admin);
    await new Promise((r) => setTimeout(r, 600));
    ws.close();

    const tasks = seen.filter((m) => m.type === "task_updated" || m.type === "task_created");
    expect(tasks.some((m) => m.task?.is_board)).toBe(false);
    expect(JSON.stringify(seen)).not.toContain("Board budget review");
    // The task that just became board-only is removed from the member's screen.
    expect(seen).toContainEqual({ type: "task_deleted", id: openId });
  });
});
