/**
 * V5 audit M4: outreach entries could be added, edited and deleted by any
 * signed-in member. They now need "Manage outreach", like the outreach social
 * accounts and Bruno's outreach proposals (the default Member role has it).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let withPerm = "";
let without = "";
beforeAll(async () => {
  t = await startTestServer("cp-outreach-");
  team = await seedTeam(t.db, "Outreach Team");
  const role = async (name: string, perms: string[]) =>
    Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, ?, ?)", args: [team, name, JSON.stringify(perms)] })).lastInsertRowid);
  const member = async (name: string, email: string, roleId: number) => {
    const id = await seedMember(t.db, team, name, email);
    await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [id, roleId] });
    return t.session(id);
  };
  withPerm = await member("Olive", "olive@out.test", await role("Outreach crew", ["manage_outreach"]));
  without = await member("Bob", "bob@out.test", await role("Builders", ["manage_tasks"]));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("outreach entries", () => {
  it("need Manage outreach to add, edit or delete", async () => {
    expect((await t.post("/api/outreach", { title: "Library demo", date: "2026-10-20" }, without)).status).toBe(403);
    const made = await t.post("/api/outreach", { title: "Library demo", date: "2026-10-20" }, withPerm);
    expect(made.status).toBe(200);
    const [row] = (await t.db.execute({ sql: "SELECT id FROM outreach WHERE team_id = ? AND title = 'Library demo'", args: [team] })).rows as any[];
    expect((await t.patch(`/api/outreach/${row.id}`, { title: "Hijacked", date: "2026-10-20" }, without)).status).toBe(403);
    expect((await t.api(`/api/outreach/${row.id}`, { method: "DELETE", session: without })).status).toBe(403);
    expect((await t.patch(`/api/outreach/${row.id}`, { title: "Library demo (moved)", date: "2026-10-21" }, withPerm)).status).toBe(200);
    expect((await t.api(`/api/outreach/${row.id}`, { method: "DELETE", session: withPerm })).status).toBe(200);
  });

  it("Bruno's outreach proposals need it too", async () => {
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "outreach", items: [{ title: "Robot demo", date: "2026-10-22", hours: 2 }] }] }, without);
    expect(r.status).toBe(403);
    expect((await t.post("/api/ai/apply-actions", { actions: [{ kind: "outreach", items: [{ title: "Robot demo", date: "2026-10-22", hours: 2 }] }] }, withPerm)).status).toBe(200);
  });
});
