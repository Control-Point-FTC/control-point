/**
 * Manual scouting API (audit H-4). Works with no FTC data at all.
 *
 *   GET  /api/scouting/entries?season=2025  → every entry (tombstones too)
 *   POST /api/scouting/sync { entries: [...] } → upserts, returns the list
 *
 * Any member of the workspace may scout. An existing entry may be changed
 * only by the member who made it or someone with manage_members. Conflicts
 * resolve last-write-wins on the entry's updatedAt.
 */
import { cleanScoutEntry, type ScoutEntry } from "../src/utils/scouting.js";

export interface ScoutAuth { memberId: number; teamId: number | null; teamless?: boolean }
export interface ScoutingDeps {
  dbAll(sql: string, ...params: any[]): Promise<any[]>;
  dbGet(sql: string, ...params: any[]): Promise<any>;
  dbRun(sql: string, ...params: any[]): Promise<any>;
  requireAuth(req: any, res: any): Promise<ScoutAuth | null>;
  hasPerm(auth: ScoutAuth, perm: string): Promise<boolean>;
  broadcastToTeam(teamId: number, msg: any): void;
}

export const MAX_SYNC_BATCH = 200;
export const MAX_ENTRIES_PER_SEASON = 20000;

function rowToEntry(r: any): ScoutEntry {
  let data: any = {};
  try { data = JSON.parse(String(r.data || "{}")); } catch { /* corrupt row: empty */ }
  return {
    uuid: r.uuid,
    season: Number(r.season),
    scoutedTeam: Number(r.scouted_team),
    eventCode: r.event_code || null,
    matchLabel: r.match_label || null,
    templateId: r.template_id,
    data,
    notes: r.notes || "",
    updatedAt: Number(r.updated_at),
    deleted: !!r.deleted,
    scoutName: r.scout_name || null,
    scoutMemberId: r.scout_member_id ?? null,
  };
}

export function registerScoutingRoutes(app: any, deps: ScoutingDeps) {
  const list = async (teamId: number, season: number) =>
    ((await deps.dbAll(
      `SELECT e.*, m.name AS scout_name FROM scouting_entries e LEFT JOIN members m ON m.id = e.scout_member_id
        WHERE e.team_id = ? AND e.season = ? ORDER BY e.updated_at DESC`,
      teamId, season
    )) as any[]).map(rowToEntry);

  const workspaceAuth = async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth) return null;
    if (auth.teamless || !auth.teamId) { res.status(400).json({ error: "Join a workspace first" }); return null; }
    return auth as ScoutAuth & { teamId: number };
  };

  app.get("/api/scouting/entries", async (req: any, res: any) => {
    const auth = await workspaceAuth(req, res);
    if (!auth) return;
    const season = parseInt(String(req.query.season || ""), 10);
    if (!Number.isInteger(season)) return res.status(400).json({ error: "Choose a season" });
    res.json({ entries: await list(auth.teamId, season) });
  });

  app.post("/api/scouting/sync", async (req: any, res: any) => {
    const auth = await workspaceAuth(req, res);
    if (!auth) return;
    const incoming = Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (!incoming) return res.status(400).json({ error: "Nothing to sync" });
    if (incoming.length > MAX_SYNC_BATCH) return res.status(400).json({ error: `Send at most ${MAX_SYNC_BATCH} entries at a time` });
    const canManage = await deps.hasPerm(auth, "manage_members");
    const results: { uuid: string; ok: boolean; error?: string }[] = [];
    const seasons = new Set<number>();
    // An existing entry: only its author (or an admin) may change it; last
    // write wins; its season never changes (it was counted there).
    const applyToExisting = async (existing: any, e: ScoutEntry) => {
      if (existing.scout_member_id !== auth.memberId && !canManage) {
        return { ok: false, error: "Only the scout who made this entry (or an admin) can change it" };
      }
      // An older edit arriving late is acknowledged but ignored.
      await deps.dbRun(
        `UPDATE scouting_entries SET scouted_team = ?, event_code = ?, match_label = ?, template_id = ?, data = ?, notes = ?,
           updated_at = ?, deleted = ? WHERE id = ? AND updated_at <= ?`,
        e.scoutedTeam, e.eventCode, e.matchLabel, e.templateId, JSON.stringify(e.data), e.notes,
        e.updatedAt, e.deleted ? 1 : 0, existing.id, e.updatedAt
      );
      return { ok: true };
    };
    const findExisting = (e: ScoutEntry) =>
      deps.dbGet("SELECT id, scout_member_id, season FROM scouting_entries WHERE team_id = ? AND uuid = ?", auth.teamId, e.uuid);

    for (const raw of incoming) {
      const c = cleanScoutEntry(raw);
      if ("error" in c) { results.push({ uuid: String(raw?.uuid || ""), ok: false, error: c.error }); continue; }
      const e = c.entry;
      let existing = await findExisting(e);
      let outcome: { ok: boolean; error?: string };
      if (existing) {
        outcome = await applyToExisting(existing, e);
      } else {
        // New: the season limit is checked in the same statement as the
        // insert, so simultaneous saves can't overshoot it.
        let inserted = 0;
        try {
          const r = await deps.dbRun(
            `INSERT INTO scouting_entries (team_id, uuid, season, scouted_team, event_code, match_label, template_id, data, notes, scout_member_id, updated_at, deleted)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE (SELECT COUNT(*) FROM scouting_entries WHERE team_id = ? AND season = ?) < ?`,
            auth.teamId, e.uuid, e.season, e.scoutedTeam, e.eventCode, e.matchLabel, e.templateId, JSON.stringify(e.data), e.notes,
            auth.memberId, e.updatedAt, e.deleted ? 1 : 0,
            auth.teamId, e.season, MAX_ENTRIES_PER_SEASON
          );
          inserted = Number(r?.changes ?? r?.rowsAffected ?? 0);
          outcome = inserted ? { ok: true } : { ok: false, error: "This workspace has reached the scouting limit for the season" };
        } catch (err: any) {
          // The same entry arrived at the same moment from elsewhere (another
          // tab, a retry): treat it as the update it is.
          if (!/UNIQUE|constraint/i.test(String(err?.message || err))) throw err;
          existing = await findExisting(e);
          outcome = existing ? await applyToExisting(existing, e) : { ok: false, error: "Could not save — try again" };
        }
      }
      if (outcome.ok) seasons.add(existing ? Number(existing.season) : e.season);
      results.push({ uuid: e.uuid, ...outcome });
    }
    if (seasons.size) deps.broadcastToTeam(auth.teamId, { type: "scouting_changed", seasons: [...seasons] });
    const season = parseInt(String(req.body?.season || ""), 10);
    res.json({ results, entries: Number.isInteger(season) ? await list(auth.teamId, season) : undefined });
  });
}
