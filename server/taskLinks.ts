// Links between tasks: one task blocks another, or two tasks are related.
// "Blocked" is never stored: a task is blocked while any task that blocks it
// is still open, so finishing (or cancelling) the blocker frees it at once.
// Used by the task API, Bruno's task-update cards, lookups and facts.
export { cleanTaskIds, LINK_KINDS, MAX_LINKS_PER_TASK, type LinkKind } from "../src/types/taskLinks.js";

export type DbAll = (sql: string, ...args: any[]) => Promise<any[]>;

export interface TaskLinkLists {
  /** Tasks that block this one (open or not; the client decides "blocked"). */
  blocked_by: number[];
  /** Tasks this one blocks. */
  blocks: number[];
  related: number[];
}

const empty = (): TaskLinkLists => ({ blocked_by: [], blocks: [], related: [] });

/**
 * Link lists for a team's tasks, keeping only links between tasks the viewer
 * can see (`visible`): a hidden board task never shows up as a blocker.
 */
export async function loadTaskLinks(dbAll: DbAll, teamId: number, visible: Set<number>): Promise<Map<number, TaskLinkLists>> {
  const out = new Map<number, TaskLinkLists>();
  const get = (id: number) => { let l = out.get(id); if (!l) { l = empty(); out.set(id, l); } return l; };
  const rows = await dbAll("SELECT from_id, to_id, kind FROM task_links WHERE team_id = ? ORDER BY from_id, to_id", teamId);
  for (const r of rows) {
    const a = Number(r.from_id), b = Number(r.to_id);
    if (!visible.has(a) || !visible.has(b)) continue;
    if (r.kind === "blocks") { get(b).blocked_by.push(a); get(a).blocks.push(b); }
    else { get(a).related.push(b); get(b).related.push(a); }
  }
  return out;
}

/** Attach the link lists to task rows (every row gets all three, maybe empty). */
export function attachLinks<T extends { id: number }>(tasks: T[], links: Map<number, TaskLinkLists>): (T & TaskLinkLists)[] {
  return tasks.map((t) => ({ ...t, ...(links.get(Number(t.id)) ?? empty()) }));
}

/** Normalized row for a link of `kind` between `id` and `other` from `id`'s point of view. */
export function linkRow(id: number, other: number, kind: "blocked_by" | "blocks" | "related"): { from_id: number; to_id: number; kind: "blocks" | "relates" } {
  if (kind === "blocked_by") return { from_id: other, to_id: id, kind: "blocks" };
  if (kind === "blocks") return { from_id: id, to_id: other, kind: "blocks" };
  return { from_id: Math.min(id, other), to_id: Math.max(id, other), kind: "relates" };
}

/** The other task of a link row, seen from `id` for `kind` (or null when the row isn't that kind for it). */
function otherOf(row: { from_id: number; to_id: number; kind: string }, id: number, kind: "blocked_by" | "blocks" | "related"): number | null {
  if (kind === "blocked_by") return row.kind === "blocks" && row.to_id === id ? row.from_id : null;
  if (kind === "blocks") return row.kind === "blocks" && row.from_id === id ? row.to_id : null;
  if (row.kind !== "relates") return null;
  return row.from_id === id ? row.to_id : row.to_id === id ? row.from_id : null;
}

type Row = { from_id: number; to_id: number; kind: string };
export type LinkChange = { id: number; kind: "blocked_by" | "blocks" | "related"; ids: number[] };

/**
 * Plan a set of link-list replacements (one card or one click) against all
 * of the team's links, applied in order to a working copy, then checked as a
 * whole: the final "blocks" graph has no loop, and no task ends up with more
 * than MAX_LINKS_PER_TASK links of a kind (hidden ones included). `canLink`
 * says a task exists in the team and the viewer may see it; links to tasks
 * the viewer can't see are kept as they are. Nothing is planned on an error.
 */
export function planLinkChanges(rows: Row[], changes: LinkChange[], canLink: (other: number) => boolean, max = 20): { error: string } | { remove: Row[]; add: Row[] } {
  const key = (r: Row) => `${r.from_id}>${r.to_id}>${r.kind}`;
  const start = new Map(rows.map((r) => [key(r), r]));
  const work = new Map(start);
  const touched = new Set<number>();
  for (const c of changes) {
    if (!canLink(c.id)) return { error: `Task #${c.id} isn't one of this team's tasks` };
    for (const o of c.ids) if (!canLink(o)) return { error: `Task #${o} isn't one of this team's tasks` };
    touched.add(c.id);
    for (const r of [...work.values()]) {
      const o = otherOf(r, c.id, c.kind);
      if (o !== null && canLink(o) && !c.ids.includes(o)) work.delete(key(r));
    }
    for (const o of c.ids) {
      const r = linkRow(c.id, o, c.kind);
      work.set(key(r), r);
      touched.add(o);
    }
  }
  // No loop in the final blocks graph.
  const next = new Map<number, number[]>();
  for (const r of work.values()) if (r.kind === "blocks") (next.get(r.from_id) ?? next.set(r.from_id, []).get(r.from_id)!).push(r.to_id);
  const state = new Map<number, 1 | 2>();
  const visit = (n: number, path: number[]): number[] | null => {
    if (state.get(n) === 2) return null;
    if (state.get(n) === 1) return [...path, n];
    state.set(n, 1);
    for (const m of next.get(n) ?? []) { const loop = visit(m, [...path, n]); if (loop) return loop; }
    state.set(n, 2);
    return null;
  };
  for (const n of next.keys()) {
    const loop = visit(n, []);
    if (loop) {
      const at = loop.indexOf(loop[loop.length - 1]);
      return { error: `That would make a loop: ${loop.slice(at).map((x) => `#${x}`).join(" → ")}` };
    }
  }
  // At most `max` links of each kind at both ends of every touched task.
  for (const id of touched) {
    let blockedBy = 0, blocks = 0, related = 0;
    for (const r of work.values()) {
      if (r.kind === "blocks") { if (r.to_id === id) blockedBy++; if (r.from_id === id) blocks++; }
      else if (r.from_id === id || r.to_id === id) related++;
    }
    if (blockedBy > max || blocks > max || related > max) return { error: `Task #${id} would have more than ${max} links of one kind` };
  }
  return {
    remove: [...start.values()].filter((r) => !work.has(key(r))),
    add: [...work.values()].filter((r) => !start.has(key(r))),
  };
}
