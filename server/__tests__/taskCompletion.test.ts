/**
 * Integration tests for task completion proof (server.ts routes).
 *
 * Boots the real server against a throwaway SQLite file (DATABASE_URL) and
 * exercises the HTTP API:
 *  - PATCH /api/tasks/:id may not transition a task to done (proof bypass)
 *  - POST /api/tasks/:id/complete requires notes and/or images
 *  - assigned completion by the assignee
 *  - unassigned tasks auto-assign the completer
 *  - unauthorized completion is rejected
 *  - image-only proof is accepted
 *
 * No production DB is touched; the temp dir (DB + uploads) is removed after.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Talks to a freshly booted dev server; the first requests can be slow.
vi.setConfig({ testTimeout: 30_000 });
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createClient } from "@libsql/client";
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
const uploadedBefore = new Set<string>();

const SESS = {
  admin: "cps_test-admin",
  assignee: "cps_test-assignee",
  outsider: "cps_test-outsider",
};

async function api(path: string, session: string, opts: RequestInit = {}) {
  const headers = new Headers(opts.headers);
  withSession(headers, session);
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "cp-tasktest-"));
  dbPath = join(tmpDir, "test.db");
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  // Windows needs a shell to resolve npx.cmd.
  proc = spawn("npx", ["tsx", "server.ts"], {
    shell: process.platform === "win32",
    cwd: REPO,
    // Blank the AI key: verify-proof tests must exercise the deterministic
    // paths (including AI-unavailable) without real API calls or cost.
    env: { ...process.env, GEMINI_API_KEY: "", DATABASE_URL: `file:${dbPath}`, PORT: String(port) },
    stdio: "ignore",
  });
  await waitForServer(base);

  // Seed directly against the same file the server migrated on boot.
  const db = createClient({ url: `file:${dbPath}` });
  const now = new Date().toISOString();
  const far = new Date(Date.now() + 86400000).toISOString();
  const team = await db.execute({ sql: "INSERT INTO teams (name, number) VALUES ('Task Test Team', 'TEST-1')", args: [] });
  const teamId = Number(team.lastInsertRowid);
  const mkMember = async (name: string, email: string, accountType: string) => {
    const r = await db.execute({
      sql: "INSERT INTO members (team_id, name, role, email, account_type) VALUES (?, ?, 'member', ?, ?)",
      args: [teamId, name, email, accountType],
    });
    return Number(r.lastInsertRowid);
  };
  const adminId = await mkMember("Test Admin", "admin@test.local", "admin");
  const assigneeId = await mkMember("Test Assignee", "assignee@test.local", "student");
  const outsiderId = await mkMember("Test Outsider", "outsider@test.local", "student");
  for (const [sess, mid] of [[SESS.admin, adminId], [SESS.assignee, assigneeId], [SESS.outsider, outsiderId]] as const) {
    await db.execute({
      sql: "INSERT INTO sessions (id, member_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)",
      args: [sessionDbId(sess), mid, now, far, now],
    });
  }
  // Task fixtures (ids captured for the tests below).
  const mkTask = async (title: string, assignedTo: number | null, status = "in-progress") => {
    const r = await db.execute({
      sql: "INSERT INTO tasks (team_id, assigned_to, title, status) VALUES (?, ?, ?, ?)",
      args: [teamId, assignedTo, title, status],
    });
    return Number(r.lastInsertRowid);
  };
  (globalThis as any).__taskIds = {
    assigned: await mkTask("Assigned task", assigneeId),
    unassigned: await mkTask("Unassigned task", null),
    proofOnly: await mkTask("Proof gate task", assigneeId),
    imageOnly: await mkTask("Image proof task", assigneeId),
    patchBypass: await mkTask("Patch bypass task", assigneeId),
  };
  (globalThis as any).__memberIds = { adminId, assigneeId, outsiderId };
  (globalThis as any).__db = db;

  // Snapshot the uploads dir so we can clean up proof images after.
  const upDir = join(REPO, "uploads");
  if (existsSync(upDir)) for (const f of readdirSync(upDir)) uploadedBefore.add(f);
}, 120000);

afterAll(async () => {
  try {
    const upDir = join(REPO, "uploads");
    if (existsSync(upDir)) {
      for (const f of readdirSync(upDir)) {
        // Only this test's server wrote uploads during the run; anything new
        // is a proof image from the image-only test.
        if (!uploadedBefore.has(f)) {
          try { unlinkSync(join(upDir, f)); } catch {}
        }
      }
    }
  } catch {}
  if (proc) { proc.kill("SIGKILL"); proc = null; }
  await new Promise((r) => setTimeout(r, 500));
  try { (globalThis as any).__db?.close(); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

const ids = () => (globalThis as any).__taskIds;
const mids = () => (globalThis as any).__memberIds;

describe("task completion proof", () => {
  it("rejects PATCH directly to done (proof bypass)", async () => {
    const { status, body } = await api(`/api/tasks/${ids().patchBypass}`, SESS.assignee, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(status).toBe(400);
    expect(String(body?.error || "")).toMatch(/proof/i);
    const db = (globalThis as any).__db;
    const row: any = await db.execute({ sql: "SELECT status FROM tasks WHERE id = ?", args: [ids().patchBypass] });
    expect(row.rows[0].status).not.toBe("done");
  });

  it("rejects /complete with no proof", async () => {
    const { status, body } = await api(`/api/tasks/${ids().proofOnly}/complete`, SESS.assignee, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "   " }),
    });
    expect(status).toBe(400);
    expect(String(body?.error || "")).toMatch(/proof/i);
  });

  it("completes an assigned task with notes only", async () => {
    const { status, body } = await api(`/api/tasks/${ids().assigned}/complete`, SESS.assignee, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Wired the shooter and tested it." }),
    });
    expect(status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.task?.status).toBe("done");
    expect(body?.task?.completion_notes).toBe("Wired the shooter and tested it.");
    expect(body?.task?.completed_by).toBe(mids().assigneeId);
  });

  it("auto-assigns an unassigned task to the completer", async () => {
    const { status, body } = await api(`/api/tasks/${ids().unassigned}/complete`, SESS.outsider, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Claiming and finishing this." }),
    });
    expect(status).toBe(200);
    expect(body?.task?.status).toBe("done");
    expect(body?.task?.assigned_to).toBe(mids().outsiderId);
    expect(body?.task?.completed_by).toBe(mids().outsiderId);
  });

  it("rejects completion by a non-assignee without manage_tasks", async () => {
    const db = (globalThis as any).__db;
    const r = await db.execute({
      sql: "INSERT INTO tasks (team_id, assigned_to, title, status) VALUES ((SELECT team_id FROM members WHERE id = ?), ?, 'Guarded task', 'in-progress')",
      args: [mids().assigneeId, mids().assigneeId],
    });
    const taskId = Number(r.lastInsertRowid);
    const { status } = await api(`/api/tasks/${taskId}/complete`, SESS.outsider, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Trying to steal this." }),
    });
    expect(status).toBe(403);
  });

  it("accepts image-only proof", async () => {
    // Build the multipart body by hand: jsdom's FormData/Blob do not
    // interop with undici fetch, so a manual boundary is the robust path.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const boundary = "----cp-test-boundary-1234";
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="test-proof-pixel.png"\r\nContent-Type: image/png\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const bodyBuf = Buffer.concat([head, png, tail]);
    const headers = new Headers();
    withSession(headers, SESS.assignee);
    headers.set("Content-Type", `multipart/form-data; boundary=${boundary}`);
    const res = await fetch(`${base}/api/tasks/${ids().imageOnly}/complete`, {
      method: "POST",
      headers,
      body: bodyBuf,
    });
    const status = res.status;
    const body: any = await res.json().catch(() => null);
    expect(status).toBe(200);
    expect(body?.task?.status).toBe("done");
    const images = JSON.parse(body?.task?.completion_images || "[]");
    expect(images.length).toBeGreaterThan(0);
    expect(String(images[0])).toMatch(/^\/api\/files\//);
  });
});

describe("proof verification", () => {
  const mkVerifyTask = async (title: string, proofRequirement: string | null, assignedTo?: number) => {
    const db = (globalThis as any).__db;
    const teamRow: any = await db.execute({ sql: "SELECT team_id FROM members WHERE id = ?", args: [mids().assigneeId] });
    const r = await db.execute({
      sql: "INSERT INTO tasks (team_id, assigned_to, title, status, proof_requirement) VALUES (?, ?, ?, 'in-progress', ?)",
      args: [teamRow.rows[0].team_id, assignedTo ?? mids().assigneeId, title, proofRequirement],
    });
    return Number(r.lastInsertRowid);
  };
  const completeJson = (taskId: number, sess: string, body: any) =>
    api(`/api/tasks/${taskId}/complete`, sess, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("verify-proof passes without AI when proof is 'none'", async () => {
    const taskId = await mkVerifyTask("No proof task", "none");
    const { status, body } = await api(`/api/tasks/${taskId}/verify-proof`, SESS.assignee, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "", link: "", imageCount: 0 }),
    });
    expect(status).toBe(200);
    expect(body?.verdict).toBe("pass");
    expect(body?.required).toBe("none");
  });

  it("verify-proof signals AI-unavailable (client fails open to review)", async () => {
    const taskId = await mkVerifyTask("AI check task", "auto");
    const { status, body } = await api(`/api/tasks/${taskId}/verify-proof`, SESS.assignee, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Did the thing.", link: "", imageCount: 0 }),
    });
    expect(status).toBe(503);
    expect(body?.aiUnavailable).toBe(true);
  });

  it("verify-proof rejects outsiders", async () => {
    const taskId = await mkVerifyTask("Guarded verify task", "auto");
    const { status } = await api(`/api/tasks/${taskId}/verify-proof`, SESS.outsider, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "x", link: "", imageCount: 0 }),
    });
    expect(status).toBe(403);
  });

  it("complete stores the link and auto-approves an AI-passed note", async () => {
    const taskId = await mkVerifyTask("Note proof task", "auto");
    const { status, body } = await completeJson(taskId, SESS.assignee, {
      notes: "Mounted both hooks and tested a full climb.",
      link: "",
      verified: "pass",
      required: "note",
      aiNote: "Specific build detail.",
    });
    expect(status).toBe(200);
    expect(body?.task?.status).toBe("done");
    expect(body?.task?.completion_review).toBe("approved");
    expect(body?.task?.completion_ai_note).toBe("Specific build detail.");
  });

  it("complete stores a link and routes code tasks to review even on AI pass", async () => {
    const taskId = await mkVerifyTask("Auto path code", "link");
    const { status, body } = await completeJson(taskId, SESS.assignee, {
      notes: "Implemented pure pursuit; tuned lookahead.",
      link: "https://github.com/example/repo/pull/42",
      verified: "pass",
      required: "link",
      aiNote: "Link present with detail.",
    });
    expect(status).toBe(200);
    expect(body?.task?.completion_link).toBe("https://github.com/example/repo/pull/42");
    expect(body?.task?.completion_review).toBe("pending");
  });

  it("complete without a verify result defaults to pending review", async () => {
    const taskId = await mkVerifyTask("Unverified task", "auto");
    const { status, body } = await completeJson(taskId, SESS.assignee, { notes: "Did stuff." });
    expect(status).toBe(200);
    expect(body?.task?.completion_review).toBe("pending");
  });

  it("complete enforces an explicit photo requirement", async () => {
    const taskId = await mkVerifyTask("Photo proof task", "photo");
    const { status, body } = await completeJson(taskId, SESS.assignee, { notes: "Built it, trust me." });
    expect(status).toBe(400);
    expect(String(body?.error || "")).toMatch(/photo/i);
  });

  it("complete enforces an explicit link requirement (link or detailed note)", async () => {
    const taskId = await mkVerifyTask("Link proof task", "link");
    const thin = await completeJson(taskId, SESS.assignee, { notes: "n" });
    expect(thin.status).toBe(400);
    const detailed = await completeJson(taskId, SESS.assignee, {
      notes: "Wrote the autonomous routine in Main.java, tested on the practice field twice.",
    });
    expect(detailed.status).toBe(200);
    expect(detailed.body?.task?.completion_review).toBe("pending");
  });

  it("review approve keeps the task done; reject reopens it", async () => {
    const db = (globalThis as any).__db;
    const mkDonePending = async (title: string) => {
      const teamRow: any = await db.execute({ sql: "SELECT team_id FROM members WHERE id = ?", args: [mids().assigneeId] });
      const r = await db.execute({
        sql: "INSERT INTO tasks (team_id, assigned_to, title, status, completion_review, completed_by) VALUES (?, ?, ?, 'done', 'pending', ?)",
        args: [teamRow.rows[0].team_id, mids().assigneeId, title, mids().assigneeId],
      });
      return Number(r.lastInsertRowid);
    };
    const review = (taskId: number, sess: string, body: any) =>
      api(`/api/tasks/${taskId}/review`, sess, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const approveId = await mkDonePending("Review me approve");
    const ar = await review(approveId, SESS.admin, { decision: "approve" });
    expect(ar.status).toBe(200);
    expect(ar.body?.task?.status).toBe("done");
    expect(ar.body?.task?.completion_review).toBe("approved");

    const rejectId = await mkDonePending("Review me reject");
    const rr = await review(rejectId, SESS.admin, { decision: "reject", note: "Add a photo." });
    expect(rr.status).toBe(200);
    expect(rr.body?.task?.status).toBe("in-progress");
    expect(rr.body?.task?.completion_review).toBe("rejected");

    const denied = await review(approveId, SESS.assignee, { decision: "approve" });
    expect(denied.status).toBe(403);
  });

  it("create/update accept proof_requirement, invalid values fall back to auto", async () => {
    const created = await api("/api/tasks", SESS.admin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Proof setting task", proof_requirement: "photo" }),
    });
    expect(created.status).toBe(200);
    const bad = await api("/api/tasks", SESS.admin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bad proof setting task", proof_requirement: "banana" }),
    });
    expect(bad.status).toBe(200);
    const db = (globalThis as any).__db;
    const row: any = await db.execute({ sql: "SELECT proof_requirement FROM tasks WHERE id = ?", args: [bad.body?.id] });
    expect(row.rows[0].proof_requirement).toBe("auto");
    const patched = await api(`/api/tasks/${created.body?.id}`, SESS.admin, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof_requirement: "link" }),
    });
    expect(patched.status).toBe(200);
    const row2: any = await db.execute({ sql: "SELECT proof_requirement FROM tasks WHERE id = ?", args: [created.body?.id] });
    expect(row2.rows[0].proof_requirement).toBe("link");
  });
});
