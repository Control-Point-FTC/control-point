/**
 * Integration tests for the durable file store (stored_files).
 *
 * Render's filesystem is ephemeral: every user upload (avatars, task proof,
 * feedback attachments, emoji, CAD) must persist in the database and survive
 * a server restart/redeploy. These tests boot the real server against a
 * throwaway SQLite file and verify:
 *  - uploads return DB-backed /api/files/:id URLs (never /uploads/...)
 *  - files are served back byte-identical
 *  - team isolation holds on team-scoped files (avatars are visible to any
 *    signed-in user)
 *  - everything still loads after a full server restart against the same DB
 *    (simulating a Render redeploy wiping the disk)
 *
 * No production DB is touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Talks to a freshly booted dev server; the first requests can be slow.
vi.setConfig({ testTimeout: 30_000 });
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createClient } from "@libsql/client";
import { sessionDbId, withSession } from "./helpers/session";
import { killServerProcess, spawnServerProcess } from "./helpers/testServer";

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

async function waitForServer(base: string, tries = 120): Promise<void> {
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
let tmpDir = "";
let dbPath = "";
let port = 0;

const SESS = { admin: "cps_test-fs-admin", outsider: "cps_test-fs-outsider" };
let teamA = 0;
let teamB = 0;
let taskId = 0;

async function api(path: string, session: string | null, opts: RequestInit = {}) {
  const headers = new Headers(opts.headers);
  if (session) withSession(headers, session);
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  const raw = Buffer.from(await res.arrayBuffer());
  let body: any = null;
  try { body = JSON.parse(raw.toString("utf8")); } catch { /* non-JSON */ }
  return { status: res.status, body, buf: raw, headers: res.headers };
}

async function bootServer(): Promise<void> {
  proc = spawnServerProcess({ ...process.env, DATABASE_URL: `file:${dbPath}`, PORT: String(port) });
  await waitForServer(base);
}

async function killServer(): Promise<void> {
  if (proc) {
    killServerProcess(proc, "SIGKILL");
    proc = null;
  }
  await new Promise((r) => setTimeout(r, 800));
}

function pngBytes(): Buffer {
  // Minimal valid 1x1 PNG.
  return Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082",
    "hex"
  );
}

// jsdom's FormData/Blob do not interop with undici fetch, so multipart bodies
// are built by hand (same approach as taskCompletion.test.ts).
function multipart(field: string, filename: string, mime: string, data: Buffer): { body: Buffer; contentType: string } {
  const boundary = "----cp-filestore-boundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, data, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function uploadAvatar(session: string) {
  const { body, contentType } = multipart("avatar", "avatar.png", "image/png", pngBytes());
  const headers = new Headers({ "Content-Type": contentType });
  return api("/api/profile/avatar", session, { method: "POST", headers, body });
}

async function completeTaskWithProof(session: string, taskId: number) {
  const { body, contentType } = multipart("images", "proof.png", "image/png", pngBytes());
  const headers = new Headers({ "Content-Type": contentType });
  return api(`/api/tasks/${taskId}/complete`, session, { method: "POST", headers, body });
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "cp-filestore-"));
  dbPath = join(tmpDir, "test.db");
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  await bootServer();

  const db = createClient({ url: `file:${dbPath}` });
  const now = new Date().toISOString();
  const far = new Date(Date.now() + 86400000).toISOString();
  const mkTeam = async (name: string) => {
    const r = await db.execute({ sql: "INSERT INTO teams (name, number) VALUES (?, ?)", args: [name, name] });
    return Number(r.lastInsertRowid);
  };
  teamA = await mkTeam("FS Team A");
  teamB = await mkTeam("FS Team B");
  const mkMember = async (teamId: number, name: string, email: string, accountType: string) => {
    const r = await db.execute({
      sql: "INSERT INTO members (team_id, name, role, email, account_type) VALUES (?, ?, 'member', ?, ?)",
      args: [teamId, name, email, accountType],
    });
    return Number(r.lastInsertRowid);
  };
  const adminId = await mkMember(teamA, "FS Admin", "fsadmin@test.local", "admin");
  const outsiderId = await mkMember(teamB, "FS Outsider", "fsoutsider@test.local", "student");
  for (const [sess, mid] of [[SESS.admin, adminId], [SESS.outsider, outsiderId]] as const) {
    await db.execute({
      sql: "INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)",
      args: [sessionDbId(sess), mid, now, far, now],
    });
  }
  const t = await db.execute({
    sql: "INSERT INTO tasks (team_id, assigned_to, title, status) VALUES (?, ?, ?, 'in-progress')",
    args: [teamA, adminId, "FS proof task"],
  });
  taskId = Number(t.lastInsertRowid);
  (globalThis as any).__fsAdminId = adminId;
  await db.close();
}, 120000);

afterAll(async () => {
  await killServer();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("durable file store", () => {
  it("avatar upload returns a DB-backed URL and serves the bytes", async () => {
    const up = await uploadAvatar(SESS.admin);
    if (up.status !== 200) console.log("AVATAR UPLOAD FAILED:", up.status, JSON.stringify(up.body));
    expect(up.status).toBe(200);
    expect(up.body.avatar_url).toMatch(/^\/api\/files\/\d+$/);
    const get = await api(up.body.avatar_url, SESS.admin);
    expect(get.status).toBe(200);
    const buf = get.buf;
    expect(buf.equals(pngBytes())).toBe(true);
    (globalThis as any).__avatarUrl = up.body.avatar_url;
  });

  it("avatars are visible to signed-in users on other teams", async () => {
    const url = (globalThis as any).__avatarUrl as string;
    const get = await api(url, SESS.outsider);
    expect(get.status).toBe(200);
  });

  it("rejects unauthenticated file reads", async () => {
    const url = (globalThis as any).__avatarUrl as string;
    const get = await api(url, null);
    expect([401, 403]).toContain(get.status);
  });

  it("task proof images are DB-backed and team-isolated", async () => {
    const done = await completeTaskWithProof(SESS.admin, taskId);
    if (done.status !== 200) console.log("PROOF UPLOAD FAILED:", done.status, JSON.stringify(done.body));
    expect(done.status).toBe(200);
    const imgs = JSON.parse(done.body.task?.completion_images || "[]");
    expect(imgs.length).toBe(1);
    expect(imgs[0]).toMatch(/^\/api\/files\/\d+$/);
    (globalThis as any).__proofUrl = imgs[0];
    // Same-team admin can load it…
    expect((await api(imgs[0], SESS.admin)).status).toBe(200);
    // …a member of another team cannot.
    expect((await api(imgs[0], SESS.outsider)).status).toBe(403);
  });

  it("<img>-style requests authenticate with the session cookie alone (no header, no URL token)", async () => {
    const url = (globalThis as any).__avatarUrl as string;
    // An <img> tag sends only cookies — the HttpOnly session cookie suffices.
    const viaCookie = await api(url, null, { headers: { cookie: `cp_session=${SESS.admin}` } });
    expect(viaCookie.status).toBe(200);
    expect(viaCookie.buf.equals(pngBytes())).toBe(true);
    // A token in the query string authenticates nothing.
    const viaQuery = await api(`${url}?sessionId=${SESS.admin}`, null);
    expect([401, 403]).toContain(viaQuery.status);
  });

  it("stored files revalidate (no stale cache) and 304 on a matching ETag", async () => {
    const url = (globalThis as any).__avatarUrl as string;
    const first = await api(url, SESS.admin);
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const again = await api(url, SESS.admin, { headers: { "if-none-match": etag! } });
    expect(again.status).toBe(304);
    // A 304 still requires auth.
    const anon = await api(url, null, { headers: { "if-none-match": etag! } });
    expect([401, 403]).toContain(anon.status);
  });

  it("untrusted uploads never render inline: HTML is a sandboxed download", async () => {
    const db = createClient({ url: `file:${dbPath}` });
    const r = await db.execute({
      sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, data) VALUES (?, ?, 'chat', 'evil.html', 'text/html', ?)",
      args: [teamA, (globalThis as any).__fsAdminId, Buffer.from("<script>alert(1)</script>")],
    });
    await db.close();
    const res = await api(`/api/files/${Number(r.lastInsertRowid)}`, SESS.admin);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    // SVG renders inline (fine in <img>), but under the sandbox CSP so a
    // direct open can't run its scripts.
    const db2 = createClient({ url: `file:${dbPath}` });
    const sv = await db2.execute({
      sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, data) VALUES (NULL, ?, 'avatar', 'a.svg', 'image/svg+xml', ?)",
      args: [(globalThis as any).__fsAdminId, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    });
    await db2.close();
    const svg = await api(`/api/files/${Number(sv.lastInsertRowid)}`, SESS.admin);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
    expect(svg.headers.get("content-security-policy")).toContain("sandbox");
    // Raster images still render inline.
    const img = await api((globalThis as any).__avatarUrl, SESS.admin);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("content-disposition") || "inline").toMatch(/^inline/);
  });

  it("every upload survives a full server restart (Render redeploy simulation)", async () => {
    const avatarUrl = (globalThis as any).__avatarUrl as string;
    const proofUrl = (globalThis as any).__proofUrl as string;
    await killServer();
    await bootServer(); // same DB file, fresh process, empty ephemeral disk
    const a = await api(avatarUrl, SESS.admin);
    expect(a.status).toBe(200);
    expect(a.buf.equals(pngBytes())).toBe(true);
    const p = await api(proofUrl, SESS.admin);
    expect(p.status).toBe(200);
    expect(p.buf.equals(pngBytes())).toBe(true);
    // Isolation still enforced after restart.
    expect((await api(proofUrl, SESS.outsider)).status).toBe(403);
  }, 120000);

  // Last: signs the outsider session out.
  it("logout expires the files cookie", async () => {
    const out = await api("/api/auth/logout", SESS.outsider, { method: "POST" });
    expect(out.status).toBe(200);
    const sc = out.headers.get("set-cookie") || "";
    expect(sc).toMatch(/cp_files_sid=;[^,]*Max-Age=0/);
  });
});
