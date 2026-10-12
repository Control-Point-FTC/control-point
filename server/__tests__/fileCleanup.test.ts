/**
 * Files go with the records that used them: a deleted task takes its
 * completion photos, a deleted message its attachment and images, and a
 * deleted workspace every file uploaded in it. Files still used elsewhere,
 * other workspaces' files and avatars stay.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { fileIdFromUrl, taskProofFileIds } from "../fileCleanup";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

describe("file references", () => {
  it("reads /api/files ids only", () => {
    expect(fileIdFromUrl("/api/files/12")).toBe(12);
    expect(fileIdFromUrl("/uploads/a.png")).toBeNull();
    expect(fileIdFromUrl("/api/files/12/../13")).toBeNull();
    // Only the canonical form: reference checks compare URLs as text.
    expect(fileIdFromUrl("/api/files/007")).toBeNull();
    expect(fileIdFromUrl(" /api/files/7")).toBeNull();
    expect(fileIdFromUrl(null)).toBeNull();
  });

  it("collects a task's current and past proof photos", () => {
    expect(taskProofFileIds({
      completion_images: JSON.stringify(["/api/files/3", "/api/files/4"]),
      completion_history: JSON.stringify([{ images: ["/api/files/1"] }, { images: ["/api/files/3"] }, { notes: "no photos" }]),
    }).sort()).toEqual([1, 3, 4]);
    expect(taskProofFileIds({ completion_images: "not json", completion_history: null })).toEqual([]);
  });
});

describe("deleting records deletes their files", () => {
  let t: TestServer;
  let team = 0;
  let other = 0;
  let admin = "";
  let adminId = 0;
  beforeAll(async () => {
    t = await startTestServer("cp-files-");
    team = await seedTeam(t.db, "Robo");
    other = await seedTeam(t.db, "Other");
    adminId = await seedMember(t.db, team, "Ada", "ada@files.test", "admin");
    admin = await t.session(adminId);
  }, 120_000);
  afterAll(async () => { await t?.stop(); });

  const q = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
  const file = async (kind: string, teamId: number | null) => Number((await t.db.execute({
    sql: "INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data) VALUES (?, ?, ?, 'f.png', 'image/png', 1, x'00')",
    args: [teamId, adminId, kind],
  })).lastInsertRowid);
  const exists = async (id: number) => (await q("SELECT id FROM stored_files WHERE id = ?", id)).length === 1;
  const task = async (teamId: number, images: number[], history: number[][]) => Number((await t.db.execute({
    sql: "INSERT INTO tasks (team_id, title, status, completion_images, completion_history) VALUES (?, 'Wire the arm', 'done', ?, ?)",
    args: [teamId, JSON.stringify(images.map((i) => `/api/files/${i}`)), JSON.stringify(history.map((h) => ({ images: h.map((i) => `/api/files/${i}`) })))],
  })).lastInsertRowid);
  const message = async (teamId: number, fileId: number | null) => Number((await t.db.execute({
    sql: "INSERT INTO messages (team_id, sender_id, content, timestamp, file_path) VALUES (?, ?, 'see photo', datetime('now'), ?)",
    args: [teamId, adminId, fileId == null ? null : `/api/files/${fileId}`],
  })).lastInsertRowid);
  const image = async (messageId: number) => Number((await t.db.execute({
    sql: "INSERT INTO message_images (message_id, mime_type, data) VALUES (?, 'image/png', x'00')", args: [messageId],
  })).lastInsertRowid);

  it("deleting a task deletes its proof photos, keeping ones another task still uses", async () => {
    const current = await file("proof", team);
    const past = await file("proof", team);
    const shared = await file("proof", team);
    const foreign = await file("proof", other);
    const id = await task(team, [current, shared], [[past], [current, shared, foreign]]);
    await task(team, [], [[shared]]);
    const r = await t.api(`/api/tasks/${id}`, { method: "DELETE", session: admin });
    expect(r.status).toBe(200);
    expect(await exists(current)).toBe(false);
    expect(await exists(past)).toBe(false);
    expect(await exists(shared)).toBe(true);
    expect(await exists(foreign)).toBe(true);
  });

  it("deleting a message deletes its attachment and images", async () => {
    const attachment = await file("chat", team);
    const msg = await message(team, attachment);
    const img = await image(msg);
    const r = await t.api(`/api/messages/${msg}`, { method: "DELETE", session: admin });
    expect(r.status).toBe(200);
    expect(await exists(attachment)).toBe(false);
    expect(await q("SELECT id FROM message_images WHERE id = ?", img)).toHaveLength(0);
  });

  it("deleting a workspace deletes every file uploaded in it", async () => {
    const doomed = await seedTeam(t.db, "Doomed");
    const ownerId = await seedMember(t.db, doomed, "Bo", "bo@files.test", "admin");
    const owner = await t.session(ownerId);
    const kinds = ["chat", "proof", "cad", "emoji", "notebook", "feedback"];
    const ids = await Promise.all(kinds.map((k) => file(k, doomed)));
    const msg = await message(doomed, ids[0]);
    const img = await image(msg);
    const avatar = await file("avatar", null);
    const elsewhere = await file("chat", other);
    const r = await t.api(`/api/teams/${doomed}`, { method: "DELETE", session: owner });
    expect(r.status).toBe(200);
    for (const id of ids) expect(await exists(id)).toBe(false);
    expect(await q("SELECT id FROM message_images WHERE id = ?", img)).toHaveLength(0);
    expect(await exists(avatar)).toBe(true);
    expect(await exists(elsewhere)).toBe(true);
  });
});
