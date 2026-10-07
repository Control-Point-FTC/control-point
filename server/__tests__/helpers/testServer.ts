// Shared harness for integration tests that boot the real server against a
// throwaway SQLite file. Each suite gets its own port, DB and process.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createClient, type Client } from "@libsql/client";
import { sessionDbId, withSession } from "./session";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const p = (s.address() as any).port;
      s.close(() => resolve(p));
    });
  });
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

export async function startTestServer(prefix = "cp-test-"): Promise<TestServer> {
  const tmpDir = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(tmpDir, "test.db");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // CP_TEST_SERVER_LOG=<file> captures the server's output for debugging.
  // The child gets its own copy of the descriptor, so ours is closed as soon
  // as it has spawned (or failed to).
  const logFd = process.env.CP_TEST_SERVER_LOG ? openSync(process.env.CP_TEST_SERVER_LOG, "a") : null;
  let proc: ChildProcess;
  try {
    proc = spawn("npx", ["tsx", "server.ts"], {
      cwd: REPO,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}`, PORT: String(port), RESEND_API_KEY: "", PREDICT_SYNC: "off" },
      stdio: logFd != null ? ["ignore", logFd, logFd] : "ignore",
      shell: process.platform === "win32",
    });
  } finally {
    if (logFd != null) closeSync(logFd);
  }
  const kill = async () => {
    if (proc.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      else proc.kill("SIGTERM");
    }
    await new Promise((r) => setTimeout(r, 500));
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows may hold the file briefly */ }
  };
  try {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`${base}/api/auth/config`);
        if (r.ok || r.status === 404) break;
      } catch { /* not up yet */ }
      if (i > 200) throw new Error("server did not boot in time");
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (e) {
    // A failed boot must not leave the server process or temp dir behind.
    await kill();
    throw e;
  }
  const db = createClient({ url: `file:${dbPath}` });

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
  return {
    base, port, db, api,
    post: (path, body, session) => api(path, { method: "POST", body: JSON.stringify(body), session }),
    patch: (path, body, session) => api(path, { method: "PATCH", body: JSON.stringify(body), session }),
    session: async (memberId) => {
      const id = `cps_test-${memberId}-${++n}`;
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
