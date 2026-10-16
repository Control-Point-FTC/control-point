// A task's history: what changed, who changed it and when. Recorded by every
// write path (the task API, completion, review, links, Bruno's cards), shown
// on the task sheet's timeline next to the comments, and read by Bruno.
import { parseTagList } from "../src/types/taskTags.js";
export { describeActivity } from "../src/utils/taskActivityText.js";

export type DbRun = (sql: string, ...args: any[]) => Promise<any>;

export interface ActivityEntry { kind: string; detail?: Record<string, unknown> }

const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
const sameList = (a: unknown, b: unknown) => JSON.stringify(parseTagList(a).slice().sort()) === JSON.stringify(parseTagList(b).slice().sort());

/**
 * The activity entries for an edit: `before` is the stored task, `after` the
 * stored task after the write, `assignees` the people before and after.
 */
export function taskEditActivity(before: any, after: any, assignees?: { before: number[]; after: number[] }): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  if (!before || !after) return out;
  if (!same(before.status, after.status)) out.push({ kind: "status", detail: { from: before.status, to: after.status } });
  if (!same(before.title, after.title)) out.push({ kind: "renamed", detail: { from: before.title, to: after.title } });
  if (!same(before.description, after.description)) out.push({ kind: "description" });
  if (!same(before.due_date, after.due_date) || !same(before.due_time, after.due_time)) out.push({ kind: "due", detail: { from: before.due_date || null, to: after.due_date || null, time: after.due_time || null } });
  if (!same(before.start_date, after.start_date)) out.push({ kind: "start", detail: { from: before.start_date || null, to: after.start_date || null } });
  if (!same(before.priority, after.priority)) out.push({ kind: "priority", detail: { from: before.priority || null, to: after.priority || null } });
  if (!same(before.recurrence, after.recurrence)) out.push({ kind: "repeat", detail: { to: after.recurrence || null } });
  if (!same(before.completion_mode, after.completion_mode)) out.push({ kind: "completion_mode", detail: { to: after.completion_mode || null } });
  if (!sameList(before.subsystems, after.subsystems) || !sameList(before.awards, after.awards) || !sameList(before.labels, after.labels)) out.push({ kind: "tags" });
  if (!same(before.is_board, after.is_board)) out.push({ kind: "board", detail: { to: !!Number(after.is_board) } });
  if (assignees) {
    const added = assignees.after.filter((m) => !assignees.before.includes(m));
    const removed = assignees.before.filter((m) => !assignees.after.includes(m));
    if (added.length || removed.length) out.push({ kind: "assignees", detail: { added, removed } });
  }
  return out;
}

/** Record activity entries for a task (best effort: never fails the write it describes). */
export async function logTaskActivity(dbRun: DbRun, teamId: number | null, taskId: number, memberId: number | null, entries: ActivityEntry[], via?: "bruno"): Promise<void> {
  if (!teamId || !entries.length) return;
  const at = new Date().toISOString();
  for (const e of entries) {
    const detail = via ? { ...(e.detail || {}), via } : e.detail;
    try {
      await dbRun("INSERT INTO task_activity (team_id, task_id, member_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)", teamId, taskId, memberId, e.kind, detail ? JSON.stringify(detail) : null, at);
    } catch (err) { console.error("task activity not recorded:", err); }
  }
}

/** Members named in a comment: "@[Full Name]", or "@First" when exactly one member has that first name. */
export function mentionedMembers(body: string, roster: { id: number; name: string }[]): number[] {
  const out = new Set<number>();
  for (const m of body.matchAll(/@\[([^\]]{1,80})\]/g)) {
    const hit = roster.find((r) => r.name.toLowerCase() === m[1].trim().toLowerCase());
    if (hit) out.add(hit.id);
  }
  for (const m of body.matchAll(/(^|[\s(])@([A-Za-z][\w'-]{0,39})\b/g)) {
    const first = m[2].toLowerCase();
    const hits = roster.filter((r) => r.name.split(/\s+/)[0]?.toLowerCase() === first || r.name.toLowerCase() === first);
    if (hits.length === 1) out.add(hits[0].id);
  }
  return [...out];
}
