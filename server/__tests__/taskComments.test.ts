/**
 * Feature parity, Phase 1.2: a task's discussion and history. Comments notify
 * everyone following the task (assignees, watchers) and anyone @mentioned;
 * every write records activity; the timeline shows both. Bruno reads a
 * task's discussion (task_activity lookup) and posts comments through a
 * confirmed task-comment card.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import WebSocket from "ws";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { mentionedMembers, taskEditActivity } from "../taskActivity";
import { describeActivity } from "../../src/utils/taskActivityText";

vi.setConfig({ testTimeout: 30_000 });

describe("helpers", () => {
  const roster = [{ id: 1, name: "Ada Lovelace" }, { id: 2, name: "Grace Hopper" }, { id: 3, name: "Grace Kelly" }];
  it("mentions: @[Full Name], or a unique @First", () => {
    expect(mentionedMembers("thanks @Ada and @[Grace Kelly]", roster).sort()).toEqual([1, 3]);
    // Two Graces: "@Grace" alone names nobody; an email address isn't a mention.
    expect(mentionedMembers("@Grace can you? mail ada@x.test", roster)).toEqual([]);
  });
  it("edits become activity entries; descriptions read plainly", () => {
    const e = taskEditActivity({ status: "todo", title: "A", priority: null }, { status: "in-progress", title: "B", priority: "high" }, { before: [1], after: [1, 2] });
    expect(e.map((x) => x.kind)).toEqual(["status", "renamed", "priority", "assignees"]);
    const name = (id: any) => (id === 1 ? "Ada" : id === 2 ? "Grace" : "Someone");
    expect(describeActivity({ kind: "status", member_id: 1, detail: JSON.stringify({ from: "todo", to: "in-progress", via: "bruno" }) }, name)).toBe("Ada moved it from To do to In progress (through Bruno)");
    expect(describeActivity({ kind: "assignees", member_id: 1, detail: { added: [2], removed: [] } }, name)).toBe("Ada assigned Grace");
  });
});

let t: TestServer;
let team = 0;
let admin = "", ana = "", ben = "";
let anaId = 0, benId = 0;
const dbAll = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const notes = async (memberId: number) => (await dbAll("SELECT content FROM notifications WHERE user_id = ? ORDER BY id", memberId)).map((r) => String(r.content));

beforeAll(async () => {
  t = await startTestServer("cp-task-comments-");
  team = await seedTeam(t.db, "Talk Team");
  admin = await t.session(await seedMember(t.db, team, "Ada Lovelace", "ada@talk.test", "admin"));
  anaId = await seedMember(t.db, team, "Ana Ortiz", "ana@talk.test");
  benId = await seedMember(t.db, team, "Ben Cole", "ben@talk.test");
  ana = await t.session(anaId);
  ben = await t.session(benId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("timeline", () => {
  let id = 0;
  it("records creation and edits as activity", async () => {
    id = (await t.post("/api/tasks", { title: "Wire the hub" }, admin)).body.id;
    await t.patch(`/api/tasks/${id}`, { status: "in-progress", assignee_ids: [anaId], priority: "high" }, admin);
    const tl = (await t.api(`/api/tasks/${id}/timeline`, { session: admin })).body;
    expect(tl.activity.map((a: any) => a.kind)).toEqual(["created", "status", "priority", "assignees"]);
    expect(tl.activity[3].detail).toMatchObject({ added: [anaId], removed: [] });
  });

  it("a comment notifies assignees and @mentions once each; the author follows from then on", async () => {
    const r = await t.post(`/api/tasks/${id}/comments`, { body: "Hub mounted. @Ben can you test the CAN wiring?" }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await notes(anaId)).filter((n) => n.includes("commented on \"Wire the hub\""))).toHaveLength(1);
    expect((await notes(benId)).filter((n) => n.includes("mentioned you on \"Wire the hub\""))).toHaveLength(1);
    const tl = (await t.api(`/api/tasks/${id}/timeline`, { session: admin })).body;
    expect(tl.comments.map((c: any) => c.body)).toEqual(["Hub mounted. @Ben can you test the CAN wiring?"]);
    expect(tl.watching).toBe(true);
  });

  it("unwatching stops comment notifications; anyone can comment, only the author edits", async () => {
    await t.post(`/api/tasks/${id}/watch`, { watching: false }, ana);
    const before = (await notes(anaId)).length;
    const c = (await t.post(`/api/tasks/${id}/comments`, { body: "On it" }, ben)).body;
    expect((await notes(anaId)).length).toBe(before);
    expect((await t.patch(`/api/tasks/${id}/comments/${c.id}`, { body: "Hijack" }, ana)).status).toBe(403);
    expect((await t.patch(`/api/tasks/${id}/comments/${c.id}`, { body: "On it, done by 6" }, ben)).status).toBe(200);
    // Members delete their own; a task manager can delete any (kept as "deleted").
    expect((await t.api(`/api/tasks/${id}/comments/${c.id}`, { method: "DELETE", session: ana })).status).toBe(403);
    expect((await t.api(`/api/tasks/${id}/comments/${c.id}`, { method: "DELETE", session: admin })).status).toBe(200);
    const tl = (await t.api(`/api/tasks/${id}/timeline`, { session: admin })).body;
    expect(tl.comments.at(-1)).toMatchObject({ body: "", deleted_at: expect.any(String) });
  });

  it("a hidden board task's timeline and comments are off limits to members who can't see it", async () => {
    const board = (await t.post("/api/tasks", { title: "Board money", is_board: 1 }, admin)).body.id;
    expect((await t.api(`/api/tasks/${board}/timeline`, { session: ana })).status).toBe(404);
    expect((await t.post(`/api/tasks/${board}/comments`, { body: "peek" }, ana)).status).toBe(404);
  });
});

describe("live timeline events", () => {
  it("a board task's timeline events reach only members who can see board tasks", async () => {
    const listen = async (session: string) => {
      const ws = new WebSocket(`ws://127.0.0.1:${t.port}`);
      const seen: any[] = [];
      ws.on("message", (d) => { try { seen.push(JSON.parse(String(d))); } catch { /* ignore */ } });
      await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
      ws.send(JSON.stringify({ type: "hello", sessionId: session }));
      return { ws, seen };
    };
    const member = await listen(ana);
    const manager = await listen(admin);
    await new Promise((r) => setTimeout(r, 400));
    const board = (await t.post("/api/tasks", { title: "Board-only plan", is_board: 1 }, admin)).body.id;
    const open = (await t.post("/api/tasks", { title: "Open plan" }, admin)).body.id;
    await t.post(`/api/tasks/${board}/comments`, { body: "private" }, admin);
    await new Promise((r) => setTimeout(r, 600));
    member.ws.close(); manager.ws.close();
    const ids = (seen: any[]) => seen.filter((m) => m.type === "task_timeline").map((m) => m.task_id);
    expect(ids(member.seen)).toContain(open);
    expect(ids(member.seen)).not.toContain(board);
    expect(ids(manager.seen)).toContain(board);
  });
});

describe("Bruno", () => {
  it("posts a comment through a confirmed card; an unknown task refuses the card", async () => {
    const id = (await t.post("/api/tasks", { title: "Order wheels", assignee_ids: [benId] }, admin)).body.id;
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-comment", items: [{ id: 999999, body: "x" }] }] }, admin)).status).toBe(400);
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-comment", items: [{ id, body: "Ordered from REV, arriving Friday." }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.applied).toEqual({ "task-comment": 1 });
    expect((await notes(benId)).some((n) => n.includes("Ordered from REV"))).toBe(true);
  });

  it("a comment longer than the limit refuses the card instead of being cut", async () => {
    const id = (await t.post("/api/tasks", { title: "Long talk" }, admin)).body.id;
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-comment", items: [{ id, body: "x".repeat(4001) }] }] }, admin);
    expect(r.status).toBe(400);
    expect(await dbAll("SELECT id FROM task_comments WHERE task_id = ?", id)).toHaveLength(0);
  });

  it("task_activity reads one task's discussion and history, oldest first", async () => {
    const [row] = await dbAll("SELECT id FROM tasks WHERE title = 'Wire the hub'");
    const out = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "task_activity", task: Number(row.id) } as any]);
    expect(out).toMatch(/Ada Lovelace created it/);
    expect(out).toMatch(/Ada Lovelace commented: Hub mounted/);
    expect(out.indexOf("created it")).toBeLessThan(out.indexOf("commented"));
    // The deleted comment is left out.
    expect(out).toMatch(/task #\d+ "?Wire the hub"?: 1 comment,/);
    expect(out).not.toMatch(/On it/);
  });
});
