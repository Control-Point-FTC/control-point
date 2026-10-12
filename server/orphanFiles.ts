// One-off cleanup of files left behind before deletes removed them (task
// proof photos, chat attachments, chat images and every file of a deleted
// workspace). Only files older than a day are considered, so an upload whose
// message or task row hasn't been written yet is never touched. Avatars, and
// notebook files of live workspaces (the notebook has its own trash and
// purge), are left alone.
import { fileIdFromUrl, taskProofFileIds } from "./fileCleanup.js";

type Db = { all: (sql: string, ...args: any[]) => Promise<any[]> };

export type OrphanFiles = {
  /** stored_files ids, by why they're orphaned */
  deletedWorkspace: number[];
  unusedProof: { id: number; teamId: number | null }[];
  unusedChat: { id: number; teamId: number | null }[];
  /** message_images ids whose message is gone */
  chatImages: number[];
};

const OLD_ENOUGH = "created_at < datetime('now', '-1 day')";

export async function findOrphanFiles(db: Db): Promise<OrphanFiles> {
  const ids = (rows: any[]) => rows.map((r) => Number(r.id));
  const entry = (r: any) => ({ id: Number(r.id), teamId: r.team_id == null ? null : Number(r.team_id) });

  const deletedWorkspace = ids(await db.all(
    `SELECT id FROM stored_files WHERE team_id IS NOT NULL AND ${OLD_ENOUGH}
       AND kind != 'avatar' AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = stored_files.team_id)`,
  ));
  const inGoneWorkspace = new Set(deletedWorkspace);

  // Every proof photo any task still uses (current photos and past finishes).
  const usedProof = new Set<number>();
  for (const t of await db.all("SELECT completion_images, completion_history FROM tasks WHERE completion_images IS NOT NULL OR completion_history IS NOT NULL")) {
    for (const id of taskProofFileIds(t)) usedProof.add(id);
  }
  const unusedProof = (await db.all(`SELECT id, team_id FROM stored_files WHERE kind = 'proof' AND ${OLD_ENOUGH}`))
    .map(entry).filter((f) => !usedProof.has(f.id) && !inGoneWorkspace.has(f.id));

  // Every chat attachment any message still uses (forwards included).
  const usedChat = new Set<number>();
  for (const m of await db.all("SELECT file_path FROM messages WHERE file_path IS NOT NULL")) {
    const id = fileIdFromUrl(m.file_path);
    if (id != null) usedChat.add(id);
  }
  const unusedChat = (await db.all(`SELECT id, team_id FROM stored_files WHERE kind = 'chat' AND ${OLD_ENOUGH}`))
    .map(entry).filter((f) => !usedChat.has(f.id) && !inGoneWorkspace.has(f.id));

  const chatImages = ids(await db.all(
    `SELECT id FROM message_images WHERE ${OLD_ENOUGH} AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = message_images.message_id)`,
  ));

  return { deletedWorkspace, unusedProof, unusedChat, chatImages };
}
