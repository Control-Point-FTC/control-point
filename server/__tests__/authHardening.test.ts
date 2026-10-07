/**
 * Regression tests for the 2026-10 emergency auth/authorization hotfix.
 *
 * Boots the real server against a throwaway SQLite file and attacks each
 * account-takeover and cross-workspace path that used to work:
 *  - login with a wrong password on a password-less (OAuth / roster) account
 *  - /api/auth/setup claiming a password-less account without the email
 *  - a different-case copy of an existing email signing up
 *  - an admin of one workspace clearing a password used in another
 *  - predictable session ids
 *  - chat sender spoofing over the WebSocket
 *  - removed members keeping sessions, sockets and roles
 *  - reading another member's notifications as an admin
 *  - pointing avatar_url at someone else's stored file
 *  - SSRF via link preview and REV import
 *  - Bruno apply-actions creating events without calendar permission
 *  - hidden attendance dates leaking across workspaces
 *  - unthrottled login guessing
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Each case talks to a freshly booted server; the first requests can be slow.
vi.setConfig({ testTimeout: 30_000 });
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createClient, type Client } from "@libsql/client";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
import { sessionDbId, withSession } from "./helpers/session";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const p = (s.address() as any).port;
      s.close(() => resolve(p));
    });
  });
}

async function waitForServer(base: string, tries = 160): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${base}/api/auth/config`);
      if (r.ok || r.status === 404) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not boot in time");
}

let proc: ChildProcess | null = null;
let base = "";
let port = 0;
let tmpDir = "";
let db: Client;
const PW = "correct-horse-1";
const ids: Record<string, number> = {};
const SESS = {
  adminA: "cps_test-admin-a",
  memberA: "cps_test-member-a",
  adminB: "cps_test-admin-b",
  removable: "cps_test-removable",
};

async function api(path: string, opts: RequestInit & { session?: string } = {}) {
  const headers = new Headers(opts.headers);
  withSession(headers, opts.session);
  if (opts.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  // One retry on a dropped keep-alive socket (the dev server closes idle
  // connections while a slow first request is still being compiled).
  const res = await fetch(`${base}${path}`, { ...opts, headers })
    .catch(() => new Promise((r) => setTimeout(r, 300)).then(() => fetch(`${base}${path}`, { ...opts, headers })));
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body, setCookie: res.headers.get("set-cookie") || "" };
}
const post = (path: string, body: any, session?: string) => api(path, { method: "POST", body: JSON.stringify(body), session });

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "cp-authtest-"));
  const dbPath = join(tmpDir, "test.db");
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn("npx", ["tsx", "server.ts"], {
    cwd: REPO,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}`, PORT: String(port), RESEND_API_KEY: "", PREDICT_SYNC: "off" },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  await waitForServer(base);

  db = createClient({ url: `file:${dbPath}` });
  const now = new Date().toISOString();
  const far = new Date(Date.now() + 86400000).toISOString();
  const hash = bcrypt.hashSync(PW, 4);
  const mkTeam = async (name: string, code: string) =>
    Number((await db.execute({ sql: "INSERT INTO teams (name, number, access_code) VALUES (?, '1', ?)", args: [name, code] })).lastInsertRowid);
  const mkMember = async (teamId: number, name: string, email: string, accountType: string, password: string | null) =>
    Number((await db.execute({
      sql: "INSERT INTO members (team_id, name, role, email, account_type, password, is_setup) VALUES (?, ?, 'Member', ?, ?, ?, 1)",
      args: [teamId, name, email, accountType, password],
    })).lastInsertRowid);
  ids.teamA = await mkTeam("Team A", "CP-AAAA-AAAA");
  ids.teamB = await mkTeam("Team B", "CP-BBBB-BBBB");
  ids.adminA = await mkMember(ids.teamA, "Admin A", "admin-a@test.local", "admin", hash);
  ids.memberA = await mkMember(ids.teamA, "Member A", "member-a@test.local", "student", hash);
  ids.oauthOnly = await mkMember(ids.teamA, "OAuth User", "oauth@test.local", "student", null);
  ids.removable = await mkMember(ids.teamA, "Removable", "removable@test.local", "admin", hash);
  ids.adminB = await mkMember(ids.teamB, "Admin B", "admin-b@test.local", "admin", hash);
  // The victim is in team A (with a password) and also on team B's roster.
  ids.victimA = await mkMember(ids.teamA, "Victim", "victim@test.local", "student", hash);
  ids.victimB = await mkMember(ids.teamB, "Victim", "victim@test.local", "student", hash);
  for (const e of ["admin-a@test.local", "member-a@test.local", "oauth@test.local", "victim@test.local", "removable@test.local"]) {
    await db.execute({ sql: "INSERT OR IGNORE INTO verified_emails (email) VALUES (?)", args: [e] });
  }
  for (const [sess, mid] of [[SESS.adminA, ids.adminA], [SESS.memberA, ids.memberA], [SESS.adminB, ids.adminB], [SESS.removable, ids.removable]] as const) {
    await db.execute({
      sql: "INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)",
      args: [sessionDbId(sess), mid, now, far, now],
    });
  }
}, 90_000);

afterAll(async () => {
  try { db?.close(); } catch { /* ignore */ }
  if (proc?.pid) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else proc.kill("SIGTERM");
  }
  await new Promise((r) => setTimeout(r, 500));
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows may hold the file briefly */ }
});

describe("login and first-password setup", () => {
  it("never hands out a session for a password-less account, whatever password is typed", async () => {
    const r = await post("/api/auth/login", { email: "oauth@test.local", password: "anything-at-all" });
    expect(r.status).toBe(200);
    expect(r.body.needsPasswordSetup).toBe(true);
    expect(r.body.sessionId).toBeUndefined();
    expect(r.body.user).toBeUndefined();
  });

  it("returns one generic error for unknown emails and wrong passwords", async () => {
    const unknown = await post("/api/auth/login", { email: "nobody@test.local", password: "x1234567" });
    const wrong = await post("/api/auth/login", { email: "member-a@test.local", password: "x1234567" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it("logs in case-insensitively; the unguessable token goes only into an HttpOnly cookie", async () => {
    const r = await post("/api/auth/login", { email: "  Member-A@TEST.local ", password: PW });
    expect(r.status).toBe(200);
    expect(r.body.sessionId).toBeUndefined();
    expect(r.setCookie).toMatch(/cp_session=cps_[A-Za-z0-9_-]{43};/);
    expect(r.setCookie).toContain("HttpOnly");
    expect(r.setCookie).toContain("SameSite=Lax");
    // Stored hashed: the raw token is not a sessions.id.
    const token = decodeURIComponent(/cp_session=([^;]+)/.exec(r.setCookie)![1]);
    const raw = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM sessions WHERE id = ?", args: [token] })).rows[0] as any;
    expect(Number(raw.n)).toBe(0);
    expect((await api("/api/auth/me", { session: token })).status).toBe(200);
  });

  it("state-changing requests without the client header are refused (CSRF)", async () => {
    const res = await fetch(`${base}/api/profile`, {
      method: "PATCH",
      headers: { cookie: `cp_session=${SESS.memberA}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "CSRF" }),
    });
    expect(res.status).toBe(403);
  });

  it("a session token in the query string authenticates nothing", async () => {
    const res = await fetch(`${base}/api/auth/me?sessionId=${SESS.memberA}`);
    expect(res.status).toBe(401);
  });

  it("refuses /api/auth/setup outright (it used to claim password-less accounts)", async () => {
    const r = await post("/api/auth/setup", { email: "oauth@test.local", password: "attacker-pass" });
    expect(r.status).toBe(410);
    const row = (await db.execute({ sql: "SELECT password FROM members WHERE id = ?", args: [ids.oauthOnly] })).rows[0] as any;
    expect(row.password).toBeNull();
  });
});

describe("signup cannot claim an existing email", () => {
  it("rejects a different-case copy of an email that has a password", async () => {
    const r = await post("/api/auth/signup", { accountType: "admin", name: "Evil", email: "ADMIN-A@test.local", password: "attacker-pass", teamName: "Evil Team" });
    expect(r.status).toBe(400);
    expect(r.body.sessionId).toBeUndefined();
  });

  it("rejects claiming a password-less (OAuth/roster) email by picking a password", async () => {
    const r = await post("/api/auth/signup", { accountType: "admin", name: "Evil", email: "OAuth@Test.Local", password: "attacker-pass", teamName: "Evil Team" });
    expect(r.status).toBe(400);
    const row = (await db.execute({ sql: "SELECT password FROM members WHERE id = ?", args: [ids.oauthOnly] })).rows[0] as any;
    expect(row.password).toBeNull();
  });
});

describe("admin password reset", () => {
  it("can't touch a member of another workspace", async () => {
    const r = await post("/api/auth/reset", { email: "member-a@test.local" }, SESS.adminB);
    expect(r.status).toBe(404);
  });

  it("never clears an account-wide password (it only emails a code)", async () => {
    await post("/api/auth/reset", { email: "victim@test.local" }, SESS.adminB);
    const rows = (await db.execute({ sql: "SELECT password FROM members WHERE email = 'victim@test.local'", args: [] })).rows as any[];
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.password).toBeTruthy();
    // The victim's password still works and nothing else does.
    expect((await post("/api/auth/login", { email: "victim@test.local", password: PW })).setCookie).toContain("cp_session=cps_");
    expect((await post("/api/auth/login", { email: "victim@test.local", password: "attacker-pass" })).status).toBe(401);
  });
});

describe("admin email edits", () => {
  it("moving a row to another email drops its password and sessions", async () => {
    // Admin B points their roster member (who has a known password) at the
    // victim's email. That password must not then unlock the victim.
    const r = await api(`/api/members/${ids.victimB}`, { method: "PATCH", body: JSON.stringify({ name: "Victim", role: "Member", account_type: "student", email: "member-a@test.local" }), session: SESS.adminB });
    expect(r.status).toBe(200);
    const row = (await db.execute({ sql: "SELECT email, password FROM members WHERE id = ?", args: [ids.victimB] })).rows[0] as any;
    expect(row.email).toBe("member-a@test.local");
    expect(row.password).toBeNull();
    // member-a's own password still works; the moved row's old one doesn't add a way in.
    expect((await post("/api/auth/login", { email: "member-a@test.local", password: PW })).status).toBe(200);
  });

  it("editing a member whose email is a kept case-only duplicate doesn't rewrite it into a clash", async () => {
    const a = Number((await db.execute({ sql: "INSERT INTO members (team_id, name, role, email, account_type) VALUES (?, 'Dup Upper', 'Member', 'Dup@Test.local', 'student')", args: [ids.teamA] })).lastInsertRowid);
    await db.execute({ sql: "INSERT INTO members (team_id, name, role, email, account_type) VALUES (?, 'Dup Lower', 'Member', 'dup@test.local', 'student')", args: [ids.teamA] });
    const r = await api(`/api/members/${a}`, { method: "PATCH", body: JSON.stringify({ name: "Dup Renamed", role: "Member", account_type: "student", email: "Dup@Test.local" }), session: SESS.adminA });
    expect(r.status).toBe(200);
    const row = (await db.execute({ sql: "SELECT name, email FROM members WHERE id = ?", args: [a] })).rows[0] as any;
    expect(row.name).toBe("Dup Renamed");
    expect(row.email).toBe("Dup@Test.local");
  });

  it("stores emails lowercase when an admin adds a member", async () => {
    const r = await post("/api/members", { name: "New Kid", role: "Member", email: "  New.Kid@TEST.local " }, SESS.adminA);
    expect(r.status).toBe(200);
    const row = (await db.execute({ sql: "SELECT email FROM members WHERE id = ?", args: [r.body.id] })).rows[0] as any;
    expect(row.email).toBe("new.kid@test.local");
  });
});

describe("notifications", () => {
  it("an admin can't read another member's notifications", async () => {
    await db.execute({ sql: "INSERT INTO notifications (user_id, content, type, timestamp) VALUES (?, 'secret', 'mention', ?)", args: [ids.memberA, new Date().toISOString()] });
    const r = await api(`/api/notifications/${ids.memberA}`, { session: SESS.adminB });
    expect(r.status).toBe(403);
    const own = await api(`/api/notifications/${ids.memberA}`, { session: SESS.memberA });
    expect(own.status).toBe(200);
    expect(own.body.length).toBeGreaterThan(0);
  });
});

describe("WebSocket chat", () => {
  it("stores the authenticated sender, not the claimed one", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    ws.send(JSON.stringify({ type: "hello", sessionId: SESS.memberA }));
    await new Promise((r) => setTimeout(r, 400));
    ws.send(JSON.stringify({ type: "chat", sender_id: ids.adminA, sender_name: "Admin A", content: "spoof-attempt-123" }));
    await new Promise((r) => setTimeout(r, 800));
    ws.close();
    const row = (await db.execute({ sql: "SELECT sender_id FROM messages WHERE content = 'spoof-attempt-123'", args: [] })).rows[0] as any;
    expect(row).toBeTruthy();
    expect(Number(row.sender_id)).toBe(ids.memberA);
  });
});

describe("removing a member", () => {
  it("revokes sessions and strips roles so rejoining doesn't restore admin", async () => {
    const r = await api(`/api/members/${ids.removable}`, { method: "DELETE", session: SESS.adminA });
    expect(r.status).toBe(200);
    expect((await api("/api/auth/me", { session: SESS.removable })).status).toBe(401);
    const roles = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM member_roles WHERE member_id = ?", args: [ids.removable] })).rows[0] as any;
    expect(Number(roles.n)).toBe(0);
    const row = (await db.execute({ sql: "SELECT account_type, is_active FROM members WHERE id = ?", args: [ids.removable] })).rows[0] as any;
    expect(row.account_type).toBe("student");
    expect(Number(row.is_active)).toBe(0);
  });
});

describe("avatars", () => {
  it("rejects pointing avatar_url at someone else's stored file", async () => {
    const f = await db.execute({ sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (?, ?, 'chat', 'x.png', 'image/png', 1, X'00')", args: [ids.teamA, ids.adminA] });
    const fileId = Number(f.lastInsertRowid);
    const r = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ name: "Member A", avatar_url: `/api/files/${fileId}` }), session: SESS.memberA });
    expect(r.status).toBe(400);
    const still = (await db.execute({ sql: "SELECT id FROM stored_files WHERE id = ?", args: [fileId] })).rows;
    expect(still.length).toBe(1);
  });
});

describe("SSRF guards", () => {
  it("link preview refuses the cloud metadata address and private hosts", async () => {
    for (const u of ["http://169.254.169.254/latest/meta-data", "http://[::ffff:127.0.0.1]/", "http://localhost:3000/"]) {
      const r = await api(`/api/link-preview?url=${encodeURIComponent(u)}`, { session: SESS.memberA });
      expect(r.status).toBe(400);
    }
  });

  it("REV import requires an exact revrobotics.com https host", async () => {
    const r = await post("/api/inventory/scrape-rev", { url: "http://169.254.169.254/?revrobotics.com" }, SESS.adminA);
    expect(r.status).toBe(400);
    const r2 = await post("/api/inventory/scrape-rev", { url: "https://revrobotics.com.evil.example/" }, SESS.adminA);
    expect(r2.status).toBe(400);
  });
});

describe("Bruno apply-actions", () => {
  it("needs calendar permission to add events, and applies nothing when refused", async () => {
    // A member with no roles (the default Member role does grant calendar).
    await db.execute({ sql: "DELETE FROM member_roles WHERE member_id = ?", args: [ids.memberA] });
    const r = await post("/api/ai/apply-actions", {
      actions: [
        { kind: "outreach", items: [{ title: "Should not land", date: "2026-11-01" }] },
        { kind: "event", items: [{ title: "Sneaky event", date: "2026-11-01", time: "10:00" }] },
      ],
    }, SESS.memberA);
    expect(r.status).toBe(403);
    const ev = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM events WHERE title = 'Sneaky event'", args: [] })).rows[0] as any;
    expect(Number(ev.n)).toBe(0);
    const out = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM outreach WHERE title = 'Should not land'", args: [] })).rows[0] as any;
    expect(Number(out.n)).toBe(0);
  });
});

describe("hidden attendance dates", () => {
  it("are per workspace", async () => {
    expect((await post("/api/hidden-dates", { date: "2026-12-25" }, SESS.adminA)).status).toBe(200);
    const b = await api("/api/hidden-dates", { session: SESS.adminB });
    expect(b.body).not.toContain("2026-12-25");
    const a = await api("/api/hidden-dates", { session: SESS.adminA });
    expect(a.body).toContain("2026-12-25");
  });
});

describe("moving existing sign-ins to the cookie", () => {
  it("a pre-cookie token sent once in X-Session-ID is rotated into a fresh cookie session and retired", async () => {
    const now = new Date().toISOString();
    const far = new Date(Date.now() + 86400000).toISOString();
    const legacy = "session_1700000000000_oldformat";
    await db.execute({ sql: "INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)", args: [legacy, ids.victimA, now, far, now] });
    const first = await fetch(`${base}/api/auth/me`, { headers: { "x-session-id": legacy } });
    expect(first.status).toBe(200);
    const set = first.headers.get("set-cookie") || "";
    expect(set).toMatch(/cp_session=cps_/);
    expect(set).toContain("HttpOnly");
    const token = decodeURIComponent(/cp_session=([^;]+)/.exec(set)![1]);
    // The old token now expires within a short grace period…
    const old = (await db.execute({ sql: "SELECT expires_at FROM sessions WHERE id = ?", args: [legacy] })).rows[0] as any;
    expect(Date.parse(old.expires_at) - Date.now()).toBeLessThanOrEqual(2 * 60 * 1000);
    // …during which a request already in flight from the old tab gets the
    // same replacement (no second session, no sign-out).
    const second = await fetch(`${base}/api/auth/me`, { headers: { "x-session-id": legacy } });
    expect(second.status).toBe(200);
    expect(decodeURIComponent(/cp_session=([^;]+)/.exec(second.headers.get("set-cookie") || "")![1])).toBe(token);
    // The new cookie works on its own.
    expect((await api("/api/auth/me", { session: token })).status).toBe(200);
  });

  it("activity slides the stored expiry; the long-lived cookie is never re-sent by ordinary requests", async () => {
    const r = await post("/api/auth/login", { email: "admin-a@test.local", password: PW });
    expect(r.setCookie).toMatch(/Max-Age=34560000/); // 400 days — the server-side expiry governs
    const token = decodeURIComponent(/cp_session=([^;]+)/.exec(r.setCookie)![1]);
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await db.execute({ sql: "UPDATE sessions SET last_activity = ?, expires_at = ? WHERE id = ?", args: [old, new Date(Date.now() + 60_000).toISOString(), sessionDbId(token)] });
    const res = await fetch(`${base}/api/auth/me`, { headers: { cookie: `cp_session=${token}` } });
    expect(res.status).toBe(200);
    // No Set-Cookie: a slow response can never roll a newer cookie back.
    expect(res.headers.get("set-cookie") || "").not.toContain("cp_session=");
    const row = (await db.execute({ sql: "SELECT expires_at FROM sessions WHERE id = ?", args: [sessionDbId(token)] })).rows[0] as any;
    expect(Date.parse(row.expires_at) - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
  });

  it("switching workspace keeps the same session token (rebinds it)", async () => {
    // member-a belongs to teams A and B (an admin edit above moved a team-B
    // row to this email); give that row the account's password.
    await db.execute({ sql: "UPDATE members SET password = (SELECT password FROM members WHERE id = ?) WHERE email = 'member-a@test.local'", args: [ids.memberA] });
    const r = await post("/api/auth/login", { email: "member-a@test.local", password: PW });
    const token = decodeURIComponent(/cp_session=([^;]+)/.exec(r.setCookie)![1]);
    const me = await api("/api/auth/me", { session: token });
    const other = me.body.user.team_id === ids.teamA ? ids.teamB : ids.teamA;
    const sw = await api("/api/teams/switch", { method: "POST", body: JSON.stringify({ team_id: other }), session: token });
    expect(sw.status).toBe(200);
    expect(sw.body.sessionId).toBeUndefined();
    expect(sw.setCookie === "" || sw.setCookie.includes(`cp_session=${token}`)).toBe(true);
    expect((await api("/api/auth/me", { session: token })).body.user.team_id).toBe(other);
  });

  it("signing out also revokes a migrated pre-cookie token in its grace period", async () => {
    const now = new Date().toISOString();
    const far = new Date(Date.now() + 86400000).toISOString();
    const legacy = "session_1700000000001_logout";
    await db.execute({ sql: "INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)", args: [legacy, ids.memberA, now, far, now] });
    const first = await fetch(`${base}/api/auth/me`, { headers: { "x-session-id": legacy } });
    const token = decodeURIComponent(/cp_session=([^;]+)/.exec(first.headers.get("set-cookie") || "")![1]);
    const out = await api("/api/auth/logout", { method: "POST", session: token });
    expect(out.status).toBe(200);
    const left = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM sessions WHERE id IN (?, ?)", args: [legacy, sessionDbId(token)] })).rows[0] as any;
    expect(Number(left.n)).toBe(0);
  });
});

describe("WebSocket origin", () => {
  it("refuses a socket opened by another site", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: "https://evil.example", cookie: `cp_session=${SESS.memberA}` } });
    const code = await new Promise<number>((resolve) => { ws.on("close", (c) => resolve(c)); ws.on("error", () => resolve(-1)); });
    expect(code).toBe(4003);
  });
});

describe("login rate limiting", () => {
  it("throttles repeated guesses against one account", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      statuses.push((await post("/api/auth/login", { email: "admin-b@test.local", password: `guess-${i}` })).status);
    }
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses[9]).toBe(429);
  });
});
