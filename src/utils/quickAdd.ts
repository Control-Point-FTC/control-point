// Deterministic quick-add parsing for tasks and events (V3.5).
//
// "Test autonomous paths, high priority, assign to Arnav, due next Thursday at
// 4:30pm" -> title "Test autonomous paths", priority high, assignee Arnav,
// due 2026-10-15 16:30. Used on its own (no AI needed) and to correct what an
// AI parse returns: dates, times, priority, repeat and assignee land in their
// real fields instead of the description.
//
// Pure functions, no Date.now(): callers pass "today" (YYYY-MM-DD) in the
// team's timezone. Shared by the browser and the server.

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export interface Recurrence { freq: 'daily' | 'weekly' | 'monthly'; interval: number }

export interface QuickParse {
  /** What's left once the recognised phrases are taken out. */
  title: string;
  due_date: string | null;
  /** HH:MM (24h). */
  due_time: string | null;
  /** End time when a range was given ("3-5pm"). */
  end_time: string | null;
  priority: Priority | null;
  recurrence: Recurrence | null;
  /** Roster names mentioned as assignees (exact roster spelling). */
  assignees: string[];
  /** True when due_date is only "today" because a time was given without a date. */
  date_is_default?: boolean;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD_RE = '(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const pad = (n: number) => String(n).padStart(2, '0');
export function isoOf(d: Date): string { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
export function dateOf(iso: string): Date { return new Date(`${iso}T12:00:00Z`); }
export function addDays(iso: string, n: number): string { const d = dateOf(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); }
export function addMonths(iso: string, n: number): string {
  const d = dateOf(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return isoOf(d);
}
function weekdayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return WEEKDAYS.findIndex((d) => d.startsWith(w));
}

/** The next date (from today) that falls on `wd`; `strictlyAfter` skips today. */
function nextWeekday(today: string, wd: number, strictlyAfter: boolean): string {
  const cur = dateOf(today).getUTCDay();
  let diff = (wd - cur + 7) % 7;
  if (diff === 0 && strictlyAfter) diff = 7;
  return addDays(today, diff);
}

/** Next occurrence of a recurring item after `from` (YYYY-MM-DD). */
export function nextOccurrence(from: string, r: Recurrence): string {
  const n = Math.max(1, Math.floor(r.interval || 1));
  if (r.freq === 'daily') return addDays(from, n);
  if (r.freq === 'weekly') return addDays(from, 7 * n);
  return addMonths(from, n);
}

export function recurrenceLabel(r: Recurrence | null | undefined): string {
  if (!r) return '';
  const n = Math.max(1, r.interval || 1);
  const unit = r.freq === 'daily' ? 'day' : r.freq === 'weekly' ? 'week' : 'month';
  if (n === 1) return r.freq === 'daily' ? 'Every day' : r.freq === 'weekly' ? 'Every week' : 'Every month';
  return `Every ${n} ${unit}s`;
}

/** Parse a stored recurrence (JSON or object); null when absent or invalid. */
export function readRecurrence(v: unknown): Recurrence | null {
  let o: any = v;
  if (typeof v === 'string') { try { o = JSON.parse(v); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  if (!['daily', 'weekly', 'monthly'].includes(o.freq)) return null;
  const interval = Math.min(52, Math.max(1, Math.floor(Number(o.interval) || 1)));
  return { freq: o.freq, interval };
}

function to24(h: number, m: number, ampm: string | undefined, raw = ''): string | null {
  if (m > 59) return null;
  const ap = (ampm || '').toLowerCase().replace(/\./g, '');
  if (ap.startsWith('p')) { if (h < 1 || h > 12) return null; h = h === 12 ? 12 : h + 12; }
  else if (ap.startsWith('a')) { if (h < 1 || h > 12) return null; h = h === 12 ? 0 : h; }
  else {
    if (h > 23) return null;
    // "at 4" in a team schedule means the afternoon; 7 and under read as PM.
    // A leading zero ("06:30") is already 24-hour.
    if (h >= 1 && h <= 7 && !raw.startsWith('0')) h += 12;
  }
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Parse one quick-add line. `today` is YYYY-MM-DD in the team's timezone;
 * `roster` is the team's member names, for "assign to X" / "@X".
 */
export function parseQuickAdd(input: string, today: string, roster: string[] = []): QuickParse {
  let text = ` ${String(input || '').replace(/\s+/g, ' ').trim()} `;
  const out: QuickParse = { title: '', due_date: null, due_time: null, end_time: null, priority: null, recurrence: null, assignees: [] };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (!m) return;
    if (fn(m) === false) return;
    text = text.replace(m[0], ' ');
  };

  // ---- Priority ----
  take(/[\s,;(]+(?:(?:priority|prio)\s*[:=]?\s*(urgent|high|medium|normal|low)|(urgent|high|medium|normal|low)[\s-]+priority|(urgent|asap)|!(urgent|high|medium|low)|\bp([1-4])\b)[\s,;)]*/i, (m) => {
    const w = (m[1] || m[2] || m[3] || m[4] || '').toLowerCase();
    const p = m[5] ? (['urgent', 'high', 'medium', 'low'] as const)[Number(m[5]) - 1] : w === 'asap' ? 'urgent' : w === 'normal' ? 'medium' : w;
    out.priority = p as Priority;
  });

  // ---- Repeat ----
  take(new RegExp(`[\\s,;]+(?:repeat(?:s|ing)?\\s+)?(?:every\\s+(other\\s+|\\d+\\s+)?(day|week|month|${WD_RE})s?|(daily|weekly|biweekly|fortnightly|monthly))\\b[\\s,;]*`, 'i'), (m) => {
    const every = (m[1] || '').trim().toLowerCase();
    const n = every === 'other' ? 2 : every ? Math.max(1, parseInt(every, 10) || 1) : 1;
    const unit = (m[2] || '').toLowerCase();
    const word = (m[4] || '').toLowerCase();
    if (word) {
      out.recurrence = word === 'daily' ? { freq: 'daily', interval: 1 } : word === 'monthly' ? { freq: 'monthly', interval: 1 } : { freq: 'weekly', interval: word === 'weekly' ? 1 : 2 };
    } else if (unit === 'day') out.recurrence = { freq: 'daily', interval: n };
    else if (unit === 'month') out.recurrence = { freq: 'monthly', interval: n };
    else {
      out.recurrence = { freq: 'weekly', interval: n };
      // "every Saturday": the first one is the coming Saturday.
      const wd = weekdayIndex(unit);
      if (wd >= 0 && unit !== 'week' && !out.due_date) out.due_date = nextWeekday(today, wd, false);
    }
  });

  // ---- Assignees ----
  const names = [...roster].filter(Boolean).sort((a, b) => b.length - a.length);
  const findName = (s: string) => {
    const lower = s.toLowerCase().trim();
    return names.find((n) => n.toLowerCase() === lower)
      || names.find((n) => n.toLowerCase().split(/\s+/)[0] === lower);
  };
  // "@Ada" mentions
  for (let guard = 0; guard < 10; guard++) {
    const m = text.match(/(^|\s)@([\p{L}][\p{L}'.-]*(?:\s[\p{L}][\p{L}'.-]*)?)/u);
    if (!m) break;
    const full = findName(m[2]) || findName(m[2].split(' ')[0]);
    if (!full) { text = text.replace(m[0], `${m[1]}${m[2]}`); break; }
    if (!out.assignees.includes(full)) out.assignees.push(full);
    const used = findName(m[2]) ? m[2] : m[2].split(' ')[0];
    text = text.replace(`@${used}`, ' ');
  }
  // "assign(ed) to Ada (and Grace)": only roster names are taken, and only
  // the names themselves; what follows ("tomorrow at noon") stays for the
  // date and time readers.
  {
    const lead = text.match(/[\s,;]+(?:and\s+)?(?:assign(?:ed)?\s+(?:it\s+)?to|give\s+(?:it\s+)?to|owner\s*:?)\s+/i);
    if (lead && lead.index != null) {
      let pos = lead.index + lead[0].length;
      const found: string[] = [];
      for (let guard = 0; guard < 10; guard++) {
        const rest = text.slice(pos);
        // Longest roster name (full name, then first name) at this spot.
        let hit: { name: string; len: number } | null = null;
        for (const n of names) {
          for (const form of [n, n.split(/\s+/)[0]]) {
            const re = new RegExp(`^${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s,;.!?])`, 'i');
            const mm = rest.match(re);
            if (mm && (!hit || mm[0].length > hit.len)) hit = { name: n, len: mm[0].length };
          }
        }
        if (!hit) break;
        if (!found.includes(hit.name)) found.push(hit.name);
        pos += hit.len;
        const joiner = text.slice(pos).match(/^(?:\s*,\s*|\s+(?:and|&)\s+)/i);
        // Only continue past "and"/"," when another roster name follows.
        if (!joiner) break;
        const after = text.slice(pos + joiner[0].length);
        if (!names.some((n) => [n, n.split(/\s+/)[0]].some((f) => after.toLowerCase().startsWith(f.toLowerCase())))) break;
        pos += joiner[0].length;
      }
      if (found.length) {
        for (const f of found) if (!out.assignees.includes(f)) out.assignees.push(f);
        text = `${text.slice(0, lead.index)} ${text.slice(pos)}`;
      }
    }
  }

  // ---- Time (before dates, so "at 4:30pm" doesn't read as a date) ----
  const T = '(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?|am|pm)?';
  take(new RegExp(`[\\s,;]+(?:from\\s+|at\\s+)?${T}\\s*(?:-|–|to|until|till)\\s*${T}(?=[\\s,;.]|$)`, 'i'), (m) => {
    // A range needs am/pm, "from"/"at", or two full HH:MM times ("07:00-09:00").
    if (!m[3] && !m[6] && !/\b(from|at)\b/i.test(m[0]) && !(m[2] && m[5])) return false;
    const endAp = m[6] || undefined;
    // "3-5pm": the start takes the end's am/pm when it has none.
    const start = to24(Number(m[1]), Number(m[2] || 0), m[3] || endAp, m[1]);
    const end = to24(Number(m[4]), Number(m[5] || 0), endAp || m[3], m[4]);
    if (!start || !end) return false;
    out.due_time = start; out.end_time = end;
  });
  if (!out.due_time) {
    take(new RegExp(`[\\s,;]+(?:at|@|by|around|before)\\s+${T}(?=[\\s,;.]|$)`, 'i'), (m) => {
      // "at 06:30" / "at 18:30" are already 24-hour (to24 keeps them); a
      // plain "at 4" or "at 4:30" gets the afternoon guess.
      const t = to24(Number(m[1]), Number(m[2] || 0), m[3], m[1]);
      if (!t) return false;
      out.due_time = t;
    });
  }
  if (!out.due_time) {
    take(/[\s,;]+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)(?=[\s,;.]|$)/i, (m) => {
      const t = to24(Number(m[1]), Number(m[2] || 0), m[3]);
      if (!t) return false;
      out.due_time = t;
    });
  }
  if (!out.due_time) {
    take(/[\s,;]+(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=[\s,;.]|$)/i, (m) => { out.due_time = `${pad(Number(m[1]))}:${m[2]}`; });
  }
  if (!out.due_time) {
    take(/[\s,;]+(?:at\s+)?(noon|midday|midnight)\b/i, (m) => { out.due_time = /mid(night)/i.test(m[1]) ? '23:59' : '12:00'; });
  }

  // ---- Date ----
  const lead = '(?:due|by|on|for|before|starting|this)?\\s*';
  if (!out.due_date) {
    take(new RegExp(`[\\s,;]+${lead}(today|tonight|tomorrow|tmrw|tmr)\\b`, 'i'), (m) => {
      const w = m[1].toLowerCase();
      out.due_date = w === 'today' || w === 'tonight' ? today : addDays(today, 1);
      if (w === 'tonight' && !out.due_time) out.due_time = '20:00';
    });
  }
  if (!out.due_date) {
    take(new RegExp(`[\\s,;]+(?:due\\s+|by\\s+|on\\s+)?(?:(next)\\s+|this\\s+)?${WD_RE}\\b`, 'i'), (m) => {
      const wd = weekdayIndex(m[2]);
      if (wd < 0) return false;
      out.due_date = nextWeekday(today, wd, !!m[1]);
    });
  }
  if (!out.due_date) {
    take(/[\s,;]+(?:due\s+|by\s+)?(?:in\s+(a|an|one|two|three|four|\d+)\s+(day|week|month)s?|next\s+(week|month))\b/i, (m) => {
      const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };
      const n = m[1] ? (words[m[1].toLowerCase()] ?? Number(m[1])) : 1;
      const unit = (m[2] || m[3]).toLowerCase();
      out.due_date = unit === 'day' ? addDays(today, n) : unit === 'week' ? addDays(today, 7 * n) : addMonths(today, n);
    });
  }
  if (!out.due_date) {
    take(new RegExp(`[\\s,;]+${lead}(?:${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE})(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m) => {
      const mon = MONTHS.indexOf((m[1] || m[4]).slice(0, 3).toLowerCase());
      const day = Number(m[2] || m[3]);
      out.due_date = resolveMonthDay(today, mon, day, m[5] ? Number(m[5]) : null);
      if (!out.due_date) return false;
    });
  }
  if (!out.due_date) {
    take(/[\s,;]+(?:due\s+|by\s+|on\s+)?(\d{4})-(\d{2})-(\d{2})\b/, (m) => {
      out.due_date = resolveMonthDay(today, Number(m[2]) - 1, Number(m[3]), Number(m[1]));
      if (!out.due_date) return false;
    });
  }
  if (!out.due_date) {
    take(/[\s,;]+(?:due\s+|by\s+|on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      out.due_date = resolveMonthDay(today, Number(m[1]) - 1, Number(m[2]), y);
      if (!out.due_date) return false;
    });
  }

  // A time with no date means today, or tomorrow if that time has passed is
  // unknowable here, so today.
  if (out.due_time && !out.due_date) { out.due_date = today; out.date_is_default = true; }

  out.title = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '')
    .replace(/\b(?:due|by|at|on|and)$/i, '')
    .replace(/[\s,;:-]+$/g, '')
    .replace(/^(?:please\s+)?(?:create|add|make|new)\s+(?:a\s+)?(?:task|todo|to-do|event)\s*(?:to|:|for)?\s*/i, '')
    .trim();
  if (out.title) out.title = out.title[0].toUpperCase() + out.title.slice(1);
  return out;
}

/** A month/day without a year: this year, or next year once it has passed. */
function resolveMonthDay(today: string, month: number, day: number, year: number | null): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const t = dateOf(today);
  let y = year ?? t.getUTCFullYear();
  const make = (yy: number) => {
    const d = new Date(Date.UTC(yy, month, day, 12));
    return d.getUTCMonth() === month ? isoOf(d) : null;
  };
  let iso = make(y);
  if (!iso) return null;
  if (year == null && iso < addDays(today, -7)) { y += 1; iso = make(y); }
  return iso;
}
