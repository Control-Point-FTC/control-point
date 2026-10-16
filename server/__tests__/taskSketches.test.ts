/**
 * Feature parity, Phase 1.5: sketches on a task. Anyone who can see the task
 * adds one; its author or a task manager edits or removes it. Strokes are
 * validated before they're stored, the timeline carries them (so they're
 * live), every change is activity, and Bruno's task_activity lookup says who
 * drew what.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { cleanSketch, MAX_SKETCHES_PER_TASK, SKETCH_W } from "../../src/types/taskSketch";

vi.setConfig({ testTimeout: 30_000 });

const stroke = (x = 10) => ({ tool: "pen", color: "#2587DB", width: 4, points: [[x, 10, 0.5], [x + 40, 60, 0.7]] });

describe("cleanSketch", () => {
  it("keeps valid strokes (clamped, rounded, colour lower-cased); refuses empty or malformed ones", () => {
    const s = cleanSketch({ strokes: [{ tool: "highlighter", color: "#ABCDEF", width: 8, points: [[-5, 20.123], [SKETCH_W + 50, 30, 2]] }] })!;
    expect(s.strokes[0]).toEqual({ tool: "highlighter", color: "#abcdef", width: 8, points: [[0, 20.1, 0.5], [SKETCH_W, 30, 1]] });
    expect(cleanSketch({ strokes: [] })).toBeNull();
    expect(cleanSketch({ strokes: [{ tool: "laser", color: "#000000", width: 4, points: [[1, 1]] }] })).toBeNull();
    expect(cleanSketch({ strokes: [{ tool: "pen", color: "red", width: 4, points: [[1, 1]] }] })).toBeNull();
    expect(cleanSketch({ strokes: [{ tool: "pen", color: "#000000", width: 4, points: [["x", 1]] }] })).toBeNull();
    expect(cleanSketch({ strokes: [{ tool: "pen", color: "#000000", width: 4, points: Array.from({ length: 30001 }, () => [1, 1]) }] })).toBeNull();
  });
});

let t: TestServer;
let team = 0;
let admin = "", ana = "", ben = "";
let anaId = 0;
const dbAll = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];

beforeAll(async () => {
  t = await startTestServer("cp-task-sketches-");
  team = await seedTeam(t.db, "Draw Team");
  admin = await t.session(await seedMember(t.db, team, "Ada Lovelace", "ada@draw.test", "admin"));
  anaId = await seedMember(t.db, team, "Ana Ortiz", "ana@draw.test");
  ana = await t.session(anaId);
  ben = await t.session(await seedMember(t.db, team, "Ben Cole", "ben@draw.test"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("task sketches", () => {
  it("a member adds one; the timeline carries it and the activity says so", async () => {
    const id = (await t.post("/api/tasks", { title: "Intake geometry" }, admin)).body.id;
    const r = await t.post(`/api/tasks/${id}/sketches`, { title: "Roller spacing", strokes: [stroke()] }, ana);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const tl = (await t.api(`/api/tasks/${id}/timeline`, { session: ben })).body;
    expect(tl.sketches).toHaveLength(1);
    expect(tl.sketches[0]).toMatchObject({ title: "Roller spacing", member_id: anaId });
    expect(tl.sketches[0].strokes[0]).toMatchObject({ tool: "pen", color: "#2587db" });
    expect(tl.activity.at(-1)).toMatchObject({ kind: "sketch_added", detail: { title: "Roller spacing" } });
    // Bruno: who drew what, and that it's a drawing he can't read.
    const out = await runLookups(dbAll as any, team, "America/New_York", [{ kind: "task_activity", task: Number(id) } as any]);
    expect(out).toMatch(/Ana Ortiz added a sketch "Roller spacing"/);
    expect(out).toMatch(/sketch by Ana Ortiz: Roller spacing/);
    expect(out).toMatch(/1 sketch\b/);
  });

  it("only the author or a task manager edits or removes it; empty drawings are refused", async () => {
    const id = (await t.post("/api/tasks", { title: "Wiring plan" }, admin)).body.id;
    expect((await t.post(`/api/tasks/${id}/sketches`, { strokes: [] }, ana)).status).toBe(400);
    const sid = (await t.post(`/api/tasks/${id}/sketches`, { strokes: [stroke()] }, ana)).body.id;
    expect((await t.patch(`/api/tasks/${id}/sketches/${sid}`, { title: "Mine now", strokes: [stroke(50)] }, ben)).status).toBe(403);
    expect((await t.api(`/api/tasks/${id}/sketches/${sid}`, { method: "DELETE", session: ben })).status).toBe(403);
    expect((await t.patch(`/api/tasks/${id}/sketches/${sid}`, { title: "Hub wiring", strokes: [stroke(50), stroke(90)] }, ana)).status).toBe(200);
    const [row] = await dbAll("SELECT title, strokes FROM task_sketches WHERE id = ?", sid);
    expect(row.title).toBe("Hub wiring");
    expect(JSON.parse(row.strokes).strokes).toHaveLength(2);
    expect((await t.api(`/api/tasks/${id}/sketches/${sid}`, { method: "DELETE", session: admin })).status).toBe(200);
    expect(await dbAll("SELECT id FROM task_sketches WHERE id = ?", sid)).toHaveLength(0);
    const kinds = (await dbAll("SELECT kind FROM task_activity WHERE task_id = ? ORDER BY id", id)).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["sketch_added", "sketch_edited", "sketch_removed"]));
  });

  it(`a task holds up to ${MAX_SKETCHES_PER_TASK}; sketches go with their task`, async () => {
    const id = (await t.post("/api/tasks", { title: "Field plan" }, admin)).body.id;
    await Promise.all(Array.from({ length: MAX_SKETCHES_PER_TASK + 3 }, (_, i) => t.post(`/api/tasks/${id}/sketches`, { strokes: [stroke(i)] }, admin)));
    expect(await dbAll("SELECT id FROM task_sketches WHERE task_id = ?", id)).toHaveLength(MAX_SKETCHES_PER_TASK);
    expect((await t.post(`/api/tasks/${id}/sketches`, { strokes: [stroke()] }, admin)).status).toBe(400);
    await t.api(`/api/tasks/${id}`, { method: "DELETE", session: admin });
    expect(await dbAll("SELECT id FROM task_sketches WHERE task_id = ?", id)).toHaveLength(0);
  });

  it("members who can't see the task can't sketch on it", async () => {
    const id = (await t.post("/api/tasks", { title: "Board secret", is_board: 1 }, admin)).body.id;
    expect((await t.post(`/api/tasks/${id}/sketches`, { strokes: [stroke()] }, ana)).status).toBe(404);
  });
});
