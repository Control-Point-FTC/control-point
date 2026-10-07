/**
 * Join links (UX-1 / UX-4): admins and people with "Invite people" create
 * revocable, expiring, use-limited links; members never see the access code;
 * approval links file a join request instead of adding the person.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { inviteState, parseInviteOptions, looksLikeInviteToken, newInviteToken } from "../invites";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let otherTeam = 0;
let admin = "";
let member = "";
let inviter = "";
let outsider = "";
let outsiderEmail = "outsider@test.local";

beforeAll(async () => {
  t = await startTestServer("cp-invites-");
  team = await seedTeam(t.db, "Invite Team");
  otherTeam = await seedTeam(t.db, "Elsewhere");
  await t.db.execute({ sql: "UPDATE teams SET access_code = 'CP-ABCD-123456' WHERE id = ?", args: [team] });
  await t.db.execute({ sql: "UPDATE teams SET access_code = 'CP-WXYZ-654321' WHERE id = ?", args: [otherTeam] });
  const adminId = await seedMember(t.db, team, "Admin", "admin@test.local", "admin");
  const memberId = await seedMember(t.db, team, "Member", "member@test.local");
  const inviterId = await seedMember(t.db, team, "Inviter", "inviter@test.local");
  const outsiderId = await seedMember(t.db, otherTeam, "Outsider", outsiderEmail, "admin");
  admin = await t.session(adminId);
  member = await t.session(memberId);
  inviter = await t.session(inviterId);
  outsider = await t.session(outsiderId);
  // Seeds the system roles (admin → Admin, others → Member).
  await t.api("/api/auth/me", { session: admin });
  await t.api("/api/auth/me", { session: outsider });
  // A custom role carrying only "Invite people".
  const role = await t.post("/api/roles", { name: "Recruiter", permissions: ["invite_members"] }, admin);
  expect(role.status).toBe(200);
  const roleId = role.body.id ?? role.body.role?.id;
  await t.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [inviterId, roleId] });
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("invite helpers", () => {
  it("states and options", () => {
    const base = { id: 1, team_id: 1, expires_at: null, max_uses: null, uses: 0, requires_approval: 0, revoked_at: null };
    expect(inviteState(base)).toBe("active");
    expect(inviteState({ ...base, revoked_at: "2026-01-01 00:00:00" })).toBe("revoked");
    expect(inviteState({ ...base, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe("expired");
    expect(inviteState({ ...base, max_uses: 2, uses: 2 })).toBe("used_up");
    expect(parseInviteOptions({ expires_in_hours: 5 })).toHaveProperty("error");
    expect(parseInviteOptions({ max_uses: 3 })).toHaveProperty("error");
    const ok = parseInviteOptions({ expires_in_hours: null, max_uses: 10, requires_approval: true }) as any;
    expect(ok).toMatchObject({ expiresAt: null, maxUses: 10, requiresApproval: true });
    expect(looksLikeInviteToken(newInviteToken())).toBe(true);
    expect(looksLikeInviteToken("cpi_' OR 1=1 --")).toBe(false);
  });
});

describe("access code visibility", () => {
  it("members don't get the access code; admins do", async () => {
    const m = await t.api("/api/teams", { session: member });
    expect(m.status).toBe(200);
    expect(m.body[0].access_code).toBeUndefined();
    expect(m.body[0].can_invite).toBe(false);
    const me = await t.api("/api/auth/me", { session: member });
    expect(JSON.stringify(me.body)).not.toContain("CP-ABCD-123456");
    const a = await t.api("/api/teams", { session: admin });
    expect(a.body[0].access_code).toBe("CP-ABCD-123456");
    expect(a.body[0].can_invite).toBe(true);
  });

  it("joining by code works with or without dashes and returns no code to the joiner", async () => {
    const r = await t.post("/api/teams/join", { access_code: "cpabcd123456" }, outsider);
    expect(r.status).toBe(200);
    expect(r.body.joined).toBe(true);
    expect(r.body.team.access_code).toBeUndefined();
    expect(r.body.user.teams.find((x: any) => x.id === team).access_code).toBeUndefined();
    // Their own (admin) workspace still shows its code.
    expect(r.body.user.teams.find((x: any) => x.id === otherTeam).access_code).toBe("CP-WXYZ-654321");
    await t.post("/api/teams/leave", { team_id: team }, outsider);
  });
});

describe("invite links", () => {
  it("only admins and people with Invite people can create links", async () => {
    expect((await t.post("/api/invites", {}, member)).status).toBe(403);
    expect((await t.api("/api/invites", { session: member })).status).toBe(403);
    const r = await t.post("/api/invites", { expires_in_hours: 24, max_uses: 5 }, inviter);
    expect(r.status).toBe(200);
    expect(r.body.url).toContain(`/join/${r.body.token}`);
    expect(r.body.invite).toMatchObject({ max_uses: 5, uses: 0, state: "active", requires_approval: false });
    // Only a hash is stored.
    const row = (await t.db.execute({ sql: "SELECT token_hash FROM team_invites WHERE id = ?", args: [r.body.invite.id] })).rows[0] as any;
    expect(row.token_hash).not.toContain(r.body.token);
    const list = await t.api("/api/invites", { session: admin });
    expect(JSON.stringify(list.body)).not.toContain(r.body.token);
  });

  it("the preview shows only the team name; accepting adds a Member and counts a use", async () => {
    const { body } = await t.post("/api/invites", { max_uses: 1 }, admin);
    const peek = await t.api(`/api/invites/preview/${body.token}`);
    expect(peek.status).toBe(200);
    expect(peek.body.team.name).toBe("Invite Team");
    expect(JSON.stringify(peek.body)).not.toContain("CP-ABCD");
    const acc = await t.post("/api/invites/accept", { token: body.token }, outsider);
    expect(acc.status).toBe(200);
    expect(acc.body.joined).toBe(true);
    expect(acc.body.team.access_code).toBeUndefined();
    const used = (await t.db.execute({ sql: "SELECT uses FROM team_invites WHERE id = ?", args: [body.invite.id] })).rows[0] as any;
    expect(Number(used.uses)).toBe(1);
    // Accepting again while already in costs nothing, even though it's used up.
    const again = await t.post("/api/invites/accept", { token: body.token }, outsider);
    expect(again.status).toBe(200);
    expect(again.body.joined).toBe(false);
    // But nobody else can use it.
    const peek2 = await t.api(`/api/invites/preview/${body.token}`);
    expect(peek2.body.state).toBe("used_up");
    await t.post("/api/teams/leave", { team_id: team }, outsider);
  });

  it("revoked and unknown links are refused", async () => {
    const { body } = await t.post("/api/invites", {}, admin);
    expect((await t.api(`/api/invites/${body.invite.id}`, { method: "DELETE", session: admin })).status).toBe(200);
    const r = await t.post("/api/invites/accept", { token: body.token }, outsider);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/turned off/);
    expect((await t.api("/api/invites/preview/cpi_doesnotexistdoesnotexist")).status).toBe(404);
    // Another workspace's admin can't revoke this one's links.
    const { body: b2 } = await t.post("/api/invites", {}, admin);
    expect((await t.api(`/api/invites/${b2.invite.id}`, { method: "DELETE", session: outsider })).status).toBe(404);
  });

  it("signup through a link joins without an access code", async () => {
    const { body } = await t.post("/api/invites", {}, admin);
    await t.db.execute({ sql: "INSERT INTO verified_emails (email, verified_at) VALUES (?, ?)", args: ["newbie@test.local", new Date().toISOString()] });
    const r = await t.post("/api/auth/signup", { accountType: "student", name: "Newbie", email: "newbie@test.local", password: "pass-word-1", inviteToken: body.token });
    expect(r.status).toBe(200);
    expect(r.body.team.id).toBe(team);
    expect(r.body.team.access_code).toBeUndefined();
  });

  it("approval links file a request; approving adds the member", async () => {
    const { body } = await t.post("/api/invites", { requires_approval: true }, admin);
    const acc = await t.post("/api/invites/accept", { token: body.token }, outsider);
    expect(acc.status).toBe(200);
    expect(acc.body.pendingApproval).toBe(true);
    let inTeam = (await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM members WHERE email = ? AND team_id = ? AND is_active = 1", args: [outsiderEmail, team] })).rows[0] as any;
    expect(Number(inTeam.n)).toBe(0);
    const reqs = await t.api("/api/join-requests", { session: inviter });
    expect(reqs.status).toBe(200);
    const mine = reqs.body.find((x: any) => x.email === outsiderEmail);
    expect(mine).toBeTruthy();
    expect((await t.post(`/api/join-requests/${mine.id}/approve`, {}, member)).status).toBe(403);
    expect((await t.post(`/api/join-requests/${mine.id}/approve`, {}, inviter)).status).toBe(200);
    // A second decision on the same request is refused.
    expect((await t.post(`/api/join-requests/${mine.id}/deny`, {}, admin)).status).toBe(404);
    inTeam = (await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM members WHERE email = ? AND team_id = ? AND is_active = 1", args: [outsiderEmail, team] })).rows[0] as any;
    expect(Number(inTeam.n)).toBe(1);
  });

  it("a brand-new signup on an approval link creates a password-less account only when approved", async () => {
    const { body } = await t.post("/api/invites", { requires_approval: true }, admin);
    const email = "pending@test.local";
    const r = await t.post("/api/auth/signup", { accountType: "student", name: "Pending", email, password: "pass-word-2", inviteToken: body.token });
    expect(r.status).toBe(200);
    expect(r.body.pendingApproval).toBe(true);
    expect(r.body.sessionId).toBeUndefined();
    let rows = (await t.db.execute({ sql: "SELECT COUNT(*) AS n FROM members WHERE email = ?", args: [email] })).rows[0] as any;
    expect(Number(rows.n)).toBe(0);
    const reqs = await t.api("/api/join-requests", { session: admin });
    const mine = reqs.body.find((x: any) => x.email === email);
    expect(JSON.stringify(reqs.body)).not.toContain("password");
    expect((await t.post(`/api/join-requests/${mine.id}/approve`, {}, admin)).status).toBe(200);
    // No credentials ride on a request (nobody proved they own the email):
    // the owner sets a password through an emailed code when they sign in.
    const row = (await t.db.execute({ sql: "SELECT password, team_id FROM members WHERE email = ?", args: [email] })).rows[0] as any;
    expect(Number(row.team_id)).toBe(team);
    expect(row.password).toBeNull();
    const left = (await t.db.execute({ sql: "SELECT password_hash FROM team_join_requests WHERE id = ?", args: [mine.id] })).rows[0] as any;
    expect(left.password_hash).toBeNull();
    const login = await t.post("/api/auth/login", { email, password: "pass-word-2" });
    expect(login.body.sessionId).toBeUndefined();
    expect(login.body.needsPasswordSetup).toBe(true);
  });

  it("an existing member signing up again doesn't spend a single-use link", async () => {
    const { body } = await t.post("/api/invites", { max_uses: 1 }, admin);
    const r = await t.post("/api/auth/signup", { accountType: "student", name: "Newbie", email: "newbie@test.local", password: "pass-word-1", inviteToken: body.token });
    expect(r.status).toBe(400);
    const row = (await t.db.execute({ sql: "SELECT uses FROM team_invites WHERE id = ?", args: [body.invite.id] })).rows[0] as any;
    expect(Number(row.uses)).toBe(0);
  });

  it("a link that expired after it was checked can't be used", async () => {
    const { body } = await t.post("/api/invites", {}, admin);
    await t.db.execute({ sql: "UPDATE team_invites SET expires_at = ? WHERE id = ?", args: [new Date(Date.now() - 1000).toISOString(), body.invite.id] });
    const r = await t.post("/api/invites/accept", { token: body.token }, member);
    // Already a member → switched without spending; a newcomer is refused:
    expect(r.status).toBe(200);
    await t.db.execute({ sql: "INSERT INTO verified_emails (email, verified_at) VALUES (?, ?)", args: ["late@test.local", new Date().toISOString()] });
    const s = await t.post("/api/auth/signup", { accountType: "student", name: "Late", email: "late@test.local", password: "pass-word-3", inviteToken: body.token });
    expect(s.status).toBe(400);
    expect(s.body.error).toMatch(/expired/);
  });

  it("working links stay listed ahead of newer revoked ones", async () => {
    const keep = await t.post("/api/invites", { expires_in_hours: null }, admin);
    for (let i = 0; i < 3; i++) {
      const { body } = await t.post("/api/invites", {}, admin);
      await t.api(`/api/invites/${body.invite.id}`, { method: "DELETE", session: admin });
    }
    const list = await t.api("/api/invites", { session: admin });
    const firstDead = list.body.findIndex((l: any) => l.state !== "active");
    const keepAt = list.body.findIndex((l: any) => l.id === keep.body.invite.id);
    expect(keepAt).toBeGreaterThanOrEqual(0);
    expect(keepAt).toBeLessThan(firstDead);
  });
});

describe("teamless accounts", () => {
  it("voice endpoints answer instead of hanging", async () => {
    // A member whose only membership was removed keeps a valid, teamless session.
    const team2 = await seedTeam(t.db, "Gone");
    const id = await seedMember(t.db, team2, "Ghost", "ghost@test.local");
    const ghost = await t.session(id);
    await t.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [id] });
    const ctrl = AbortSignal.timeout(5000);
    const r = await t.api("/api/voice/channels", { session: ghost, signal: ctrl });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});

