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

/**
 * Plan replacing one of a task's link lists with `ids`. `rows` are all the
 * team's links; `canLink(other)` says the other task exists in the team and
 * the viewer may see it. Links to tasks the viewer can't see are kept as they
 * are. Returns the rows to delete and insert, or an error (unknown task, a
 * dependency loop) — nothing is planned when there is an error.
 */
export function planLinkReplace(
  rows: { from_id: number; to_id: number; kind: string }[],
  id: number,
  kind: "blocked_by" | "blocks" | "related",
  ids: number[],
  canLink: (other: number) => boolean,
): { error: string } | { remove: { from_id: number; to_id: number; kind: string }[]; add: { from_id: number; to_id: number; kind: "blocks" | "relates" }[] } {
  for (const o of ids) if (!canLink(o)) return { error: `Task #${o} isn't one of this team's tasks` };
  const mine = rows.filter((r) => { const o = otherOf(r, id, kind); return o !== null && canLink(o); });
  const keepOthers = new Set(mine.map((r) => otherOf(r, id, kind)!));
  const remove = mine.filter((r) => !ids.includes(otherOf(r, id, kind)!));
  const add = ids.filter((o) => !keepOthers.has(o)).map((o) => linkRow(id, o, kind));
  if (kind !== "related") {
    // The blocks graph after the change must have no loop.
    const removed = new Set(remove.map((r) => `${r.from_id}>${r.to_id}`));
    const edges = rows.filter((r) => r.kind === "blocks" && !removed.has(`${r.from_id}>${r.to_id}`)).map((r) => [Number(r.from_id), Number(r.to_id)] as const);
    const next = new Map<number, number[]>();
    const push = (a: number, b: number) => (next.get(a) ?? next.set(a, []).get(a)!).push(b);
    for (const [a, b] of edges) push(a, b);
    for (const r of add) {
      // Adding a -> b loops when b already reaches a.
      const seen = new Set<number>();
      const stack = [r.to_id];
      while (stack.length) {
        const n = stack.pop()!;
        if (n === r.from_id) return { error: `That would make a loop: task #${r.to_id} already leads to task #${r.from_id}` };
        if (seen.has(n)) continue;
        seen.add(n);
        for (const m of next.get(n) ?? []) stack.push(m);
      }
      push(r.from_id, r.to_id);
    }
  }
  return { remove, add };
}
