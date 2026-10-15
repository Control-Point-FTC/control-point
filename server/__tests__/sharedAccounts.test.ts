/**
 * Shared accounts with Control Scout (server/sharedAccounts.ts; contract in
 * control-scout docs/shared-accounts.md): the /internal API Scout calls with
 * X-Internal-Key, and the "Continue with Control Point" hand-off.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";
import { createSharedAccounts, parsePermissions, workspaceAdmin } from "../sharedAccounts";

vi.setConfig({ testTimeout: 30_000 });

const KEY = "test-internal-key-0123456789-abcdefghijklmnop";
const SCOUT = "https://scout.example.test";

// Without NODE_ENV=production the server mounts Vite's dev middleware, whose
// dependency scan can stall every request for ~30 s shortly after boot (seen
// on Windows). These routes are mounted before Vite, so serve the built app.
const QUIET = { NODE_ENV: "production" };
let on: TestServer;
let off: TestServer;
beforeAll(async () => {
  [on, off] = await Promise.all([
    // A path on CONTROL_SCOUT_URL is ignored: only its origin is used.
    startTestServer("cp-shared-on-", { ...QUIET, CONTROL_SCOUT_INTERNAL_KEY: KEY, CONTROL_SCOUT_URL: `${SCOUT}/ignored/path` }),
    startTestServer("cp-shared-off-", { ...QUIET, CONTROL_SCOUT_INTERNAL_KEY: "", CONTROL_SCOUT_URL: "" }),
  ]);
}, 180_000);
afterAll(async () => { await Promise.all([on?.stop(), off?.stop()]); });

const internal = (t: TestServer, path: string, body?: any, key: string | null = KEY) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) headers["x-internal-key"] = key;
  const go = () => fetch(`${t.base}${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  // One retry on a dropped keep-alive socket, like the harness's api().
  return go().catch(() => new Promise((r) => setTimeout(r, 300)).then(go))
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
};
const resolve = (body: any, t = on) => internal(t, "/internal/accounts/resolve", body);
const redeem = (code: string, state: string) => internal(on, "/internal/handoff/redeem", { code, state });

/** GET the hand-off start without following the redirect. */
async function start(t: TestServer, state: string, session?: string, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  if (session) withSession(headers, session);
  const r = await fetch(`${t.base}/api/auth/scout/start?state=${encodeURIComponent(state)}`, { headers, redirect: "manual" });
  return { status: r.status, location: r.headers.get("location") || "" };
}
const count = async (t: TestServer, sql: string) => Number((await t.db.execute(sql)).rows[0].n);
const STATE = "stateABCDEFGH_1234-xyz";

describe("feature off (env unset)", () => {
  it("every /internal route is 404, with or without a key", async () => {
    expect((await resolve({ email: "a@b.test", verifiedBy: "google" }, off)).status).toBe(404);
    expect((await internal(off, "/internal/accounts/1")).status).toBe(404);
    expect((await internal(off, "/internal/handoff/redeem", { code: "x", state: "y" }, null)).status).toBe(404);
  });
  it("the hand-off start sends the browser home (no JSON error after sign-in)", async () => {
    const r = await start(off, STATE);
    expect(r.status).toBe(302);
    expect(r.location).toBe("/");
  });
});

describe("internal key", () => {
  it("missing or wrong key → 401 (any length)", async () => {
    for (const key of [null, "", "nope", KEY + "x", KEY.slice(0, -1) + "Z"]) {
      expect((await internal(on, "/internal/accounts/1", undefined, key)).status, String(key)).toBe(401);
    }
  });
  it("the right key passes", async () => {
    expect((await internal(on, "/internal/accounts/999999")).status).toBe(404);
  });
});

describe("POST /internal/accounts/resolve", () => {
  it("upserts by normalised email, idempotently, keeping the first proof", async () => {
    const members = await count(on, "SELECT COUNT(*) AS n FROM members");
    const verified = await count(on, "SELECT COUNT(*) AS n FROM verified_emails");
    const a = await resolve({ email: "  New.Person@Example.COM ", verifiedBy: "scout-email-code", displayName: "  New Person " });
    expect(a.status).toBe(200);
    expect(a.body.account).toMatchObject({ email: "new.person@example.com", displayName: "New Person", controlPoint: { member: false, teams: [] } });
    expect(typeof a.body.account.id).toBe("number");
    expect(a.body.account.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    const b = await resolve({ email: "new.person@example.com", verifiedBy: "google", displayName: "Other" });
    expect(b.body.account.id).toBe(a.body.account.id);
    expect(b.body.account.displayName).toBe("New Person");
    const row = (await on.db.execute({ sql: "SELECT verified_by, last_seen_at FROM accounts WHERE id = ?", args: [a.body.account.id] })).rows[0] as any;
    expect(row.verified_by).toBe("scout-email-code");
    expect(row.last_seen_at).toBeTruthy();
    expect(await count(on, "SELECT COUNT(*) AS n FROM accounts WHERE email = 'new.person@example.com'")).toBe(1);
    // Never touches Control Point's own account tables.
    expect(await count(on, "SELECT COUNT(*) AS n FROM members")).toBe(members);
    expect(await count(on, "SELECT COUNT(*) AS n FROM verified_emails")).toBe(verified);
  });

  it("rejects bad input", async () => {
    expect((await resolve({ email: "not-an-email", verifiedBy: "google" })).body.error).toBe("invalid_email");
    expect((await resolve({ verifiedBy: "google" })).status).toBe(400);
    expect((await resolve({ email: "x@y.test", verifiedBy: "control-point" })).body.error).toBe("invalid_verified_by");
    expect((await resolve({ email: "x@y.test" })).status).toBe(400);
    expect((await resolve({ email: "x@y.test", verifiedBy: "google", displayName: "n".repeat(101) })).body.error).toBe("invalid_display_name");
    expect((await resolve({ email: "x@y.test", verifiedBy: "google", displayName: 5 })).status).toBe(400);
    expect(await count(on, "SELECT COUNT(*) AS n FROM accounts WHERE email = 'x@y.test'")).toBe(0);
  });

  it("reports Control Point membership read-only from active members rows", async () => {
    const t1 = await seedTeam(on.db, "Gear Grinders");
    await on.db.execute({ sql: "UPDATE teams SET ftc_team_number = 12345 WHERE id = ?", args: [t1] });
    const t2 = await seedTeam(on.db, "No Number Yet");
    const t3 = await seedTeam(on.db, "Left This One");
    await seedMember(on.db, t1, "Mem", "Member.One@Team.test");
    await seedMember(on.db, t2, "Mem", "member.one@team.test");
    const gone = await seedMember(on.db, t3, "Mem", "member.one@team.test");
    await on.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [gone] });
    const before = await on.db.execute("SELECT id, email, password, is_active FROM members ORDER BY id");
    const r = await resolve({ email: "member.one@team.test", verifiedBy: "google" });
    expect(r.status).toBe(200);
    expect(r.body.account.controlPoint).toEqual({
      member: true,
      teams: [{ teamNumber: 12345, name: "Gear Grinders" }, { teamNumber: null, name: "No Number Yet" }],
      shortlist: [],
    });
    expect(r.body.account.workspaces).toEqual([
      { id: String(t1), name: "Gear Grinders", role: "member" },
      { id: String(t2), name: "No Number Yet", role: "member" },
    ]);
    expect((await on.db.execute("SELECT id, email, password, is_active FROM members ORDER BY id")).rows).toEqual(before.rows);
  });
});

describe("workspaces on the account payload", () => {
  /** A role on `teamId` with these permissions, held by `memberId`. */
  async function grantRole(teamId: number, memberId: number, permissions: string) {
    const role = Number((await on.db.execute({ sql: "INSERT INTO roles (team_id, name, permissions) VALUES (?, 'Test role', ?)", args: [teamId, permissions] })).lastInsertRowid);
    await on.db.execute({ sql: "INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)", args: [memberId, role] });
  }

  it("0 workspaces: an account with no members rows gets an empty list", async () => {
    const r = await resolve({ email: "no.workspace@example.test", verifiedBy: "google" });
    expect(r.status).toBe(200);
    expect(r.body.account.workspaces).toEqual([]);
    expect(r.body.account.controlPoint).toEqual({ member: false, teams: [], shortlist: [] });
  });

  it("1 workspace: one active membership, a plain member", async () => {
    const t = await seedTeam(on.db, "Solo Squad");
    await seedMember(on.db, t, "Solo", "solo@ws.test");
    const r = await resolve({ email: "solo@ws.test", verifiedBy: "google" });
    expect(r.body.account.workspaces).toEqual([{ id: String(t), name: "Solo Squad", role: "member" }]);
  });

  it("2 workspaces: admin in one, member in the other; inactive rows excluded", async () => {
    const a = await seedTeam(on.db, "Admin Here");
    const b = await seedTeam(on.db, "Member Here");
    const c = await seedTeam(on.db, "Removed From");
    await seedMember(on.db, a, "Two", "Two@WS.test", "admin");
    await seedMember(on.db, b, "Two", "two@ws.test");
    // Removed (is_active = 0), even as an admin: not a workspace any more.
    const gone = await seedMember(on.db, c, "Two", "two@ws.test", "admin");
    await on.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [gone] });
    const r = await resolve({ email: "two@ws.test", verifiedBy: "google" });
    expect(r.body.account.workspaces).toEqual([
      { id: String(a), name: "Admin Here", role: "admin" },
      { id: String(b), name: "Member Here", role: "member" },
    ]);
    expect(r.body.account.controlPoint.teams).toEqual([{ teamNumber: null, name: "Admin Here" }, { teamNumber: null, name: "Member Here" }]);
    // GET by id returns the same workspaces.
    expect((await internal(on, `/internal/accounts/${r.body.account.id}`)).body.account.workspaces).toEqual(r.body.account.workspaces);
  });

  it("a role granting * or manage_members makes an admin; other roles, other teams' roles and bad JSON do not", async () => {
    const star = await seedTeam(on.db, "Star Role");
    const manage = await seedTeam(on.db, "Manage Role");
    const other = await seedTeam(on.db, "Other Perms");
    const elsewhere = await seedTeam(on.db, "Role Elsewhere");
    const broken = await seedTeam(on.db, "Broken Perms");
    const email = "roles@ws.test";
    await grantRole(star, await seedMember(on.db, star, "R", email), JSON.stringify(["*"]));
    await grantRole(manage, await seedMember(on.db, manage, "R", email), JSON.stringify(["tasks", "manage_members"]));
    await grantRole(other, await seedMember(on.db, other, "R", email), JSON.stringify(["tasks", "budget"]));
    // An admin role on a different workspace does not count for this membership.
    await grantRole(star, await seedMember(on.db, elsewhere, "R", email), JSON.stringify(["*"]));
    await grantRole(broken, await seedMember(on.db, broken, "R", email), "not json");
    const r = await resolve({ email, verifiedBy: "google" });
    expect(r.status).toBe(200);
    expect(r.body.account.workspaces).toEqual([
      { id: String(star), name: "Star Role", role: "admin" },
      { id: String(manage), name: "Manage Role", role: "admin" },
      { id: String(other), name: "Other Perms", role: "member" },
      { id: String(elsewhere), name: "Role Elsewhere", role: "member" },
      { id: String(broken), name: "Broken Perms", role: "member" },
    ]);
  });

  it("ids are stable across a workspace rename", async () => {
    const t = await seedTeam(on.db, "Old Name");
    await seedMember(on.db, t, "Ren", "rename@ws.test");
    const before = await resolve({ email: "rename@ws.test", verifiedBy: "google" });
    await on.db.execute({ sql: "UPDATE teams SET name = 'New Name' WHERE id = ?", args: [t] });
    const after = await internal(on, `/internal/accounts/${before.body.account.id}`);
    expect(after.body.account.workspaces).toEqual([{ id: before.body.account.workspaces[0].id, name: "New Name", role: "member" }]);
  });
});

describe("workspace admin rule", () => {
  it("maps account_type and role permissions", () => {
    expect(workspaceAdmin("admin", [])).toBe(true);
    expect(workspaceAdmin("student", [])).toBe(false);
    expect(workspaceAdmin(null, ['["*"]'])).toBe(true);
    expect(workspaceAdmin("student", ['["tasks"]', '["manage_members"]'])).toBe(true);
    expect(workspaceAdmin("student", ['["tasks"]', "{bad", null])).toBe(false);
  });
  it("parses permissions defensively", () => {
    expect(parsePermissions('["a", 1, "b"]')).toEqual(["a", "b"]);
    expect(parsePermissions('{"a":1}')).toEqual([]);
    expect(parsePermissions("nope")).toEqual([]);
    expect(parsePermissions(null)).toEqual([]);
  });
});

describe("GET /internal/accounts/:id", () => {
  it("returns the account, or 404", async () => {
    const a = await resolve({ email: "byid@example.test", verifiedBy: "google" });
    const r = await internal(on, `/internal/accounts/${a.body.account.id}`);
    expect(r.status).toBe(200);
    expect(r.body.account).toEqual(a.body.account);
    expect((await internal(on, "/internal/accounts/987654")).status).toBe(404);
    expect((await internal(on, "/internal/accounts/abc")).status).toBe(404);
    expect((await internal(on, "/internal/accounts/-1")).status).toBe(404);
  });
});

describe("Continue with Control Point (hand-off)", () => {
  let session: string;
  let memberEmail: string;
  let team: number;
  beforeAll(async () => {
    team = await seedTeam(on.db, "Hand-off Team");
    memberEmail = "Hand.Off@Team.test";
    session = await on.session(await seedMember(on.db, team, "Handy", memberEmail));
  });

  /** Start signed in and return the code from Scout's callback URL. */
  async function issue(state = STATE): Promise<string> {
    const r = await start(on, state, session);
    expect(r.status).toBe(302);
    const u = new URL(r.location);
    expect(u.origin).toBe(SCOUT);
    expect(u.pathname).toBe("/api/auth/control-point/callback");
    expect(u.searchParams.get("state")).toBe(state);
    return u.searchParams.get("code")!;
  }

  it("start → redeem: creates the account (verified_by control-point) and returns it", async () => {
    const code = await issue();
    const row = (await on.db.execute({ sql: "SELECT id, verified_by FROM accounts WHERE email = ?", args: ["hand.off@team.test"] })).rows[0] as any;
    expect(row.verified_by).toBe("control-point");
    // Only the hash is stored.
    expect(await count(on, `SELECT COUNT(*) AS n FROM scout_handoff_codes WHERE code_hash = '${code}'`)).toBe(0);
    const r = await redeem(code, STATE);
    expect(r.status).toBe(200);
    expect(r.body.account).toMatchObject({ id: Number(row.id), email: "hand.off@team.test", controlPoint: { member: true, teams: [{ teamNumber: null, name: "Hand-off Team" }] } });
    expect(r.body.account.workspaces).toEqual([{ id: String(team), name: "Hand-off Team", role: "member" }]);
  });

  it("an existing account keeps its id and first proof", async () => {
    const pre = await resolve({ email: "pre.existing@team.test", verifiedBy: "google" });
    const team = await seedTeam(on.db, "Pre Team");
    const s = await on.session(await seedMember(on.db, team, "Pre", "PRE.existing@team.test"));
    const r = await start(on, STATE, s);
    const code = new URL(r.location).searchParams.get("code")!;
    const got = await redeem(code, STATE);
    expect(got.body.account.id).toBe(pre.body.account.id);
    expect((await on.db.execute({ sql: "SELECT verified_by FROM accounts WHERE id = ?", args: [pre.body.account.id] })).rows[0].verified_by).toBe("google");
  });

  it("a code works once", async () => {
    const code = await issue();
    expect((await redeem(code, STATE)).status).toBe(200);
    const again = await redeem(code, STATE);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("code_used");
  });

  it("an expired code is refused", async () => {
    const code = await issue();
    await on.db.execute({ sql: "UPDATE scout_handoff_codes SET expires_at = ? WHERE used_at IS NULL", args: [new Date(Date.now() - 1000).toISOString()] });
    const r = await redeem(code, STATE);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("code_expired");
  });

  it("the state must match, and a mismatch spends the code", async () => {
    const code = await issue();
    const r = await redeem(code, "a-different-state-0000");
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("state_mismatch");
    expect((await redeem(code, STATE)).status).toBe(400);
  });

  it("unknown or malformed codes are refused", async () => {
    expect((await redeem("cph_" + "A".repeat(43), STATE)).body.error).toBe("invalid_code");
    expect((await redeem("garbage", STATE)).status).toBe(400);
    expect((await internal(on, "/internal/handoff/redeem", {})).status).toBe(400);
  });

  it("only ever redirects to CONTROL_SCOUT_URL's origin", async () => {
    const r = await start(on, STATE, session, { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http", referer: "https://evil.example/" });
    expect(new URL(r.location).origin).toBe(SCOUT);
    const q = await fetch(`${on.base}/api/auth/scout/start?state=${STATE}&redirect=https://evil.example&return_to=https://evil.example`, { headers: withSession(new Headers(), session), redirect: "manual" });
    expect(new URL(q.headers.get("location")!).origin).toBe(SCOUT);
  });

  it("rejects a malformed state", async () => {
    for (const s of ["short", "a".repeat(129), "has space in it 123456", "slash/in/the/state/123"]) {
      expect((await start(on, s, session)).status, s).toBe(400);
    }
  });

  it("signed out → the app's sign-in, which returns here", async () => {
    const r = await start(on, STATE);
    expect(r.status).toBe(302);
    expect(r.location).toBe(`/?scout_state=${STATE}`);
    const bad = await start(on, STATE, "cps_test-not-a-real-session");
    expect(bad.location).toBe(`/?scout_state=${STATE}`);
  });

  it("a teamless account (left every team) still hands off by its email", async () => {
    const team = await seedTeam(on.db, "Soon Empty");
    const id = await seedMember(on.db, team, "Lone", "lone@team.test");
    const s = await on.session(id);
    await on.db.execute({ sql: "UPDATE members SET is_active = 0 WHERE id = ?", args: [id] });
    const r = await start(on, STATE, s);
    const got = await redeem(new URL(r.location).searchParams.get("code")!, STATE);
    expect(got.status).toBe(200);
    expect(got.body.account).toMatchObject({ email: "lone@team.test", controlPoint: { member: false, teams: [] } });
  });
});

describe("sign-in started from Scout with Google / Discord / GitHub", () => {
  it("signed out + via → straight into that provider's sign-in, carrying the state; anything else → the app", async () => {
    const r = await fetch(`${on.base}/api/auth/scout/start?state=${STATE}&via=github`, { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(`/api/auth/github?intent=login&scout_state=${STATE}`);
    const bad = await fetch(`${on.base}/api/auth/scout/start?state=${STATE}&via=https://evil.example`, { redirect: "manual" });
    expect(bad.headers.get("location")).toBe(`/?scout_state=${STATE}`);
  });

  it("the provider-verified email gets a hand-off code, with no Control Point membership needed", async () => {
    const shared = createSharedAccounts({
      dbRun: async (sql: string, ...args: any[]) => on.db.execute({ sql, args }),
      dbGet: async (sql: string, ...args: any[]) => (await on.db.execute({ sql, args })).rows[0],
      dbAll: async (sql: string, ...args: any[]) => (await on.db.execute({ sql, args })).rows as any[],
      sessionEmail: async () => null,
      env: { CONTROL_SCOUT_URL: SCOUT, CONTROL_SCOUT_INTERNAL_KEY: KEY },
    } as any);
    let to = "";
    await shared.completeOAuthHandoff({ redirect: (_s: number, url: string) => { to = url; } } as any, "discord", "Scout.Only@Example.test", STATE);
    const u = new URL(to);
    expect(u.origin + u.pathname).toBe(`${SCOUT}/api/auth/control-point/callback`);
    const got = await redeem(u.searchParams.get("code")!, STATE);
    expect(got.status).toBe(200);
    expect(got.body.account).toMatchObject({ email: "scout.only@example.test", controlPoint: { member: false, teams: [], shortlist: [] } });
    expect((await on.db.execute({ sql: "SELECT verified_by FROM accounts WHERE email = ?", args: ["scout.only@example.test"] })).rows[0].verified_by).toBe("discord");
    // A bad state or email never redirects to Scout.
    let home = "";
    await shared.completeOAuthHandoff({ redirect: (_s: number, url: string) => { home = url; } } as any, "google", "not-an-email", STATE);
    expect(home).toBe("/");
  });

  it("the account carries the workspace shortlist (latest season, live rows only)", async () => {
    const team = await seedTeam(on.db, "Shortlist Team");
    await seedMember(on.db, team, "Lister", "lister@team.test");
    const row = (s: number, n: number, deleted = 0) => on.db.execute({ sql: "INSERT INTO scouting_shortlist (team_id, season, team_number, deleted, updated_at) VALUES (?, ?, ?, ?, ?)", args: [team, s, n, deleted, new Date().toISOString()] });
    await row(2025, 111); await row(2026, 4215); await row(2026, 18360); await row(2026, 999, 1);
    const r = await resolve({ email: "lister@team.test", verifiedBy: "scout-email-code" });
    expect(r.body.account.controlPoint.shortlist).toEqual([4215, 18360]);
  });

  it("a cleared latest-season shortlist is empty, not last season's", async () => {
    const team = await seedTeam(on.db, "Cleared Team");
    await seedMember(on.db, team, "Clearer", "clearer@team.test");
    const row = (season: number, n: number, deleted = 0) => on.db.execute({ sql: "INSERT INTO scouting_shortlist (team_id, season, team_number, deleted, updated_at) VALUES (?, ?, ?, ?, ?)", args: [team, season, n, deleted, new Date().toISOString()] });
    await row(2025, 111); await row(2026, 222, 1);
    const r = await resolve({ email: "clearer@team.test", verifiedBy: "scout-email-code" });
    expect(r.body.account.controlPoint.shortlist).toEqual([]);
  });
});

describe("Scout sign-in through each provider's callback (fake providers on loopback)", () => {
  let cp: TestServer;
  let fake: import("node:http").Server;
  beforeAll(async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json()); app.use(express.urlencoded({ extended: false }));
    app.post("/api/oauth2/token", (_q, r) => { r.json({ access_token: "d" }); });
    app.get("/api/users/@me", (_q, r) => { r.json({ id: "77", email: "Disc.User@Example.test", verified: true, username: "disc" }); });
    app.post("/login/oauth/access_token", (_q, r) => { r.json({ access_token: "g" }); });
    app.get("/user", (_q, r) => { r.json({ id: 88, login: "gh" }); });
    app.get("/user/emails", (_q, r) => { r.json([{ email: "gh.user@example.test", primary: true, verified: true }]); });
    app.post("/token", (_q, r) => { r.json({ access_token: "o" }); });
    app.get("/oauth2/v3/userinfo", (_q, r) => { r.json({ sub: "99", email: "goo.user@example.test", email_verified: true, name: "Goo" }); });
    fake = app.listen(0);
    await new Promise((r) => fake.once("listening", r));
    const port = (fake.address() as import("node:net").AddressInfo).port;
    cp = await startTestServer("cp-shared-oauth-", {
      ...QUIET, CONTROL_SCOUT_INTERNAL_KEY: KEY, CONTROL_SCOUT_URL: SCOUT, OAUTH_PROVIDER_STUB: `http://127.0.0.1:${port}`,
      GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret", DISCORD_CLIENT_ID: "d-id", DISCORD_CLIENT_SECRET: "d-secret",
      GITHUB_CLIENT_ID: "h-id", GITHUB_CLIENT_SECRET: "h-secret",
    });
  }, 180_000);
  afterAll(async () => { await cp?.stop(); fake?.close(); });

  for (const [via, email] of [["google", "goo.user@example.test"], ["discord", "disc.user@example.test"], ["github", "gh.user@example.test"]] as const) {
    it(`${via}: back to Scout with the original state, no Control Point session or membership`, async () => {
      const go = (path: string, cookie = "") => fetch(`${cp.base}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
      const s1 = await go(`/api/auth/scout/start?state=${STATE}&via=${via}`);
      expect(s1.headers.get("location")).toBe(`/api/auth/${via}?intent=login&scout_state=${STATE}`);
      const s2 = await go(s1.headers.get("location")!);
      const cookie = s2.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
      const oauthState = new URL(s2.headers.get("location")!).searchParams.get("state")!;
      const cb = await go(`/api/auth/${via}/callback?code=c&state=${oauthState}`, cookie);
      const to = new URL(cb.headers.get("location")!);
      expect(to.origin + to.pathname).toBe(`${SCOUT}/api/auth/control-point/callback`);
      expect(to.searchParams.get("state")).toBe(STATE);
      // No Control Point session cookie, and no membership row was made.
      expect(cb.headers.getSetCookie().some((c) => /^cp_session=[^;]/.test(c))).toBe(false);
      expect(Number((await cp.db.execute({ sql: "SELECT COUNT(*) AS n FROM members WHERE email = ?", args: [email] })).rows[0].n)).toBe(0);
      const acct = (await cp.db.execute({ sql: "SELECT verified_by FROM accounts WHERE email = ?", args: [email] })).rows[0] as any;
      expect(acct.verified_by).toBe(via);
    });
  }
});

// Last: it locks this IP out of wrong keys for the rest of the file.
describe("wrong-key lockout", () => {
  it("after 20 wrong keys, wrong keys get 429 but the right key still works", async () => {
    // Earlier tests already spent some of this IP's 20 wrong tries; keep going until the lockout.
    let status = 0;
    for (let i = 0; i < 21 && status !== 429; i++) status = (await internal(on, "/internal/accounts/1", undefined, "wrong-key")).status;
    expect(status).toBe(429);
    expect((await internal(on, "/internal/accounts/1", undefined, "wrong-key")).status).toBe(429);
    expect((await internal(on, "/internal/accounts/999999")).status).toBe(404);
  });
});
