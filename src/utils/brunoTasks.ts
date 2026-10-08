// Bruno task proposals -> real task fields (V3.5 phase 4).
//
// "Create a task to test autonomous paths, high priority, assign to Arnav,
// due next Thursday at 4:30pm" must save with the priority, assignee, date
// AND time in their own fields, never folded into the description. The model
// is asked for those fields; whatever it leaves out (or writes into the title
// or description instead) is recovered by the deterministic quick-add reader,
// and the phrase is taken out of the text. Pure: shared by the server (apply)
// and the browser (the confirm card shows exactly what will be saved).

import { parseQuickAdd, readRecurrence, type Priority, type Recurrence } from './quickAdd';

/** One task as Bruno's ```tasks block may carry it (all optional but title). */
export interface BrunoTaskIn {
  title: string;
  description?: string;
  due_date?: string | null;
  due_time?: string | null;
  priority?: string | null;
  /** Roster names (any case, first names ok). "assignee" (one name) is accepted too. */
  assignees?: string[] | null;
  assignee?: string | null;
  /** "daily" | "weekly" | "biweekly" | "monthly", or a {freq, interval} rule. */
  repeat?: unknown;
}

export interface BrunoTask {
  title: string;
  description: string;
  due_date: string | null;
  due_time: string | null;
  priority: Priority | null;
  recurrence: Recurrence | null;
  /** Exact roster spellings. */
  assignees: string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

export function repeatToRule(v: unknown): Recurrence | null {
  if (v && typeof v === 'object') return readRecurrence(v);
  const s = String(v || '').toLowerCase().trim();
  if (s === 'daily') return { freq: 'daily', interval: 1 };
  if (s === 'weekly') return { freq: 'weekly', interval: 1 };
  if (s === 'biweekly' || s === 'every 2 weeks' || s === 'every other week') return { freq: 'weekly', interval: 2 };
  if (s === 'monthly') return { freq: 'monthly', interval: 1 };
  return null;
}

/** A roster name for "arnav", "Arnav Patel", "ARNAV", or null. */
export function rosterMatch(name: unknown, roster: string[]): string | null {
  const n = String(name || '').trim().replace(/^@/, '').toLowerCase();
  if (!n) return null;
  return roster.find((r) => r.toLowerCase() === n)
    || roster.find((r) => r.toLowerCase().split(/\s+/)[0] === n)
    || null;
}

/** True when the reader recognised something structured in the text. */
const found = (q: ReturnType<typeof parseQuickAdd>) =>
  !!(q.due_time || q.priority || q.recurrence || q.assignees.length || (q.due_date && !q.date_is_default));

export function normalizeBrunoTask(t: BrunoTaskIn, today: string, roster: string[]): BrunoTask {
  const rawTitle = String(t.title || '').trim();
  const rawDesc = String(t.description || '').trim();
  const qt = parseQuickAdd(rawTitle, today, roster);
  const qd = rawDesc ? parseQuickAdd(rawDesc, today, roster) : null;

  // Text with the recognised phrases taken out (only when something was taken).
  const title = (found(qt) && qt.title.length >= 3 ? qt.title : rawTitle).slice(0, 120);
  let description = (qd && found(qd) ? qd.title : rawDesc).trim();
  // A description that only restated the fields ("Due Thursday at 4:30pm.") is dropped.
  if (/^[\s.,;:!-]*$/.test(description)) description = '';

  const modelDate = typeof t.due_date === 'string' && ISO.test(t.due_date) ? t.due_date : null;
  const textDate = (q: ReturnType<typeof parseQuickAdd> | null) => (q && !q.date_is_default ? q.due_date : null);
  const due_time = (typeof t.due_time === 'string' && HHMM.test(t.due_time) ? t.due_time : null) || qt.due_time || qd?.due_time || null;
  // A bare time means today (the team's today).
  const due_date = modelDate || textDate(qt) || textDate(qd) || (due_time ? today : null);

  const p = String(t.priority || '').toLowerCase().trim() as Priority;
  const priority = (PRIORITIES.includes(p) ? p : null) || qt.priority || qd?.priority || null;
  const recurrence = repeatToRule(t.repeat) || qt.recurrence || qd?.recurrence || null;

  const named = [...(Array.isArray(t.assignees) ? t.assignees : []), ...(t.assignee ? [t.assignee] : [])];
  const assignees: string[] = [];
  for (const n of [...named.map((x) => rosterMatch(x, roster)), ...qt.assignees, ...(qd?.assignees || [])]) {
    if (n && !assignees.includes(n)) assignees.push(n);
  }
  return { title: title || rawTitle.slice(0, 120), description: description.slice(0, 500), due_date, due_time, priority, recurrence, assignees: assignees.slice(0, 20) };
}

/** A Bruno event with no time whose title or notes still say one ("at 6pm",
 *  "3-5pm"): the time moves into its fields and out of the text. */
export function recoverEventTime<E extends { title: string; notes?: string; time?: string; end?: string }>(e: E, today: string): E {
  if (e.time) return e;
  for (const key of ['title', 'notes'] as const) {
    const text = String(e[key] || '');
    if (!text) continue;
    const q = parseQuickAdd(text, today, []);
    if (!q.due_time) continue;
    const cleaned = q.title.trim();
    return { ...e, time: q.due_time, end: q.end_time && q.end_time > q.due_time ? q.end_time : (e.end || ''), [key]: key === 'title' && cleaned.length < 3 ? e.title : cleaned };
  }
  return e;
}
