/**
 * Shared accounts with Control Scout (controlscout.org).
 *
 * Contract: control-scout docs/shared-accounts.md. Control Point owns one
 * small `accounts` table (migration 129), keyed by lower-cased email; its id
 * is the person's account id in both apps. Control Scout reads and writes it
 * through the internal API below, and "Continue with Control Point" hands a
 * signed-in Control Point visitor to Scout with a single-use code.
 *
 * Nothing here creates `members` rows or touches `verified_emails`,
 * `proven_passwords` or any password. The one write to membership is the
 * members/remove route below, which goes through Control Point's own
 * removal path (removeMembership in server.ts, the same soft remove as an
 * admin's DELETE /api/members/:id).
 *
 * Every route that returns `account` includes `workspaces`: one
 * `{ id, name, role }` per workspace (team) the email has an active
 * `members` row in (`is_active` 1 or NULL). `id` is `String(teams.id)`, stable
 * across renames; `name` is `teams.name`. `role` is "admin" when the row has
 * `account_type = 'admin'` or holds a role on that workspace whose
 * permissions include "*" or "manage_members" (Control Point's own admin
 * rule, as in countAdmins); otherwise "member". `controlPoint` is unchanged.
 *
 * Workspace members (Control Scout's Settings → Workspace → Members):
 *
 *   GET /internal/workspaces/:workspaceId/members
 *     200 { workspace: { id, name }, members: [{ accountId, name, role }] }
 *       Everyone with an active `members` row on that team, one entry per
 *       email (rows without an email are listed on their own). `accountId`
 *       is the shared `accounts.id` for that email, or null when the person
 *       has never used Control Scout. `role` is "admin" | "member" by the
 *       rule above. Admins first, then by name.
 *     400 { error: "invalid_workspace" }   404 { error: "not_found" } (no such team)
 *
 *   POST /internal/workspaces/:workspaceId/members/remove
 *     body { accountId, actorAccountId }   (shared accounts.id values)
 *     Both ids resolve to emails, then to active `members` rows on that team.
 *     200 { ok: true }  the target's rows are removed with Control Point's
 *                       normal soft remove (is_active = 0, roles, sessions,
 *                       sticky notes and live sockets dropped; history kept).
 *     400 { error: "invalid_input" }  ids are not positive integers
 *     403 { error: "not_admin" }      the actor is not an admin of that workspace
 *     404 { error: "not_member" }     the target has no active row there
 *     409 { error: "last_admin" }     the target is the workspace's last admin
 *     Removing yourself is allowed unless you are the last admin. Each
 *     removal is logged ("[shared-accounts] member removed …", ids only):
 *     Control Point has no audit table, and Scout records its own audit.
 *
 * Env:
 *   CONTROL_SCOUT_INTERNAL_KEY  shared secret (32+ chars) Scout sends as
 *                               X-Internal-Key. Unset → /internal/* is 404.
 *   CONTROL_SCOUT_URL           Scout's origin (e.g. https://controlscout.org).
 *                               The hand-off only ever redirects there.
 *                               Unset → /api/auth/scout/start is 404.
 */
import crypto from "crypto";
import express from "express";
import { RateLimiter, clientIp, limit, normEmail } from "./rateLimit.js";

export interface SharedAccountDeps {
  dbGet: (sql: string, ...args: any[]) => Promise<any>;
  dbAll: (sql: string, ...args: any[]) => Promise<any[]>;
  dbRun: (sql: string, ...args: any[]) => Promise<{ changes: number; lastInsertRowid: number }>;
  /** The signed-in visitor's email (any valid cp_session, teamless included), or null. */
  sessionEmail: (req: any) => Promise<string | null>;
  /** Control Point's countAdmins: active admins of a team, by the workspace admin rule. */
  countAdmins: (teamId: number) => Promise<number>;
  /** Control Point's one member removal path (the soft remove behind DELETE /api/members/:id). */
  removeMembership: (teamId: number, memberId: number) => Promise<void>;
  env?: Record<string, string | undefined>;
  now?: () => number;
}

export interface SharedAccount {
  id: number;
  email: string;
  displayName: string | null;
  createdAt: string;
  controlPoint: {
    member: boolean;
    teams: { teamNumber: number | null; name: string }[];
    /** FTC team numbers on the shortlist of the member's workspaces (each workspace's latest season), for Scout to merge in. */
    shortlist: number[];
  };
  /**
   * One entry per Control Point workspace (team) the email has an active
   * `members` row in, ordered by id. `id` is `teams.id` as a string (stable
   * across renames). `role` is "admin" when that membership is a workspace
   * admin by Control Point's own rule (see workspaceAdmin), else "member".
   */
  workspaces: SharedWorkspace[];
}

export interface SharedWorkspace {
  id: string;
  name: string;
  role: "admin" | "member";
}

/** Permission keys that make a role a workspace admin (the same set Control Point's countAdmins uses). */
const ADMIN_PERMS = new Set(["*", "manage_members"]);

/** A roles.permissions JSON value → its string keys; anything malformed is no permissions. */
export function parsePermissions(json: unknown): string[] {
  try {
    const a = JSON.parse(typeof json === "string" && json ? json : "[]");
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Whether a membership is a workspace admin, by Control Point's existing
 * rule: `members.account_type = 'admin'` (the legacy flag, kept in sync by
 * syncAccountType), or a role on that workspace granting "*" or "manage_members".
 */
export function workspaceAdmin(accountType: unknown, rolePermissions: unknown[]): boolean {
  if (accountType === "admin") return true;
  return rolePermissions.some((p) => parsePermissions(p).some((k) => ADMIN_PERMS.has(k)));
}

/** Sign-in providers a Scout visitor can start with (Control Point runs the OAuth; Scout never sees provider tokens). */
export const SCOUT_VIA = ["google", "discord", "github"] as const;
export type ScoutVia = (typeof SCOUT_VIA)[number];
export const isScoutVia = (v: unknown): v is ScoutVia => typeof v === "string" && (SCOUT_VIA as readonly string[]).includes(v);
const MAX_SHORTLIST = 200;

export const HANDOFF_TTL_MS = 2 * 60 * 1000;
export const MIN_INTERNAL_KEY_LENGTH = 32;
export const MAX_DISPLAY_NAME = 100;
const SCOUT_VERIFIERS = new Set(["scout-email-code", "google"]);
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CODE_RE = /^cph_[A-Za-z0-9_-]{43}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[1-9]\d{0,14}$/;

/**
 * SQL for "this members row is a workspace admin" (alias `m`), the same rule as workspaceAdmin and
 * countAdmins: account_type 'admin', or a role on its own team whose permissions JSON holds "*" or
 * "manage_members".
 */
const ADMIN_SQL = (m: string) => `(${m}.account_type = 'admin' OR EXISTS (
  SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id
   WHERE mr.member_id = ${m}.id AND r.team_id = ${m}.team_id
     AND (instr(r.permissions, '"*"') > 0 OR instr(r.permissions, '"manage_members"') > 0)))`;

/** A positive integer id from a path segment or JSON value, else null. */
export function cleanId(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  return ID_RE.test(s) ? Number(s) : null;
}

export const isHandoffState = (s: unknown): s is string => typeof s === "string" && STATE_RE.test(s);

/** The internal key, or null when unset or too short to trust. */
export function internalKeyFrom(env: Record<string, string | undefined>): string | null {
  const k = env.CONTROL_SCOUT_INTERNAL_KEY || "";
  return k.length >= MIN_INTERNAL_KEY_LENGTH ? k : null;
}

/** Scout's exact origin from CONTROL_SCOUT_URL, or null when unset/invalid. */
export function scoutOriginFrom(env: Record<string, string | undefined>): string | null {
  const raw = (env.CONTROL_SCOUT_URL || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Constant-time key check; hashing first makes the lengths equal. */
export function keyMatches(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export const hashHandoffCode = (code: string) => crypto.createHash("sha256").update(code).digest("hex");
export const newHandoffCode = () => "cph_" + crypto.randomBytes(32).toString("base64url");

/** Normalised email if well formed, else null. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = normEmail(v);
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** displayName: undefined/null/"" → null; too long or not a string → invalid. */
function cleanDisplayName(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (s.length > MAX_DISPLAY_NAME) return { ok: false };
  return { ok: true, value: s || null };
}

export function createSharedAccounts(deps: SharedAccountDeps) {
  const env = deps.env || process.env;
  const now = deps.now || Date.now;
  const iso = () => new Date(now()).toISOString();

  /** Insert the account for `email` if missing (first proof wins), touch last_seen_at. */
  async function upsertAccount(email: string, verifiedBy: string, displayName: string | null): Promise<number> {
    const t = iso();
    await deps.dbRun(
      `INSERT INTO accounts (email, display_name, verified_by, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         display_name = COALESCE(accounts.display_name, excluded.display_name)`,
      email, displayName, verifiedBy, t, t,
    );
    const row = await deps.dbGet("SELECT id FROM accounts WHERE email = ?", email);
    return Number(row.id);
  }

  async function loadAccount(id: number): Promise<SharedAccount | null> {
    const row = await deps.dbGet("SELECT id, email, display_name, created_at FROM accounts WHERE id = ?", id);
    if (!row) return null;
    // Read-only view of Control Point membership: active rows with this email.
    const teams = await deps.dbAll(
      `SELECT t.id AS id, t.name AS name, t.ftc_team_number AS ftc
         FROM members m JOIN teams t ON t.id = m.team_id
        WHERE LOWER(TRIM(m.email)) = ? AND COALESCE(m.is_active, 1) = 1
        GROUP BY t.id ORDER BY t.id`,
      String(row.email),
    );
    // Each workspace's shortlist for its latest season (the shortlist is shared by a workspace, per season).
    // The latest season counts even if every entry in it was removed: a cleared shortlist is empty, not last year's.
    const ids = teams.map((t: any) => Number(t.id)).filter((x: number) => Number.isInteger(x));
    const shortlistRows = ids.length ? await deps.dbAll(
      `SELECT DISTINCT s.team_number AS n
         FROM scouting_shortlist s
        WHERE s.team_id IN (${ids.map(() => "?").join(",")}) AND COALESCE(s.deleted, 0) = 0
          AND s.season = (SELECT MAX(s2.season) FROM scouting_shortlist s2 WHERE s2.team_id = s.team_id)
        ORDER BY s.team_number LIMIT ${MAX_SHORTLIST}`,
      ...ids,
    ) : [];
    // Workspace roles: the same active rows, plus any roles each membership holds on its own workspace.
    const memberships = ids.length ? await deps.dbAll(
      `SELECT m.id AS member_id, m.team_id AS team_id, m.account_type AS account_type
         FROM members m
        WHERE LOWER(TRIM(m.email)) = ? AND COALESCE(m.is_active, 1) = 1
          AND m.team_id IN (${ids.map(() => "?").join(",")})`,
      String(row.email), ...ids,
    ) : [];
    const memberIds = memberships.map((m: any) => Number(m.member_id)).filter((x: number) => Number.isInteger(x));
    const roleRows = memberIds.length ? await deps.dbAll(
      `SELECT mr.member_id AS member_id, r.permissions AS permissions
         FROM member_roles mr
         JOIN roles r ON r.id = mr.role_id
         JOIN members m ON m.id = mr.member_id
        WHERE mr.member_id IN (${memberIds.map(() => "?").join(",")}) AND r.team_id = m.team_id`,
      ...memberIds,
    ) : [];
    const adminTeams = new Set<number>();
    for (const m of memberships) {
      const perms = roleRows.filter((r: any) => Number(r.member_id) === Number(m.member_id)).map((r: any) => r.permissions);
      if (workspaceAdmin(m.account_type, perms)) adminTeams.add(Number(m.team_id));
    }
    return {
      id: Number(row.id),
      email: String(row.email),
      displayName: row.display_name == null ? null : String(row.display_name),
      createdAt: String(row.created_at),
      controlPoint: {
        member: teams.length > 0,
        teams: teams.map((t: any) => {
          const n = t.ftc == null ? NaN : Number(t.ftc);
          return { teamNumber: Number.isInteger(n) && n > 0 ? n : null, name: String(t.name ?? "") };
        }),
        shortlist: shortlistRows.map((r: any) => Number(r.n)).filter((n: number) => Number.isInteger(n) && n > 0 && n <= 999999),
      },
      workspaces: teams.map((t: any) => ({
        id: String(t.id),
        name: String(t.name ?? ""),
        role: adminTeams.has(Number(t.id)) ? "admin" as const : "member" as const,
      })),
    };
  }

  /** Role permissions JSON of each listed membership, from roles on its own workspace. */
  async function rolePermissionsByMember(teamId: number, memberIds: number[]): Promise<Map<number, unknown[]>> {
    const out = new Map<number, unknown[]>();
    if (!memberIds.length) return out;
    const rows = await deps.dbAll(
      `SELECT mr.member_id AS member_id, r.permissions AS permissions
         FROM member_roles mr JOIN roles r ON r.id = mr.role_id
        WHERE mr.member_id IN (${memberIds.map(() => "?").join(",")}) AND r.team_id = ?`,
      ...memberIds, teamId,
    );
    for (const r of rows) {
      const id = Number(r.member_id);
      out.set(id, [...(out.get(id) || []), r.permissions]);
    }
    return out;
  }

  /** The active `members` rows on `teamId` for shared account `accountId` (by its email), each marked admin or not. */
  async function membershipsOf(teamId: number, accountId: number): Promise<{ id: number; admin: boolean }[]> {
    const acc = await deps.dbGet("SELECT email FROM accounts WHERE id = ?", accountId);
    if (!acc) return [];
    const rows = await deps.dbAll(
      `SELECT id, account_type FROM members
        WHERE team_id = ? AND LOWER(TRIM(email)) = ? AND COALESCE(is_active, 1) = 1 ORDER BY id`,
      teamId, String(acc.email),
    );
    const perms = await rolePermissionsByMember(teamId, rows.map((m: any) => Number(m.id)));
    return rows.map((m: any) => ({ id: Number(m.id), admin: workspaceAdmin(m.account_type, perms.get(Number(m.id)) || []) }));
  }

  /** Everyone in a workspace, one entry per email, for Scout's members list. Null when the team does not exist. */
  async function workspaceMembers(teamId: number) {
    const team = await deps.dbGet("SELECT id, name FROM teams WHERE id = ?", teamId);
    if (!team) return null;
    const rows = await deps.dbAll(
      `SELECT m.id AS id, m.name AS name, LOWER(TRIM(m.email)) AS email, m.account_type AS account_type, a.id AS account_id
         FROM members m LEFT JOIN accounts a ON a.email = LOWER(TRIM(m.email))
        WHERE m.team_id = ? AND COALESCE(m.is_active, 1) = 1
        ORDER BY m.id`,
      teamId,
    );
    const perms = await rolePermissionsByMember(teamId, rows.map((m: any) => Number(m.id)));
    const byPerson = new Map<string, { accountId: number | null; name: string; role: "admin" | "member" }>();
    for (const m of rows) {
      const key = m.email ? `e:${m.email}` : `m:${m.id}`;
      const admin = workspaceAdmin(m.account_type, perms.get(Number(m.id)) || []);
      const prev = byPerson.get(key);
      if (prev) {
        if (admin) prev.role = "admin";
        continue;
      }
      byPerson.set(key, {
        accountId: m.account_id == null ? null : Number(m.account_id),
        name: String(m.name ?? "").trim() || "Member",
        role: admin ? "admin" : "member",
      });
    }
    const members = [...byPerson.values()].sort((a, b) =>
      (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { workspace: { id: String(team.id), name: String(team.name ?? "") }, members };
  }

  /** The /internal/* router (mount before the /api CSRF middleware). */
  function internalRouter() {
    const key = internalKeyFrom(env);
    const router = express.Router();
    if (env.CONTROL_SCOUT_INTERNAL_KEY && !key) {
      console.warn(`[shared-accounts] CONTROL_SCOUT_INTERNAL_KEY is shorter than ${MIN_INTERNAL_KEY_LENGTH} characters; /internal is off`);
    }
    // Feature off: every internal route is indistinguishable from no route.
    router.use((_req, res, next) => (key ? next() : res.status(404).json({ error: "Not found" })));

    // Wrong keys are counted per IP; Scout's calls (right key) never are.
    const failures = new Map<string, { count: number; resetAt: number }>();
    const FAIL_MAX = 20;
    const FAIL_WINDOW = 15 * 60 * 1000;
    setInterval(() => {
      const t = now();
      for (const [k, v] of failures) if (v.resetAt <= t) failures.delete(k);
    }, 10 * 60 * 1000).unref();
    router.use((req, res, next) => {
      const ip = clientIp(req);
      const t = now();
      let f = failures.get(ip);
      if (f && f.resetAt <= t) { failures.delete(ip); f = undefined; }
      // The right key always passes (a fixed config must work at once); only wrong keys are locked out.
      if (keyMatches(req.headers["x-internal-key"], key!)) return next();
      if (f && f.count >= FAIL_MAX) return res.status(429).json({ error: "Too many attempts" });
      if (!f) { f = { count: 0, resetAt: t + FAIL_WINDOW }; failures.set(ip, f); }
      f.count++;
      return res.status(401).json({ error: "Unauthorized" });
    });
    router.use(express.json({ limit: "16kb" }));
    router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

    router.post("/accounts/resolve", async (req, res) => {
      const body = req.body || {};
      const email = cleanEmail(body.email);
      if (!email) return res.status(400).json({ error: "invalid_email" });
      if (typeof body.verifiedBy !== "string" || !SCOUT_VERIFIERS.has(body.verifiedBy)) {
        return res.status(400).json({ error: "invalid_verified_by" });
      }
      const name = cleanDisplayName(body.displayName);
      if (!name.ok) return res.status(400).json({ error: "invalid_display_name" });
      const id = await upsertAccount(email, body.verifiedBy, name.value);
      res.json({ account: await loadAccount(id) });
    });

    router.get("/accounts/:id", async (req, res) => {
      const raw = String(req.params.id || "");
      const account = /^[1-9]\d{0,14}$/.test(raw) ? await loadAccount(Number(raw)) : null;
      if (!account) return res.status(404).json({ error: "Not found" });
      res.json({ account });
    });

    router.post("/handoff/redeem", async (req, res) => {
      const { code, state } = req.body || {};
      if (typeof code !== "string" || !CODE_RE.test(code) || !isHandoffState(state)) {
        return res.status(400).json({ error: "invalid_code" });
      }
      const hash = hashHandoffCode(code);
      const row = await deps.dbGet("SELECT account_id, state, expires_at FROM scout_handoff_codes WHERE code_hash = ?", hash);
      if (!row) return res.status(400).json({ error: "invalid_code" });
      // Any redeem attempt spends the code, so a leaked code without its
      // state is worthless afterwards. The conditional update is the lock.
      const t = iso();
      const spent = await deps.dbRun("UPDATE scout_handoff_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL", t, hash);
      if (!spent.changes) return res.status(400).json({ error: "code_used" });
      if (String(row.expires_at) <= t) return res.status(400).json({ error: "code_expired" });
      if (String(row.state) !== state) return res.status(400).json({ error: "state_mismatch" });
      await deps.dbRun("UPDATE accounts SET last_seen_at = ? WHERE id = ?", t, row.account_id);
      const account = await loadAccount(Number(row.account_id));
      if (!account) return res.status(400).json({ error: "invalid_code" });
      res.json({ account });
    });

    router.get("/workspaces/:workspaceId/members", async (req, res) => {
      const teamId = cleanId(req.params.workspaceId);
      if (!teamId) return res.status(400).json({ error: "invalid_workspace" });
      const out = await workspaceMembers(teamId);
      if (!out) return res.status(404).json({ error: "not_found" });
      res.json(out);
    });

    // Scout's Remove button: an admin of the workspace removes someone (or themselves).
    router.post("/workspaces/:workspaceId/members/remove", async (req, res) => {
      const body = req.body || {};
      const teamId = cleanId(req.params.workspaceId);
      const accountId = cleanId(body.accountId);
      const actorAccountId = cleanId(body.actorAccountId);
      if (!teamId || !accountId || !actorAccountId) return res.status(400).json({ error: "invalid_input" });
      const actor = await membershipsOf(teamId, actorAccountId);
      if (!actor.some((m) => m.admin)) return res.status(403).json({ error: "not_admin" });
      const target = await membershipsOf(teamId, accountId);
      if (!target.length) return res.status(404).json({ error: "not_member" });
      // Never strand a workspace without an admin (the rule Control Point's own routes keep).
      const targetAdmins = target.filter((m) => m.admin).length;
      if (targetAdmins && (await deps.countAdmins(teamId)) - targetAdmins < 1) {
        return res.status(409).json({ error: "last_admin" });
      }
      // The checks above can be overtaken by a concurrent removal (two admins removing each other at
      // once), so each row is first deactivated by one guarded statement: only while the actor is
      // still an active admin and, for an admin target, another active admin remains. SQLite runs
      // each statement atomically, so two overlapping removals can't both pass.
      const actorIds = actor.filter((m) => m.admin).map((m) => m.id);
      for (const m of target) {
        const r = await deps.dbRun(
          `UPDATE members SET is_active = 0
            WHERE id = ? AND team_id = ? AND COALESCE(is_active, 1) = 1
              AND EXISTS (SELECT 1 FROM members a WHERE a.id IN (${actorIds.map(() => "?").join(",")})
                            AND COALESCE(a.is_active, 1) = 1 AND ${ADMIN_SQL("a")})
              AND (NOT ${ADMIN_SQL("members")}
                   OR EXISTS (SELECT 1 FROM members o WHERE o.team_id = ? AND o.id <> ? AND COALESCE(o.is_active, 1) = 1 AND ${ADMIN_SQL("o")}))`,
          m.id, teamId, ...actorIds, teamId, m.id,
        );
        if (!r.changes) {
          // Lost a race: say why, by what's true now.
          if (!(await membershipsOf(teamId, actorAccountId)).some((x) => x.admin)) return res.status(403).json({ error: "not_admin" });
          if (!(await membershipsOf(teamId, accountId)).some((x) => x.id === m.id)) continue; // already removed meanwhile
          return res.status(409).json({ error: "last_admin" });
        }
        // Then Control Point's normal removal (roles, sessions, sticky notes, calendar, sockets).
        await deps.removeMembership(teamId, m.id);
      }
      // Control Point has no audit table: a log line with ids only (Scout keeps the full audit).
      console.info(`[shared-accounts] member removed from workspace ${teamId} by Control Scout: account ${accountId} (members ${target.map((m) => m.id).join(",")}) by account ${actorAccountId} at ${iso()}`);
      res.json({ ok: true });
    });

    router.use((_req, res) => res.status(404).json({ error: "Not found" }));
    // Malformed JSON and the like: JSON error, never the HTML error page.
    router.use((err: any, _req: any, res: any, _next: any) => {
      const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 500;
      if (status === 500) console.error("[shared-accounts] internal route failed:", err);
      res.status(status).json({ error: status === 500 ? "Server error" : "Bad request" });
    });
    return router;
  }

  /**
   * GET /api/auth/scout/start?state=…: hand a signed-in visitor to Scout.
   * Signed out → the app's sign-in (`/?scout_state=…`), which comes back here.
   * With the hand-off off (no CONTROL_SCOUT_URL) it redirects to "/".
   */
  function registerStartRoute(app: express.Express) {
    const origin = scoutOriginFrom(env);
    if (env.CONTROL_SCOUT_URL && !origin) console.warn("[shared-accounts] CONTROL_SCOUT_URL is not a valid http(s) URL; the Scout hand-off is off");
    const limiter = new RateLimiter(now);
    setInterval(() => limiter.sweep(), 10 * 60 * 1000).unref();
    app.get(
      "/api/auth/scout/start",
      // Hand-off off: this is a browser route, so send people into the app rather than to a JSON error
      // (e.g. a remembered /?scout_state=… that comes back here after sign-in).
      (_req, res, next) => (origin ? next() : res.redirect(302, "/")),
      limit(limiter, "scoutstart", [{ rule: { max: 30, windowMs: 15 * 60 * 1000 }, key: (req: any) => clientIp(req) }]),
      async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        const state = req.query.state;
        if (!isHandoffState(state)) return res.status(400).json({ error: "invalid_state" });
        const email = cleanEmail(await deps.sessionEmail(req));
        if (!email) {
          // "Continue with Google/Discord/GitHub" from Scout: straight into that provider's
          // sign-in, which comes back through completeOAuthHandoff (no Control Point login needed).
          if (isScoutVia(req.query.via)) return res.redirect(302, `/api/auth/${req.query.via}?intent=login&scout_state=${encodeURIComponent(state)}`);
          // Relative, same-origin, and built from the validated state only.
          return res.redirect(302, `/?scout_state=${encodeURIComponent(state)}`);
        }
        await issueHandoff(res, origin!, email, "control-point", state);
      },
    );
  }

  /** Mint a single-use hand-off code for this account and send the browser to Scout with it. */
  async function issueHandoff(res: express.Response, origin: string, email: string, verifiedBy: string, state: string) {
    const accountId = await upsertAccount(email, verifiedBy, null);
    const code = newHandoffCode();
    const t = now();
    await deps.dbRun(
      "INSERT INTO scout_handoff_codes (code_hash, account_id, state, expires_at) VALUES (?, ?, ?, ?)",
      hashHandoffCode(code), accountId, state, new Date(t + HANDOFF_TTL_MS).toISOString(),
    );
    // Old codes are useless after their TTL; keep the table small.
    await deps.dbRun("DELETE FROM scout_handoff_codes WHERE expires_at < ?", new Date(t - 60 * 60 * 1000).toISOString()).catch(() => {});
    const qs = new URLSearchParams({ code, state }).toString();
    res.redirect(302, `${origin}/api/auth/control-point/callback?${qs}`);
  }

  /**
   * The end of an OAuth sign-in that Scout started (`via`): the provider has
   * verified `email`, so Control Point vouches for it to Scout. No Control
   * Point session or membership is created or needed: someone who only uses
   * Scout can still sign in with Google/Discord/GitHub.
   */
  async function completeOAuthHandoff(res: express.Response, provider: ScoutVia, rawEmail: string, state: string) {
    const origin = scoutOriginFrom(env);
    const email = cleanEmail(rawEmail);
    if (!origin || !isHandoffState(state) || !email) return res.redirect(302, "/");
    await issueHandoff(res, origin, email, provider, state);
  }

  return { internalRouter, registerStartRoute, completeOAuthHandoff, upsertAccount, loadAccount };
}
