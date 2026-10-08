/**
 * Bruno memory routes (own facts, team facts for managers only, never another
 * team's) and the morning nudge (once a day, only when there's something).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });
const NUDGE_HOUR = new Date().getUTCHours();

let t: TestServer;
let team = 0;
let admin = "";
let adminId = 0;
let member = "";
let memberId = 0;
let quietId = 0;
let outsider = "";
beforeAll(async () => {
  t = await startTestServer("cp-bruno-mem-", { BRUNO_NUDGE_SWEEP_MS: "1000", BRUNO_NUDGE_HOUR: String(NUDGE_HOUR) });
  team = await seedTeam(t.db, "Robo");
  await t.db.execute({ sql: "UPDATE teams SET timezone = 'UTC' WHERE id = ?", args: [team] });
  adminId = await seedMember(t.db, team, "Ada", "ada@mem.test", "admin");
  admin = await t.session(adminId);
  memberId = await seedMember(t.db, team, "Arnav", "arnav@mem.test");
  member = await t.session(memberId);
  quietId = await seedMember(t.db, team, "Quinn", "quinn@mem.test");
  await t.db.execute({ sql: "UPDATE members SET bruno_nudges = 0 WHERE id = ?", args: [quietId] });
  const other = await seedTeam(t.db, "Other");
  outsider = await t.session(await seedMember(t.db, other, "Olu", "olu@mem.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const del = (path: string, session: string) => t.api(path, { method: "DELETE", session });

describe("memories", () => {
  it("members keep their own facts; only managers add team facts; nobody touches another team's", async () => {
    const mine = await t.post("/api/bruno/memories", { content: "Prefers Java" }, member);
    expect(mine.status).toBe(200);
    expect((await t.post("/api/bruno/memories", { content: "We run mecanum", scope: "team" }, member)).status).toBe(403);
    const teamFact = await t.post("/api/bruno/memories", { content: "We run mecanum", scope: "team" }, admin);
    expect(teamFact.status).toBe(200);

    const seen = (await t.api("/api/bruno/memories", { session: member })).body;
    expect(seen.user.map((m: any) => m.content)).toEqual(["Prefers Java"]);
    expect(seen.team.map((m: any) => m.content)).toEqual(["We run mecanum"]);
    expect(seen.canEditTeam).toBe(false);
    // Ada doesn't see Arnav's personal facts.
    expect((await t.api("/api/bruno/memories", { session: admin })).body.user).toEqual([]);

    expect((await del(`/api/bruno/memories/${teamFact.body.memory.id}`, member)).status).toBe(404);
    expect((await del(`/api/bruno/memories/${mine.body.memory.id}`, outsider)).status).toBe(404);
    expect((await del(`/api/bruno/memories/${mine.body.memory.id}`, admin)).status).toBe(404);
    expect((await del(`/api/bruno/memories/${mine.body.memory.id}`, member)).status).toBe(200);
    expect((await del(`/api/bruno/memories/${teamFact.body.memory.id}`, admin)).status).toBe(200);
  });

  it("a manual add goes through the same duplicate check as chat", async () => {
    const first = await t.post("/api/bruno/memories", { content: "Drives the robot" }, member);
    expect(first.status).toBe(200);
    expect((await t.post("/api/bruno/memories", { content: "drives the robot." }, member)).status).toBe(409);
    expect(await rows("SELECT id FROM bruno_memories WHERE member_id = ?", memberId)).toHaveLength(1);
    await del(`/api/bruno/memories/${first.body.memory.id}`, member);
  });

  it("two saves of the same fact at once keep one copy", async () => {
    const both = await Promise.all([1, 2, 3].map(() => t.post("/api/bruno/memories", { content: "Team captain" }, member)));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const saved = await rows("SELECT id FROM bruno_memories WHERE member_id = ? AND content = 'Team captain'", memberId);
    expect(saved).toHaveLength(1);
    await del(`/api/bruno/memories/${saved[0].id}`, member);
  });

  it("the nudge setting is saved on the profile", async () => {
    const r = await t.patch("/api/profile", { name: "Arnav", role: "", bruno_nudges: false }, member);
    expect(r.status).toBe(200);
    expect(Number((await rows("SELECT bruno_nudges FROM members WHERE id = ?", memberId))[0].bruno_nudges)).toBe(0);
    await t.patch("/api/profile", { name: "Arnav", role: "", bruno_nudges: true }, member);
  });
});

describe("morning nudge", () => {
  it("one note per member per day, only with something to report, respecting the setting", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const [title, due, who] of [["Due today", today, memberId], ["Late", yesterday, memberId], ["Quinn's", today, quietId], ["Nobody's", today, null]] as const) {
      const info = await t.db.execute({ sql: "INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, is_board, created_at) VALUES (?, ?, '', 'todo', ?, ?, 0, ?)", args: [team, title, who, due, new Date().toISOString()] });
      if (who) await t.db.execute({ sql: "INSERT INTO task_assignees (task_id, member_id) VALUES (?, ?)", args: [Number(info.lastInsertRowid), who] });
    }
    // A board-only task the student's task page hides doesn't count for them.
    const board = await t.db.execute({ sql: "INSERT INTO tasks (team_id, title, description, status, assigned_to, due_date, is_board, created_at) VALUES (?, 'Board budget', '', 'todo', ?, ?, 1, ?)", args: [team, memberId, today, new Date().toISOString()] });
    await t.db.execute({ sql: "INSERT INTO task_assignees (task_id, member_id) VALUES (?, ?)", args: [Number(board.lastInsertRowid), memberId] });
    let notes: any[] = [];
    for (let i = 0; i < 40 && notes.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 250));
      notes = await rows("SELECT user_id, content FROM notifications WHERE content LIKE 'Good morning!%' ORDER BY user_id");
    }
    const byUser = Object.fromEntries(notes.map((n) => [Number(n.user_id), n.content]));
    expect(byUser[memberId]).toBe("Good morning! You have 1 task due today and 1 task overdue.");
    // The admin manages tasks: hears about the unassigned one (nothing of their own).
    expect(byUser[adminId]).toBe("Good morning! 1 team task is still unassigned.");
    expect(byUser[quietId]).toBeUndefined();
    await new Promise((r) => setTimeout(r, 1500));
    expect(await rows("SELECT id FROM notifications WHERE content LIKE 'Good morning!%'")).toHaveLength(2);
  });
});
