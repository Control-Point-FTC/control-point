// Sticky Notes: a member's own scratch notes in a workspace, independent of
// any notebook page. Private to their author (not team content, not shared,
// not visible to Bruno). Bounded so a runaway client can't bloat the database.
import { dbClient } from "../db.js";
import type { Client } from "@libsql/client";

export const STICKY_COLORS = ["volt", "graphite", "sky", "mint", "rose", "sand"] as const;
export const MAX_STICKY_NOTES = 50, MAX_STICKY_TEXT = 10_000;
type Row = Record<string, any>;
export class StickyError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const int = (v: unknown, min: number, max: number, name: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new StickyError(`Invalid ${name}`);
  return n;
};
function shape(row: Row) {
  return { id: Number(row.id), body: String(row.body), color: String(row.color), x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height), open: !!row.open, updatedAt: String(row.updated_at) };
}
/** Only the fields a client may change, validated. */
export function stickyPatch(body: Row): Row {
  const out: Row = {};
  if (body.body !== undefined) { if (typeof body.body !== "string") throw new StickyError("Note text must be text"); if (body.body.length > MAX_STICKY_TEXT) throw new StickyError(`Sticky notes hold up to ${MAX_STICKY_TEXT.toLocaleString()} characters`); out.body = body.body; }
  if (body.color !== undefined) { if (!STICKY_COLORS.includes(body.color)) throw new StickyError("Unknown note color"); out.color = body.color; }
  if (body.x !== undefined) out.x = int(body.x, 0, 20_000, "position");
  if (body.y !== undefined) out.y = int(body.y, 0, 20_000, "position");
  if (body.width !== undefined) out.width = int(body.width, 160, 900, "size");
  if (body.height !== undefined) out.height = int(body.height, 120, 900, "size");
  if (body.open !== undefined) { if (typeof body.open !== "boolean") throw new StickyError("Invalid open state"); out.open = body.open ? 1 : 0; }
  return out;
}

export class StickyNotes {
  constructor(private readonly db: Client = dbClient) {}
  private async all(sql: string, ...args: any[]) { return (await this.db.execute({ sql, args })).rows as Row[]; }
  async list(teamId: number, memberId: number) {
    return (await this.all("SELECT * FROM sticky_notes WHERE team_id=? AND member_id=? ORDER BY updated_at DESC, id DESC", teamId, memberId)).map(shape);
  }
  async create(teamId: number, memberId: number, body: Row) {
    const patch = stickyPatch(body);
    const now = new Date().toISOString();
    // One statement checks the limit and inserts, so simultaneous requests
    // can't both slip under it.
    const r = await this.db.execute({ sql: `INSERT INTO sticky_notes(team_id,member_id,body,color,x,y,width,height,open,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM sticky_notes WHERE team_id=? AND member_id=?) < ?`,
      args: [teamId, memberId, patch.body ?? "", patch.color ?? "volt", patch.x ?? 80, patch.y ?? 120, patch.width ?? 260, patch.height ?? 220, now, now, teamId, memberId, MAX_STICKY_NOTES] });
    if (!r.rowsAffected) throw new StickyError(`You can keep up to ${MAX_STICKY_NOTES} sticky notes. Delete one to add another.`, 409);
    return shape((await this.all("SELECT * FROM sticky_notes WHERE id=?", Number(r.lastInsertRowid)))[0]);
  }
  async update(teamId: number, memberId: number, id: number, body: Row) {
    const patch = stickyPatch(body);
    const keys = Object.keys(patch);
    if (keys.length) await this.db.execute({ sql: `UPDATE sticky_notes SET ${keys.map(k => `${k}=?`).join(",")},updated_at=? WHERE id=? AND team_id=? AND member_id=?`, args: [...keys.map(k => patch[k]), new Date().toISOString(), id, teamId, memberId] });
    const row = (await this.all("SELECT * FROM sticky_notes WHERE id=? AND team_id=? AND member_id=?", id, teamId, memberId))[0];
    if (!row) throw new StickyError("Sticky note not found", 404);
    return shape(row);
  }
  async remove(teamId: number, memberId: number, id: number) {
    const r = await this.db.execute({ sql: "DELETE FROM sticky_notes WHERE id=? AND team_id=? AND member_id=?", args: [id, teamId, memberId] });
    if (!r.rowsAffected) throw new StickyError("Sticky note not found", 404);
    return { ok: true };
  }
}

type Deps = { requireAuth: (req: any, res: any) => Promise<{ memberId: number; teamId: number | null } | null> };
export function registerStickyNoteRoutes(app: any, deps: Deps, notes = new StickyNotes()) {
  const handle = (fn: (auth: { memberId: number; teamId: number }, req: any) => Promise<unknown>) => async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = await deps.requireAuth(req, res);
    if (!auth) return;
    if (!auth.teamId) return res.status(403).json({ error: "Select an active team" });
    try { res.json(await fn({ memberId: auth.memberId, teamId: auth.teamId }, req)); }
    catch (e) {
      if (e instanceof StickyError) return res.status(e.status).json({ error: e.message });
      console.error("sticky notes request failed", e);
      res.status(500).json({ error: "Sticky notes request failed" });
    }
  };
  const noteId = (v: unknown) => { const n = Number(v); if (!Number.isSafeInteger(n) || n < 1) throw new StickyError("Invalid note"); return n; };
  app.get("/api/sticky-notes", handle(a => notes.list(a.teamId, a.memberId)));
  app.post("/api/sticky-notes", handle((a, req) => notes.create(a.teamId, a.memberId, req.body ?? {})));
  app.patch("/api/sticky-notes/:id", handle((a, req) => notes.update(a.teamId, a.memberId, noteId(req.params.id), req.body ?? {})));
  app.delete("/api/sticky-notes/:id", handle((a, req) => notes.remove(a.teamId, a.memberId, noteId(req.params.id))));
}
