/**
 * V5 audit M3: "Manage roles" could grant the Admin role — to anyone,
 * including yourself — and create or edit roles with any permission. Now you
 * can only hand out, take away, create, edit or delete roles whose
 * permissions you hold yourself (full admins can manage every role).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
let adminId = 0;
let manager = "";
let managerId = 0;
let peerId = 0;
let adminRole = 0;
let managerRole = 0;
let crewRole = 0;
let budgetRole = 0;
beforeAll(async () => {
  t = await startTestServer("cp-roles-");
  team = await seedTeam(t.db, "Roles Team");
  adminId = await seedMember(t.db, team, "Ada", "ada@roles.test", "admin");
  admin = await t.session(adminId);
  // The system roles are seeded on first use.
  expect((await t.api("/api/roles", { session: admin })).status).toBe(200);
  adminRole = Number(((await t.db.execute({ sql: "SELECT id FROM roles WHERE team_id = ? AND name = 'Admin'", args: [team] })).rows[0] as any).id);
  await t.db.execute({ sql: "INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [adminId, adminRole] });
  managerRole = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Role managers', ?)", args: [team, JSON.stringify(["manage_roles", "manage_tasks"])] })).lastInsertRowid);
  managerId = await seedMember(t.db, team, "Mo", "mo@roles.test");
  await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [managerId, managerRole] });
  manager = await t.session(managerId);
  peerId = await seedMember(t.db, team, "Pat", "pat@roles.test");
  // A role within the manager's permissions, and one above them (made by the admin).
  crewRole = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Pit crew', ?)", args: [team, JSON.stringify(["manage_tasks"])] })).lastInsertRowid);
  budgetRole = Number((await t.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Finance', ?)", args: [team, JSON.stringify(["manage_budget"])] })).lastInsertRowid);
}, 120_000);
const roleRow = async (id: number) => (await t.db.execute({ sql: "SELECT name, permissions FROM roles WHERE id = ?", args: [id] })).rows[0] as any;
afterAll(async () => { await t?.stop(); });

const roleIds = async (memberId: number) =>
  (await t.db.execute({ sql: "SELECT role_id FROM member_roles WHERE member_id = ?", args: [memberId] })).rows.map((r: any) => Number(r.role_id));

describe("Manage roles can't escalate", () => {
  it("can't give anyone — or themselves — the Admin role", async () => {
    expect((await t.post(`/api/members/${managerId}/roles`, { role_id: adminRole }, manager)).status).toBe(403);
    expect((await t.post(`/api/members/${peerId}/roles`, { role_id: adminRole }, manager)).status).toBe(403);
    expect(await roleIds(managerId)).not.toContain(adminRole);
  });

  it("can't create or edit a role with permissions they don't have", async () => {
    expect((await t.post("/api/roles", { name: "Treasurers", permissions: ["manage_budget"] }, manager)).status).toBe(403);
    const ok = await t.post("/api/roles", { name: "Task crew", permissions: ["manage_tasks"] }, manager);
    expect(ok.status).toBe(200);
    expect((await t.patch(`/api/roles/${ok.body.id}`, { permissions: ["manage_tasks", "manage_members"] }, manager)).status).toBe(403);
    expect((await t.patch(`/api/roles/${managerRole}`, { permissions: ["manage_roles", "manage_tasks", "manage_budget"] }, manager)).status).toBe(403);
  });

  it("can't rename, empty or delete a role that has more than they do", async () => {
    expect((await t.patch(`/api/roles/${budgetRole}`, { name: "Renamed" }, manager)).status).toBe(403);
    expect((await t.patch(`/api/roles/${budgetRole}`, { permissions: [] }, manager)).status).toBe(403);
    expect((await t.api(`/api/roles/${budgetRole}`, { method: "DELETE", session: manager })).status).toBe(403);
    expect(await roleRow(budgetRole)).toMatchObject({ name: "Finance", permissions: JSON.stringify(["manage_budget"]) });
  });

  it("can hand out a role within their own permissions, but can't take the Admin role away", async () => {
    expect((await t.post(`/api/members/${peerId}/roles`, { role_id: crewRole }, manager)).status).toBe(200);
    expect(await roleIds(peerId)).toContain(crewRole);
    expect((await t.api(`/api/members/${adminId}/roles/${adminRole}`, { method: "DELETE", session: manager })).status).toBe(403);
    expect(await roleIds(adminId)).toContain(adminRole);
  });

  it("a full admin still manages every role", async () => {
    expect((await t.post("/api/roles", { name: "Treasurers", permissions: ["manage_budget"] }, admin)).status).toBe(200);
    expect((await t.post(`/api/members/${peerId}/roles`, { role_id: adminRole }, admin)).status).toBe(200);
    expect((await t.api(`/api/members/${peerId}/roles/${adminRole}`, { method: "DELETE", session: admin })).status).toBe(200);
  });
});
