/**
 * The one-off cleanup deletes files left behind by records deleted before
 * deletes took their files along — and nothing else: files still used,
 * recent uploads, avatars and live notebook files stay. It runs once.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 60_000 });

let t: TestServer;
let team = 0;
let member = 0;
const ids: Record<string, number> = {};

const q = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];
const OLD = "datetime('now', '-3 days')";
const file = async (kind: string, teamId: number | null, old = true) => Number((await t.db.execute({
  sql: `INSERT INTO stored_files (team_id, member_id, kind, filename, mime_type, size, data, created_at) VALUES (?, ?, ?, 'f', 'image/png', 1, x'00', ${old ? OLD : "datetime('now')"})`,
  args: [teamId, member, kind],
})).lastInsertRowid);

beforeAll(async () => {
  t = await startTestServer("cp-orphans-", { ORPHAN_CLEANUP_DELAY_MS: "6000" });
  team = await seedTeam(t.db, "Robo");
  member = await seedMember(t.db, team, "Ada", "ada@orphans.test", "admin");
  const goneTeam = 9999;

  ids.goneWorkspaceCad = await file("cad", goneTeam);
  ids.goneWorkspaceNotebook = await file("notebook", goneTeam);
  ids.unusedProof = await file("proof", team);
  ids.usedProof = await file("proof", team);
  ids.historyProof = await file("proof", team);
  ids.recentProof = await file("proof", team, false);
  ids.unusedChat = await file("chat", team);
  ids.usedChat = await file("chat", team);
  ids.avatar = await file("avatar", null);
  ids.liveNotebook = await file("notebook", team);
  ids.liveCad = await file("cad", team);

  await t.db.execute({
    sql: "INSERT INTO tasks (team_id, title, status, completion_images, completion_history) VALUES (?, 'Arm', 'done', ?, ?)",
    args: [team, JSON.stringify([`/api/files/${ids.usedProof}`]), JSON.stringify([{ images: [`/api/files/${ids.historyProof}`] }])],
  });
  const msg = Number((await t.db.execute({
    sql: "INSERT INTO messages (team_id, sender_id, content, timestamp, file_path) VALUES (?, ?, 'pic', datetime('now'), ?)",
    args: [team, member, `/api/files/${ids.usedChat}`],
  })).lastInsertRowid);
  ids.keptImage = Number((await t.db.execute({ sql: `INSERT INTO message_images (message_id, mime_type, data, created_at) VALUES (?, 'image/png', x'00', ${OLD})`, args: [msg] })).lastInsertRowid);
  ids.goneImage = Number((await t.db.execute({ sql: `INSERT INTO message_images (message_id, mime_type, data, created_at) VALUES (424242, 'image/png', x'00', ${OLD})`, args: [] })).lastInsertRowid);

  // Wait for the job to record its run.
  for (let i = 0; i < 100; i++) {
    if ((await q("SELECT 1 FROM maintenance_runs WHERE name = 'orphan-files-2026-10'")).length) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}, 120_000);
afterAll(async () => { await t?.stop(); });

const exists = async (id: number) => (await q("SELECT id FROM stored_files WHERE id = ?", id)).length === 1;

describe("one-off orphan file cleanup", () => {
  it("records one run with what it deleted", async () => {
    const runs = await q("SELECT result FROM maintenance_runs WHERE name = 'orphan-files-2026-10'");
    expect(runs).toHaveLength(1);
    expect(JSON.parse(runs[0].result)).toEqual({ deletedWorkspace: 2, unusedProof: 1, unusedChat: 1, chatImages: 1 });
  });

  it("deletes files of deleted workspaces and unused photos, attachments and images", async () => {
    for (const k of ["goneWorkspaceCad", "goneWorkspaceNotebook", "unusedProof", "unusedChat"]) expect(await exists(ids[k]), k).toBe(false);
    expect(await q("SELECT id FROM message_images WHERE id = ?", ids.goneImage)).toHaveLength(0);
  });

  it("keeps files still in use, recent uploads, avatars and live workspaces' files", async () => {
    for (const k of ["usedProof", "historyProof", "recentProof", "usedChat", "avatar", "liveNotebook", "liveCad"]) expect(await exists(ids[k]), k).toBe(true);
    expect(await q("SELECT id FROM message_images WHERE id = ?", ids.keptImage)).toHaveLength(1);
  });
});
