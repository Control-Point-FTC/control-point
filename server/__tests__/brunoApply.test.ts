/**
 * V3.5 phase 4: Bruno's confirmed tasks save assignee, priority, repeat, date
 * AND time in their own fields (recovered from the text when the model put
 * them there), and one confirm can carry many kinds at once.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
let arnav = 0;
let grace = 0;
beforeAll(async () => {
  t = await startTestServer("cp-bruno-apply-");
  team = await seedTeam(t.db, "Robo");
  await t.db.execute({ sql: "UPDATE teams SET timezone = 'America/New_York' WHERE id = ?", args: [team] });
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@ba.test", "admin"));
  arnav = await seedMember(t.db, team, "Arnav Patel", "arnav@ba.test");
  grace = await seedMember(t.db, team, "Grace Hopper", "grace@ba.test");
}, 120_000);
afterAll(async () => { await t?.stop(); });

const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];

describe("Bruno apply: task fields", () => {
  it("the reported bug: the fields the card resolved are saved in their own fields", async () => {
    // What the confirm card sends after resolving "High priority task ... (Assigned to Arnav). Due at 4:30pm."
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{
      title: "Test autonomous paths", description: "Task to test autonomous paths.",
      due_date: "2099-10-15", due_time: "16:30", priority: "high", assignees: ["Arnav Patel"],
    }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [task] = await rows("SELECT * FROM tasks WHERE title = 'Test autonomous paths'");
    expect(task).toMatchObject({ due_date: "2099-10-15", due_time: "16:30", priority: "high", assigned_to: arnav });
    expect(task.description).toBe("Task to test autonomous paths.");
    const who = (await rows("SELECT member_id FROM task_assignees WHERE task_id = ?", task.id)).map((x) => Number(x.member_id));
    expect(who).toEqual([arnav]);
    expect(await rows("SELECT id FROM notifications WHERE user_id = ? AND content = 'New task assigned: Test autonomous paths'", arnav)).toHaveLength(1);
  });

  it("uses the model's fields: several assignees by first name, repeat, urgent", async () => {
    await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{
      title: "Charge batteries", due_date: "2099-01-03", due_time: "18:00", priority: "urgent", assignees: ["arnav", "Grace"], repeat: "weekly",
    }] }] }, admin);
    const [task] = await rows("SELECT * FROM tasks WHERE title = 'Charge batteries'");
    expect(task).toMatchObject({ due_time: "18:00", priority: "urgent", assigned_to: arnav });
    expect(JSON.parse(task.recurrence)).toEqual({ freq: "weekly", interval: 1 });
    const who = (await rows("SELECT member_id FROM task_assignees WHERE task_id = ? ORDER BY member_id", task.id)).map((x) => Number(x.member_id));
    expect(who).toEqual([arnav, grace].sort((a, b) => a - b));
  });
});

describe("Bruno apply: many kinds at once", () => {
  it("pasted meeting notes: tasks, an event, outreach, a log entry and budget in one confirm", async () => {
    const r = await t.post("/api/ai/apply-actions", { actions: [
      { kind: "task", items: [{ title: "Order wheels", assignees: ["Grace"] }, { title: "Fix the lift", priority: "high" }] },
      { kind: "event", items: [{ title: "Follow-up meeting", date: "2099-02-01", time: "18:00" }] },
      { kind: "outreach", items: [{ title: "Library demo", date: "2099-02-10", hours: 2 }] },
      { kind: "communication", items: [{ recipient: "REV support", subject: "Wheel order", body: "Asked about lead times", date: "2099-01-20" }] },
      { kind: "budget", items: [{ type: "expense", amount: 60, category: "Wheels", description: "Mecanum wheels", date: "2099-01-20" }] },
      // A second tasks group from the same reply.
      { kind: "task", items: [{ title: "Update the notebook" }] },
    ] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.applied).toMatchObject({ task: 3, event: 1, outreach: 1, communication: 1, budget: 1 });
    // The new records' ids come back, so the card can link to them.
    expect(r.body.created.task).toHaveLength(3);
    for (const [kind, n] of Object.entries({ event: 1, outreach: 1, communication: 1, budget: 1 })) expect(r.body.created[kind], kind).toHaveLength(n);
    const titles = await t.db.execute({ sql: `SELECT title FROM tasks WHERE id IN (${r.body.created.task.map(() => "?").join(",")}) ORDER BY id`, args: r.body.created.task });
    expect(titles.rows.map((x: any) => x.title)).toEqual(['Order wheels', 'Fix the lift', 'Update the notebook']);
  });

  it("saves exactly what was confirmed: no fields read out of text on the server", async () => {
    await t.post("/api/ai/apply-actions", { actions: [
      { kind: "task", items: [{ title: "Read the manual", description: "Use the weekly report. High priority." }] },
      { kind: "event", items: [{ title: "Build session", date: "2099-03-01", notes: "From 3-5pm" }] },
    ] }, admin);
    const [task] = await rows("SELECT * FROM tasks WHERE title = 'Read the manual'");
    expect(task).toMatchObject({ priority: null, recurrence: null, description: "Use the weekly report. High priority." });
    const [ev] = await rows("SELECT * FROM events WHERE title = 'Build session' AND date = '2099-03-01'");
    expect(ev.start_time).toBe("");
    expect(await rows("SELECT id FROM tasks WHERE title IN ('Order wheels', 'Fix the lift', 'Update the notebook')")).toHaveLength(3);
  });
});

describe("Bruno apply: editing existing tasks", () => {
  it("updates the task in place — no duplicate — and reports its id", async () => {
    await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{ title: "Demo prep", assignees: ["Arnav"] }] }] }, admin);
    const [task] = await rows("SELECT * FROM tasks WHERE title = 'Demo prep'");
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{
      id: task.id, description: "For the First Street Kids demo", priority: "high", due_date: "2099-05-01", due_time: "17:00", assignees: ["Grace"],
    }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ applied: { "task-update": 1 }, created: { "task-update": [task.id] } });
    const all = await rows("SELECT * FROM tasks WHERE title = 'Demo prep'");
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ description: "For the First Street Kids demo", priority: "high", due_date: "2099-05-01", due_time: "17:00", status: "todo" });
    const who = (await rows("SELECT member_id FROM task_assignees WHERE task_id = ?", task.id)).map((x) => Number(x.member_id));
    expect(who).toEqual([grace]);
  });

  it("refuses another team's task or a deleted one, changing nothing; never marks done", async () => {
    const other = await seedTeam(t.db, "Elsewhere");
    const theirs = Number((await t.db.execute({ sql: "INSERT INTO tasks (team_id, title, status) VALUES (?, 'Theirs', 'todo')", args: [other] })).lastInsertRowid);
    const [mine] = await rows("SELECT * FROM tasks WHERE title = 'Demo prep'");
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: mine.id, title: "Renamed" }, { id: theirs, title: "Hijacked" }] }] }, admin);
    expect(r.status).toBe(400);
    expect((await rows("SELECT title FROM tasks WHERE id = ?", theirs))[0].title).toBe("Theirs");
    expect((await rows("SELECT title FROM tasks WHERE id = ?", mine.id))[0].title).toBe("Demo prep");
    // A new task next to an edit of a deleted one: nothing is written, so a retry can't duplicate it.
    const mixed = await t.post("/api/ai/apply-actions", { actions: [
      { kind: "task", items: [{ title: "Only once" }] },
      { kind: "task-update", items: [{ id: 987654, title: "Gone" }] },
    ] }, admin);
    expect(mixed.status).toBe(400);
    expect(await rows("SELECT id FROM tasks WHERE title = 'Only once'")).toHaveLength(0);
    const done = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: mine.id, status: "done" }] }] }, admin);
    expect(done.status).toBe(400);
    expect((await rows("SELECT status FROM tasks WHERE id = ?", mine.id))[0].status).toBe("todo");
  });

  it("assigns an edited task to everyone in a role", async () => {
    const role = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Drivers', '[]')", args: [team] })).lastInsertRowid);
    await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?), (?, ?)", args: [arnav, role, grace, role] });
    const [mine] = await rows("SELECT * FROM tasks WHERE title = 'Demo prep'");
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: mine.id, roles: ["drivers"] }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const who = (await rows("SELECT member_id FROM task_assignees WHERE task_id = ? ORDER BY member_id", mine.id)).map((x) => Number(x.member_id));
    expect(who).toEqual([arnav, grace].sort((a, b) => a - b));
  });

  it("smart groups work like roles: Everyone assigns every active member, Coaches & mentors follows role names", async () => {
    const coach = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Head Coach', '[]')", args: [team] })).lastInsertRowid);
    await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [grace, coach] });
    const ctx = await t.api("/api/ai/proposal-context", { session: admin });
    expect(ctx.body.roles.map((r: any) => r.name)).toEqual(expect.arrayContaining(["Everyone", "Coaches & mentors"]));
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [
      { title: "Whole team job", roles: ["everyone"] },
      { title: "Coach job", roles: ["Coaches & mentors"] },
    ] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const assigned = async (title: string) => {
      const [task] = await rows("SELECT id FROM tasks WHERE title = ?", title);
      return (await rows("SELECT member_id FROM task_assignees WHERE task_id = ? ORDER BY member_id", task.id)).map((x) => Number(x.member_id));
    };
    const active = (await rows("SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY id", team)).map((x) => Number(x.id));
    expect(await assigned("Whole team job")).toEqual(active);
    expect(await assigned("Coach job")).toEqual([grace]);
    // An empty real role named Everyone would assign nobody: the group stands in for it, as in the picker.
    const empty = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Everyone', '[]')", args: [team] })).lastInsertRowid);
    const ctx2 = await t.api("/api/ai/proposal-context", { session: admin });
    expect(ctx2.body.roles.filter((r: any) => r.name === "Everyone")).toHaveLength(1);
    expect(ctx2.body.roles.find((r: any) => r.name === "Everyone").members.length).toBe(active.length);
    const r2 = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{ title: "Whole team again", roles: ["Everyone"] }] }] }, admin);
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    expect(await assigned("Whole team again")).toEqual(active);
    // Once someone holds the real role, it wins over the group.
    await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [grace, empty] });
    await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{ title: "Real Everyone role", roles: ["Everyone"] }] }] }, admin);
    expect(await assigned("Real Everyone role")).toEqual([grace]);
    await t.db.execute({ sql: "DELETE FROM member_roles WHERE role_id IN (?, ?)", args: [coach, empty] });
    await t.db.execute({ sql: "DELETE FROM roles WHERE id IN (?, ?)", args: [coach, empty] });
  });

  it("several edits to one task all land (a date in one, a time in the next)", async () => {
    await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{ title: "Split edit" }] }] }, admin);
    const [task] = await rows("SELECT * FROM tasks WHERE title = 'Split edit'");
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: task.id, due_date: "2099-11-01" }, { id: task.id, due_time: "17:00" }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await rows("SELECT due_date, due_time FROM tasks WHERE id = ?", task.id))[0]).toMatchObject({ due_date: "2099-11-01", due_time: "17:00" });
    // A later "unassign everyone" also drops an earlier role assignment.
    const unassign = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: task.id, roles: ["Drivers"] }, { id: task.id, assignees: [] }] }] }, admin);
    expect(unassign.status, JSON.stringify(unassign.body)).toBe(200);
    expect(await rows("SELECT member_id FROM task_assignees WHERE task_id = ?", task.id)).toHaveLength(0);
  });

  it("needs task access", async () => {
    const plain = await t.session(await seedMember(t.db, team, "Pat", "pat@ba.test"));
    const [mine] = await rows("SELECT * FROM tasks WHERE title = 'Demo prep'");
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task-update", items: [{ id: mine.id, title: "Nope" }] }] }, plain);
    expect(r.status).toBe(403);
  });
});

describe("Bruno apply: assigning by role", () => {
  it("assigns everyone holding the role, plus named people, and the card's context lists the roles", async () => {
    const role = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Builders', '[]')", args: [team] })).lastInsertRowid);
    await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?), (?, ?)", args: [arnav, role, grace, role] });
    const ctx = await t.api("/api/ai/proposal-context", { session: admin });
    expect(ctx.body.roles).toContainEqual({ name: "Builders", members: ["Arnav Patel", "Grace Hopper"] });
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [
      { title: "Cut the field tiles", roles: ["builders"] },
      { title: "Unknown crew job", roles: ["Pit crew"] },
    ] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const assigned = async (title: string) => {
      const [task] = await rows("SELECT id FROM tasks WHERE title = ?", title);
      return (await rows("SELECT member_id FROM task_assignees WHERE task_id = ? ORDER BY member_id", task.id)).map((x) => Number(x.member_id));
    };
    expect(await assigned("Cut the field tiles")).toEqual([arnav, grace].sort((a, b) => a - b));
    expect(await assigned("Unknown crew job")).toEqual([]); // no such role: nobody guessed
  });

  it("never picks between roles that share a name, and lists roles nobody holds yet", async () => {
    // Both spellings exist here whatever ran before (INSERT OR IGNORE-style: only if missing).
    if (!(await rows("SELECT id FROM roles WHERE team_id = ? AND name = 'Builders'", team)).length) await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Builders', '[]')", args: [team] });
    const lower = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'builders', '[]')", args: [team] })).lastInsertRowid);
    await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [arnav, lower] });
    await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Mentors', '[]')", args: [team] });
    const ctx = await t.api("/api/ai/proposal-context", { session: admin });
    expect(ctx.body.roles).toContainEqual({ name: "Mentors", members: [] });
    expect(ctx.body.roles).toContainEqual({ name: "builders", members: ["Arnav Patel"] });
    await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [
      { title: "Exact lower", roles: ["builders"] },
      { title: "Ambiguous case", roles: ["BUILDERS"] },
    ] }] }, admin);
    const assigned = async (title: string) => {
      const [task] = await rows("SELECT id FROM tasks WHERE title = ?", title);
      return (await rows("SELECT member_id FROM task_assignees WHERE task_id = ? ORDER BY member_id", task.id)).map((x) => Number(x.member_id));
    };
    expect(await assigned("Exact lower")).toEqual([arnav]); // the exact spelling wins
    expect(await assigned("Ambiguous case")).toEqual([]); // fits two roles: nobody guessed
  });
});
