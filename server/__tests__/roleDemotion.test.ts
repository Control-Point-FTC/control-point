/**
 * H-2: "Admin → Member demotion silently does not persist". The member
 * editor now sends account_type; the server applies it through the system
 * Admin role, and if another role still grants admin it says which one
 * instead of reporting a success that didn't happen.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let owner = "";
let ownerId = 0;
let secondId = 0;

const accountType = async (id: number) =>
  String(((await t.db.execute({ sql: "SELECT account_type FROM members WHERE id = ?", args: [id] })).rows[0] as any).account_type);

beforeAll(async () => {
  t = await startTestServer("cp-roles-");
  team = await seedTeam(t.db, "Roles Team");
  ownerId = await seedMember(t.db, team, "Owner", "owner@test.local", "admin");
  secondId = await seedMember(t.db, team, "Second", "second@test.local", "admin");
  await t.db.execute({ sql: "UPDATE members SET scopes = ? WHERE id = ?", args: ['["budget","admin"]', secondId] });
  owner = await t.session(ownerId);
  await t.api("/api/auth/me", { session: owner }); // seeds roles (both admins get Admin)
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("H-2 role demotion", () => {
  it("demoting an admin in the member editor sticks", async () => {
    const r = await t.patch(`/api/members/${secondId}`, { name: "Second", role: "Builder", account_type: "student", is_board: false }, owner);
    expect(r.status).toBe(200);
    expect(r.body.account_type).toBe("student");
    expect(r.body.stillAdminVia).toBeUndefined();
    expect(await accountType(secondId)).toBe("student");
    // Their own view agrees: no admin permissions.
    const s = await t.session(secondId);
    const me = await t.api("/api/auth/me", { session: s });
    expect(me.body.user.permissions).not.toContain("*");
    expect((await t.post("/api/invites", {}, s)).status).toBe(403);
  });

  it("legacy scopes are left alone when the editor doesn't send them", async () => {
    const row = (await t.db.execute({ sql: "SELECT scopes FROM members WHERE id = ?", args: [secondId] })).rows[0] as any;
    expect(row.scopes).toBe('["budget","admin"]');
  });

  it("a custom role that still grants admin is named instead of a silent no-op", async () => {
    await t.patch(`/api/members/${secondId}`, { name: "Second", account_type: "admin" }, owner);
    const role = await t.post("/api/roles", { name: "Co-captain", permissions: ["manage_members"] }, owner);
    const roleId = role.body.id ?? role.body.role?.id;
    await t.post(`/api/members/${secondId}/roles`, { role_id: roleId }, owner);
    const r = await t.patch(`/api/members/${secondId}`, { name: "Second", account_type: "student" }, owner);
    expect(r.status).toBe(200);
    expect(r.body.stillAdminVia).toBe("Co-captain");
    expect(r.body.account_type).toBe("admin");
  });

  it("the last admin can't be demoted", async () => {
    // Make Owner the only admin, then try to demote them.
    const roles = await t.api("/api/roles", { session: owner });
    const coCaptain = roles.body.find((x: any) => x.name === "Co-captain");
    await t.api(`/api/members/${secondId}/roles/${coCaptain.id}`, { method: "DELETE", session: owner });
    await t.patch(`/api/members/${secondId}`, { name: "Second", account_type: "student" }, owner);
    expect(await accountType(secondId)).toBe("student");
    const r = await t.patch(`/api/members/${ownerId}`, { name: "Owner", account_type: "student" }, owner);
    expect(r.status).toBe(400);
    expect(await accountType(ownerId)).toBe("admin");
  });
});
