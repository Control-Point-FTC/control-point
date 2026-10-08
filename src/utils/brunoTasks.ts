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

/** A roster name for "arnav", "Arnav Patel", "ARNAV", or null. A first name
 *  counts only when exactly one member has it ("Alex" with an Alex Smith and
 *  an Alex Jones is ambiguous, so nobody is picked). */
export function rosterMatch(name: unknown, roster: string[]): string | null {
  const n = String(name || '').trim().replace(/^@/, '').toLowerCase();
  if (!n) return null;
  const full = roster.find((r) => r.toLowerCase() === n);
  if (full) return full;
  const firsts = roster.filter((r) => r.toLowerCase().split(/\s+/)[0] === n);
  return firsts.length === 1 ? firsts[0] : null;
}

/** A piece of text that is clearly a field instruction, not ordinary context:
 *  "high priority", "assign to Arnav", "due Friday at 4pm", "every week",
 *  "repeats monthly". It must START with the instruction (after an optional
 *  "make it", "it's", "this is" or "and"), or be a short phrase of six words
 *  or fewer: "We meet every week to review", "Due to rain we moved it" and
 *  "the weekly report" stay context. */
const INSTRUCTION = String.raw`(?:(?:low|medium|normal|high|top|urgent)\s+priority|priority\s*:?\s*(?:low|medium|high|urgent)|urgent|asap|assign(?:ed)?\s+(?:it\s+)?to|give\s+(?:it\s+)?to|owner\s*:|due(?!\s+to\b)\b|deadline|every\s+(?:day|week|month|other|\d+|mon|tue|wed|thu|fri|sat|sun)|repeat(?:s|ing)?\b|recurring)`;
const STARTS_WITH_INSTRUCTION = new RegExp(String.raw`^(?:(?:and|make it|it'?s|this is|it is)\s+)?${INSTRUCTION}`, 'i');
const HAS_INSTRUCTION = new RegExp(INSTRUCTION, 'i');
const isInstruction = (piece: string) =>
  STARTS_WITH_INSTRUCTION.test(piece) || (HAS_INSTRUCTION.test(piece) && piece.split(/\s+/).length <= 6);
const ASSIGN_PHRASE = /(?:assign(?:ed)?\s+(?:it\s+)?to|give\s+(?:it\s+)?to|owner\s*:)/i;

/** Split title text on commas/semicolons and description text into sentences;
 *  names after "assign to Ada" stay with it ("assign to Ada, Grace and Lin"). */
function pieces(text: string, sentences: boolean, roster: string[]): string[] {
  const raw = text.split(sentences ? /(?<=[.!?;])\s+|\n+/ : /\s*[,;]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of raw) {
    const prev = out[out.length - 1];
    const names = p.replace(/^and\s+/i, '').split(/\s+(?:and|&)\s+/i);
    if (prev && ASSIGN_PHRASE.test(prev) && names.every((n) => rosterMatch(n, roster))) out[out.length - 1] = `${prev}, ${p}`;
    else out.push(p);
  }
  return out;
}

export interface NormalizeOptions {
  /** Read fields out of instruction phrases in the title/description (the
   *  browser does this before showing the confirm card; the server only
   *  saves what was confirmed). */
  fromText?: boolean;
}

export function normalizeBrunoTask(t: BrunoTaskIn, today: string, roster: string[], opts: NormalizeOptions = { fromText: true }): BrunoTask & { unmatched: string[] } {
  const rawTitle = String(t.title || '').trim();
  const rawDesc = String(t.description || '').trim();
  const recovered: ReturnType<typeof parseQuickAdd>[] = [];
  let title = rawTitle;
  let description = rawDesc;
  if (opts.fromText) {
    // Only instruction pieces are parsed and removed; the rest stays word for word.
    const strip = (text: string, sentences: boolean) => {
      const keep: string[] = [];
      for (const whole of pieces(text, sentences, roster)) {
        // A parenthetical instruction is read on its own, however long the
        // sentence around it: "Test autonomous paths (Assigned to Arnav)."
        const piece = whole.replace(/\(([^()]*)\)/g, (m, inner: string) => {
          if (!STARTS_WITH_INSTRUCTION.test(inner.trim())) return m;
          recovered.push(parseQuickAdd(inner.trim(), today, roster));
          return '';
        }).replace(/\s+([.,;!?])/g, '$1').trim();
        if (!piece) continue;
        if (!isInstruction(piece)) { keep.push(piece); continue; }
        const q = parseQuickAdd(piece, today, roster);
        recovered.push(q);
        if (q.title.trim().length >= 3) keep.push(q.title.trim());
      }
      return keep.join(sentences ? ' ' : ', ').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    };
    const t2 = strip(rawTitle, false);
    title = t2.length >= 3 ? t2 : rawTitle;
    description = strip(rawDesc, true);
    if (/^[\s.,;:!-]*$/.test(description)) description = '';
  }
  const fromText = <K extends 'due_time' | 'priority' | 'recurrence'>(k: K) => recovered.map((q) => q[k]).find(Boolean) ?? null;
  const textDate = recovered.map((q) => (q.date_is_default ? null : q.due_date)).find(Boolean) ?? null;

  const modelDate = typeof t.due_date === 'string' && ISO.test(t.due_date) ? t.due_date : null;
  const due_time = (typeof t.due_time === 'string' && HHMM.test(t.due_time) ? t.due_time : null) || fromText('due_time');
  // A bare time means today (the team's today).
  const due_date = modelDate || textDate || (due_time ? today : null);
  const p = String(t.priority || '').toLowerCase().trim() as Priority;
  const priority = (PRIORITIES.includes(p) ? p : null) || fromText('priority');
  const recurrence = repeatToRule(t.repeat) || fromText('recurrence');

  const named = [...(Array.isArray(t.assignees) ? t.assignees : []), ...(t.assignee ? [t.assignee] : [])].map((x) => String(x || '').trim()).filter(Boolean);
  const assignees: string[] = [];
  const unmatched: string[] = [];
  for (const n of named) {
    const m = rosterMatch(n, roster);
    if (m) { if (!assignees.includes(m)) assignees.push(m); } else if (!unmatched.includes(n)) unmatched.push(n);
  }
  for (const q of recovered) for (const n of q.assignees) if (!assignees.includes(n)) assignees.push(n);
  return { title: (title || rawTitle).slice(0, 120), description: description.slice(0, 500), due_date, due_time, priority, recurrence, assignees: assignees.slice(0, 20), unmatched };
}

const TIME_RANGE_RE = /\s*\b(?:from\s+|at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)/i;
const TIME_RANGE_24_RE = /\s*\b(?:from\s+|at\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|to|until)\s*([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm|a\.m\.|p\.m\.))/i;
const TIME_ONE_RE = /\s*\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)|\s*\bat\s+(\d{1,2}):([0-5]\d)\b|\s*\bat\s+noon\b/i;
const hhmm = (h: string, m: string | undefined, ap: string | undefined): string | null => {
  let hour = Number(h);
  const min = Number(m || 0);
  const a = (ap || '').toLowerCase().replace(/\./g, '');
  if (a === 'pm' && hour < 12) hour += 12;
  if (a === 'am' && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

/** A Bruno event with no time whose title or notes still say one ("at 6pm",
 *  "3-5pm"): the time moves into its fields and ONLY that phrase leaves the
 *  text (other words such as "Monthly" stay). */
export function recoverEventTime<E extends { title: string; notes?: string; time?: string; end?: string }>(e: E): E {
  if (e.time) return e;
  for (const key of ['title', 'notes'] as const) {
    const text = String(e[key] || '');
    if (!text) continue;
    // AM/PM first: "from 3:00 to 5:00 pm" is 15:00-17:00, not 03:00-05:00.
    const r = text.match(TIME_RANGE_RE);
    if (r) {
      const endAp = r[6];
      const start = hhmm(r[1], r[2], r[3] || endAp);
      const end = hhmm(r[4], r[5], endAp);
      if (start && end && end > start) return { ...e, time: start, end, [key]: tidy(text.replace(r[0], ' '), e[key]) };
    }
    const r24 = text.match(TIME_RANGE_24_RE);
    if (r24) {
      const start = hhmm(r24[1], r24[2], undefined);
      const end = hhmm(r24[3], r24[4], undefined);
      if (start && end && end > start) return { ...e, time: start, end, [key]: tidy(text.replace(r24[0], ' '), e[key]) };
    }
    const one = text.match(TIME_ONE_RE);
    if (one) {
      const time = /noon/i.test(one[0]) ? '12:00' : one[1] ? hhmm(one[1], one[2], one[3]) : hhmm(one[4], one[5], undefined);
      if (time) return { ...e, time, [key]: tidy(text.replace(one[0], ' '), e[key]) };
    }
  }
  return e;
}
const tidy = (s: string, original: unknown) => {
  const out = s.replace(/\s+([,.;!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return out.length >= 3 ? out : String(original || '');
};
