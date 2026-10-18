// Shared harness for integration tests that boot the real server against a
// throwaway SQLite file. Each suite gets its own port, DB and process.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { sessionDbId, withSession } from "./session";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// `npx tsx server.ts` is three processes (npx → tsx → node). Killing only the
// npx pid left the node server running after every suite, so each server
// gets its own process group and the whole group is killed. Groups still
// alive when the test worker exits (a suite that never called stop) go too.
const liveGroups = new Set<number>();
const killGroup = (pid: number, signal: NodeJS.Signals) => {
  try { process.kill(-pid, signal); } catch { /* already gone */ }
};
const killAllGroups = () => { for (const pid of liveGroups) killGroup(pid, "SIGKILL"); };
process.once("exit", killAllGroups);
// Ctrl-C / a killed run doesn't emit "exit": clean up, then end the way Node
// would have (re-raise the signal with our listener gone).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  const onSignal = () => { killAllGroups(); process.removeListener(sig, onSignal); process.kill(process.pid, sig); };
  process.once(sig, onSignal);
}

/** Start `npx tsx server.ts` in its own process group (POSIX).
 *  Without Vite's dev middleware unless `env.CP_NO_VITE` says otherwise:
 *  Vite's dependency scan blocks the server's event loop for 20–50 s
 *  shortly after boot (Windows, busy machines), so API requests sent then
 *  time out. A suite that needs Vite passes CP_NO_VITE: "". */
export function spawnServerProcess(env: Record<string, string | undefined>, stdio: any = "ignore"): ChildProcess {
  if (env.CP_NO_VITE === undefined) env = { ...env, CP_NO_VITE: "1" };
  const win = process.platform === "win32";
  // Windows can't spawn the npx.cmd shim without a shell.
  const proc = spawn(win ? "npx tsx server.ts" : "npx", win ? [] : ["tsx", "server.ts"], {
    cwd: REPO, env: env as NodeJS.ProcessEnv, stdio, shell: win, detached: !win,
  });
  if (proc.pid && !win) liveGroups.add(proc.pid);
  return proc;
}

/** Stop a server started by spawnServerProcess: the whole tree, not just npx.
 *  On Windows it resolves once taskkill has finished, so a restart on the same
 *  port never reaches the old server. */
export function killServerProcess(proc: ChildProcess | null | undefined, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  if (!proc?.pid) return Promise.resolve();
  const pid = proc.pid;
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const tk = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      tk.once("exit", () => resolve());
      tk.once("error", () => resolve());
    });
  }
  killGroup(pid, signal);
  // Anything that ignores SIGTERM is force-killed shortly after.
  setTimeout(() => { killGroup(pid, "SIGKILL"); liveGroups.delete(pid); }, 2000).unref();
  return Promise.resolve();
}

export interface TestServer {
  base: string;
  port: number;
  db: Client;
  /** fetch JSON with an optional session; one retry on a dropped keep-alive socket. */
  api: (path: string, opts?: RequestInit & { session?: string }) => Promise<{ status: number; body: any }>;
  post: (path: string, body: any, session?: string) => Promise<{ status: number; body: any }>;
  patch: (path: string, body: any, session?: string) => Promise<{ status: number; body: any }>;
  /** Insert a session row for a member and return its id. */
  session: (memberId: number) => Promise<string>;
  stop: () => Promise<void>;
}

/**
 * Wait for a spawned server to print the port it bound ("Server running on
 * http://localhost:<port>"). Rejects if the process exits first (a crash, or
 * a port already in use) or after `timeoutMs`.
 */
export function waitForBoundPort(proc: ChildProcess, timeoutMs = 60_000): Promise<number> {
  return new Promise((resolve, reject) => {
    let seen = "";
    const done = (fn: () => void) => { clearTimeout(timer); proc.stdout?.off("data", onData); proc.off("exit", onExit); fn(); };
    const onData = (chunk: Buffer) => {
      seen = (seen + chunk.toString("utf8")).slice(-4000);
      // Only a whole line: a chunk can end in the middle of the port number.
      const m = seen.match(/Server running on http:\/\/localhost:(\d+)\r?\n/);
      if (m) done(() => resolve(Number(m[1])));
    };
    const onExit = (code: number | null) => done(() => reject(new Error(`server exited before it was ready (code ${code})`)));
    const timer = setTimeout(() => done(() => reject(new Error("server did not boot in time"))), timeoutMs);
    proc.stdout?.on("data", onData);
    proc.once("exit", onExit);
  });
}

export async function startTestServer(prefix = "cp-test-", extraEnv: Record<string, string> = {}): Promise<TestServer> {
  const tmpDir = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(tmpDir, "test.db");
  // PORT=0: the server binds a port the system picks, at the moment it
  // listens, and prints it. A port picked here first (and released) could be
  // taken by another suite's server before this one bound it; this server
  // then crashed on EADDRINUSE while the boot check, and every request after
  // it, reached the other suite's server and database, so writes "succeeded"
  // (shared test session tokens) but never showed up here.
  const proc = spawnServerProcess(
    { ...process.env, DATABASE_URL: `file:${dbPath}`, PORT: "0", RESEND_API_KEY: "", PREDICT_SYNC: "off", ...extraEnv },
    ["ignore", "pipe", "pipe"],
  );
  // Keep the pipes drained (a full pipe would stall the server). Set
  // CP_TEST_SERVER_LOG=<file> to keep the server's output for debugging.
  const log = process.env.CP_TEST_SERVER_LOG;
  const sink = (chunk: Buffer) => { if (log) { try { appendFileSync(log, chunk); } catch { /* best effort */ } } };
  proc.stdout?.on("data", sink);
  proc.stderr?.on("data", sink);
  const kill = async () => {
    await killServerProcess(proc);
    await new Promise((r) => setTimeout(r, 500));
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows may hold the file briefly */ }
  };
  let port = 0;
  let base = "";
  try {
    port = await waitForBoundPort(proc);
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`${base}/api/auth/config`);
        if (r.ok || r.status === 404) break;
      } catch { /* not up yet */ }
      if (i > 200) throw new Error("server did not answer in time");
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (e) {
    // A failed boot must not leave the server process or temp dir behind.
    await kill();
    throw e;
  }
  const db = createClient({ url: `file:${dbPath}` });
  // The server writes the same SQLite file in the background (digest flush,
  // R2 copier, …). Wait for its lock instead of failing with SQLITE_BUSY.
  await db.execute("PRAGMA busy_timeout = 5000");

  const api: TestServer["api"] = async (path, opts = {}) => {
    const headers = new Headers(opts.headers);
    withSession(headers, opts.session);
    if (opts.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const go = () => fetch(`${base}${path}`, { ...opts, headers });
    const res = await go().catch(() => new Promise((r) => setTimeout(r, 300)).then(go));
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body };
  };
  let n = 0;
  // Session tokens are unique to this server, so a request that ever reached
  // another suite's server would fail to sign in instead of passing there.
  const nonce = randomBytes(4).toString("hex");
  return {
    base, port, db, api,
    post: (path, body, session) => api(path, { method: "POST", body: JSON.stringify(body), session }),
    patch: (path, body, session) => api(path, { method: "PATCH", body: JSON.stringify(body), session }),
    session: async (memberId) => {
      const id = `cps_test-${memberId}-${nonce}-${++n}`;
      const now = new Date().toISOString();
      const far = new Date(Date.now() + 86400000).toISOString();
      await db.execute({ sql: "INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)", args: [sessionDbId(id), memberId, now, far, now] });
      return id;
    },
    stop: async () => {
      try { db.close(); } catch { /* ignore */ }
      await kill();
    },
  };
}

/** Insert a team and return its id. */
export async function seedTeam(db: Client, name = "Test Team"): Promise<number> {
  return Number((await db.execute({ sql: "INSERT INTO teams (name, number) VALUES (?, '1')", args: [name] })).lastInsertRowid);
}

/** Insert a member and return its id. */
export async function seedMember(db: Client, teamId: number, name: string, email: string, accountType: "admin" | "student" = "student"): Promise<number> {
  return Number((await db.execute({
    sql: "INSERT INTO members (team_id, name, role, email, account_type, is_setup) VALUES (?, ?, 'Member', ?, ?, 1)",
    args: [teamId, name, email, accountType],
  })).lastInsertRowid);
}
