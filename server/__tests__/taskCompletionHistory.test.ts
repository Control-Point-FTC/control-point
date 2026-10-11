/**
 * Every completion of a task is kept with its proof: finishing again after a
 * send-back no longer overwrites the earlier note and photos, each review
 * lands on the completion it judged, and managers can open the photos.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { withSession } from "./helpers/session";

vi.setConfig({ testTimeout: 30_000 });

let t: TestServer;
let team = 0;
let admin = "";
let adminId = 0;
let member = "";
let memberId = 0;
beforeAll(async () => {
  t = await startTestServer("cp-taskhist-");
  team = await seedTeam(t.db, "Robo");
  adminId = await seedMember(t.db, team, "Ada", "ada@hist.test", "admin");
  admin = await t.session(adminId);
  memberId = await seedMember(t.db, team, "Arnav", "arnav@hist.test");
  member = await t.session(memberId);
}, 120_000);
afterAll(async () => { await t?.stop(); });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** POST /complete as multipart with a note and one photo. */
async function completeWithPhoto(id: number, notes: string, session: string) {
  const boundary = "----cp-hist-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\n${notes}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="proof.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const headers = new Headers({ "Content-Type": `multipart/form-data; boundary=${boundary}`, "X-CP-Client": "1" });
  withSession(headers, session);
  const res = await fetch(`${t.base}/api/tasks/${id}/complete`, { method: "POST", headers, body });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const history = async (id: number) => {
  const row = (await t.db.execute({ sql: "SELECT completion_history FROM tasks WHERE id = ?", args: [id] })).rows[0] as any;
  return JSON.parse(row.completion_history || "[]");
};

describe("completion history", () => {
  it("keeps every finish, its photos and the review of each", async () => {
    const created = await t.post("/api/tasks", { title: "Mount the camera", assignee_ids: [memberId] }, admin);
    const id = created.body.id ?? created.body.task?.id;

    const first = await completeWithPhoto(id, "Mounted on the left rail", member);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    let h = await history(id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ by: memberId, notes: "Mounted on the left rail", review: null });
    expect(h[0].images).toHaveLength(1);
    expect(String(h[0].images[0])).toMatch(/^\/api\/files\/\d+$/);

    // The admin can open the photo.
    const photo = await t.api(h[0].images[0], { session: admin });
    expect(photo.status).toBe(200);

    expect((await t.post(`/api/tasks/${id}/review`, { action: "send_back", note: "Show it from the front" }, admin)).status).toBe(200);
    h = await history(id);
    expect(h[0].review).toMatchObject({ status: "changes_requested", by: adminId, note: "Show it from the front" });

    // Finishing again adds an entry; the first note and photo are still there.
    expect((await t.post(`/api/tasks/${id}/complete`, { notes: "Front view attached in the log" }, member)).status).toBe(200);
    h = await history(id);
    expect(h).toHaveLength(2);
    expect(h[0].notes).toBe("Mounted on the left rail");
    expect(h[0].images).toHaveLength(1);
    expect(h[1]).toMatchObject({ by: memberId, notes: "Front view attached in the log", images: [], review: null });

    expect((await t.post(`/api/tasks/${id}/review`, { action: "approve" }, admin)).status).toBe(200);
    h = await history(id);
    expect(h[1].review).toMatchObject({ status: "approved", by: adminId });
    expect(h[0].review.status).toBe("changes_requested");

    // The task list carries it to the client.
    const list = await t.api("/api/tasks", { session: admin });
    const row = (list.body as any[]).find((x) => x.id === id);
    expect(JSON.parse(row.completion_history)).toHaveLength(2);
  });

  it("a manager's own finish is recorded as approved", async () => {
    const created = await t.post("/api/tasks", { title: "Order wheels" }, admin);
    const id = created.body.id ?? created.body.task?.id;
    expect((await t.post(`/api/tasks/${id}/complete`, { notes: "Ordered" }, admin)).status).toBe(200);
    const h = await history(id);
    expect(h).toHaveLength(1);
    expect(h[0].review).toMatchObject({ status: "approved", by: adminId });
  });

  it("the migration backfills tasks finished before history existed", async () => {
    const ins = await t.db.execute({
      sql: "INSERT INTO tasks (team_id, title, status, completed_at, completed_by, completion_notes, completion_images, review_status, reviewed_by, reviewed_at) VALUES (?, 'Old task', 'done', '2026-09-01T10:00:00Z', ?, 'Did it', '[\"/api/files/1\"]', 'approved', ?, '2026-09-02T10:00:00Z')",
      args: [team, memberId, adminId],
    });
    const id = Number(ins.lastInsertRowid);
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations", "versions", "124-task-completion-history.sql"), "utf8");
    await t.db.execute(sql.slice(sql.indexOf("UPDATE tasks")));
    const h = await history(id);
    expect(h).toEqual([{
      by: memberId, at: "2026-09-01T10:00:00Z", notes: "Did it", images: ["/api/files/1"],
      review: { status: "approved", by: adminId, at: "2026-09-02T10:00:00Z", note: null },
    }]);
    // A task with no proof gets no history.
    const blank = Number((await t.db.execute({ sql: "INSERT INTO tasks (team_id, title) VALUES (?, 'Blank')", args: [team] })).lastInsertRowid);
    await t.db.execute(sql.slice(sql.indexOf("UPDATE tasks")));
    expect((await t.db.execute({ sql: "SELECT completion_history FROM tasks WHERE id = ?", args: [blank] })).rows[0]).toMatchObject({ completion_history: null });
  });
});
