// Stable references to app records ({type, id}), resolved for one member at
// the moment they're opened. Links never carry names or slugs, so renames
// don't break them, and every open re-checks access:
//   ok           the member can see it: label + where it opens
//   deleted      it's gone, and the member could see it before (notebook
//                trash, a removed teammate, a deleted scouting entry)
//   unavailable  missing, in a team they're not in, or hidden from them.
//                These read the same, so a link never confirms that
//                something hidden exists, or what it's called.
//   switch_team  it's in another team this person belongs to and can see
//                there (no label until they switch)
import type { NotebookStore } from "./notebook.js";
import { NotebookError } from "./notebook.js";

export const REF_TYPES = ["task", "event", "inventory", "page", "section", "member", "file", "cad_snapshot", "cad_doc", "cad_review", "cad_part", "scout"] as const;
export type RefType = typeof REF_TYPES[number];
export type RefResult =
  | { status: "ok"; type: RefType; id: number; label: string; href: string }
  | { status: "deleted"; type: RefType; id: number; label: string }
  | { status: "unavailable"; type: RefType; id: number }
  | { status: "switch_team"; type: RefType; id: number; teamId: number; teamName: string };

export type RefDeps = {
  get: (sql: string, ...args: any[]) => Promise<any>;
  notebook: NotebookStore;
  /** manage_members (or *) in that team. */
  isAdmin: (memberId: number, teamId: number) => Promise<boolean>;
};
type Member = { memberId: number; teamId: number };

export const isRefType = (v: unknown): v is RefType => typeof v === "string" && (REF_TYPES as readonly string[]).includes(v);
/** The one link format: team, type and id only. */
export const refPath = (teamId: number, type: RefType, id: number) => `/t/${teamId}/${type}/${id}`;

const CAD: Partial<Record<RefType, { table: string; label: string; path: string }>> = {
  cad_snapshot: { table: "cad_snapshots", label: "title", path: "/cad-snapshots" },
  cad_doc: { table: "cad_docs", label: "name", path: "/cad-docs" },
  cad_review: { table: "cad_reviews", label: "title", path: "/cad-reviews" },
  cad_part: { table: "cad_parts", label: "name", path: "/cad-parts" },
};

/** Resolve inside the member's own (active) team. */
async function resolveHere(deps: RefDeps, who: Member, type: RefType, id: number): Promise<RefResult> {
  const none: RefResult = { status: "unavailable", type, id };
  const row = (sql: string) => deps.get(sql, id, who.teamId);
  switch (type) {
    case "task": {
      const r = await row("SELECT id, title, COALESCE(is_board, 0) AS is_board FROM tasks WHERE id = ? AND team_id = ?");
      if (!r || (Number(r.is_board) && !await deps.isAdmin(who.memberId, who.teamId))) return none;
      return { status: "ok", type, id, label: String(r.title), href: `/tasks?task=${id}` };
    }
    case "event": {
      const r = await row("SELECT id, title FROM events WHERE id = ? AND team_id = ?");
      return r ? { status: "ok", type, id, label: String(r.title), href: `/calendar?event=${id}` } : none;
    }
    case "inventory": {
      const r = await row("SELECT id, name FROM inventory WHERE id = ? AND team_id = ?");
      return r ? { status: "ok", type, id, label: String(r.name), href: `/inventory?item=${id}` } : none;
    }
    case "page": case "section": {
      try {
        const t = await deps.notebook.linkTarget({ memberId: who.memberId, teamId: who.teamId, source: "human" }, type, id);
        if (t.deleted) return { status: "deleted", type, id, label: t.title };
        return { status: "ok", type, id, label: t.title, href: type === "page" ? `/notebook/p/${id}` : `/notebook?section=${id}` };
      } catch (e) { if (e instanceof NotebookError) return none; throw e; }
    }
    case "member": {
      const r = await row("SELECT id, name, COALESCE(is_active, 1) AS active FROM members WHERE id = ? AND team_id = ?");
      if (!r) return none;
      return Number(r.active) ? { status: "ok", type, id, label: String(r.name), href: `/teams?member=${id}` } : { status: "deleted", type, id, label: String(r.name) };
    }
    case "file": {
      // Notebook attachments open through their page (page-level access).
      const r = await row("SELECT id, filename, kind FROM stored_files WHERE id = ? AND team_id = ?");
      return r && r.kind !== "notebook" ? { status: "ok", type, id, label: String(r.filename || "File"), href: `/api/files/${id}` } : none;
    }
    case "scout": {
      const r = await row("SELECT id, match_label, scouted_team, event_code, COALESCE(deleted, 0) AS deleted FROM scouting_entries WHERE id = ? AND team_id = ?");
      if (!r) return none;
      const label = [r.match_label, r.scouted_team && `team ${r.scouted_team}`, r.event_code].filter(Boolean).join(" · ") || "Scouting entry";
      return Number(r.deleted) ? { status: "deleted", type, id, label } : { status: "ok", type, id, label, href: `/stats?mode=scout&entry=${id}` };
    }
    default: {
      const cad = CAD[type];
      if (!cad) return none;
      const r = await row(`SELECT id, ${cad.label} AS label FROM ${cad.table} WHERE id = ? AND team_id = ?`);
      return r ? { status: "ok", type, id, label: String(r.label || "CAD item"), href: `${cad.path}?id=${id}` } : none;
    }
  }
}

/**
 * Resolve a reference for a signed-in person. `linkTeam` is the team in the
 * link; the record is only ever checked as that person's member row there.
 */
export async function resolveRef(deps: RefDeps, who: Member & { email?: string | null }, type: RefType, id: number, linkTeam?: number): Promise<RefResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return { status: "unavailable", type, id };
  if (!linkTeam || linkTeam === who.teamId) return resolveHere(deps, who, type, id);
  if (!who.email) return { status: "unavailable", type, id };
  const there = await deps.get("SELECT m.id, t.name AS team_name FROM members m JOIN teams t ON t.id = m.team_id WHERE m.email = ? AND m.team_id = ? AND COALESCE(m.is_active, 1) = 1", who.email, linkTeam);
  if (!there) return { status: "unavailable", type, id };
  const r = await resolveHere(deps, { memberId: Number(there.id), teamId: linkTeam }, type, id);
  return r.status === "unavailable" ? r : { status: "switch_team", type, id, teamId: linkTeam, teamName: String(there.team_name || "another team") };
}
