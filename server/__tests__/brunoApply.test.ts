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
  it("the reported bug: fields dumped in the description land in their own fields", async () => {
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "task", items: [{
      title: "Test autonomous paths",
      description: "High priority task to test autonomous paths (Assigned to Arnav). Due at 4:30pm.",
      due_date: "2099-10-15",
    }] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [task] = await rows("SELECT * FROM tasks WHERE title = 'Test autonomous paths'");
    expect(task).toMatchObject({ due_date: "2099-10-15", due_time: "16:30", priority: "high", assigned_to: arnav });
    expect(task.description).not.toMatch(/priority|assigned|4:30/i);
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
    expect(await rows("SELECT id FROM tasks WHERE title IN ('Order wheels', 'Fix the lift', 'Update the notebook')")).toHaveLength(3);
  });
});
