// "Unavailable times": when a member can't be there, as a date range (a trip,
// exams) or a weekly slot (Tuesdays 4–6 PM, until a date or for good). Shared
// by the calendar, the server and Bruno so "who's away for this event" means
// the same thing everywhere. Dates and times are the team's wall clock.

export const MAX_AWAY_NOTE = 200;
/** Longest one-off range (a season), so a typo can't mark someone away for years. */
export const MAX_AWAY_DAYS = 180;
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type Unavailability = {
  id?: number;
  member_id?: number;
  /** First day (and for weekly, the day it starts applying). */
  start_date: string;
  /** Last day, inclusive; null for a weekly slot with no end. */
  end_date: string | null;
  /** 0 = Sunday … 6 = Saturday for a weekly slot; null for a date range. */
  weekday: number | null;
  /** "HH:MM" both, or both null for all day. */
  start_time: string | null;
  end_time: string | null;
  note?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function realDate(s: unknown): string | null {
  const d = String(s ?? '').slice(0, 10);
  if (!DATE_RE.test(d)) return null;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d ? d : null;
}

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" date. */
export function weekdayOf(date: string): number {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

/**
 * Validates what a member (or Bruno) sent. A weekly slot needs a weekday and
 * may leave end_date empty; a range needs both dates. Times are both or neither.
 */
export function cleanUnavailability(input: any): { value: Unavailability } | { error: string } {
  const weekly = input?.weekday !== undefined && input?.weekday !== null && input?.weekday !== '';
  const weekday = weekly ? Number(input.weekday) : null;
  if (weekly && (!Number.isInteger(weekday) || weekday! < 0 || weekday! > 6)) return { error: 'Pick a day of the week' };
  const start = realDate(input?.start_date);
  if (!start) return { error: weekly ? 'Pick the date it starts' : 'Pick the first day you are away' };
  const endRaw = input?.end_date;
  const end = endRaw === undefined || endRaw === null || endRaw === '' ? (weekly ? null : start) : realDate(endRaw);
  if (endRaw && !end) return { error: 'Pick a real last day' };
  if (end && end < start) return { error: 'The last day comes before the first' };
  if (!weekly && end && dayCount(start, end) > MAX_AWAY_DAYS) return { error: `Keep one stretch to ${MAX_AWAY_DAYS} days or less` };
  const st = input?.start_time ? String(input.start_time) : null;
  const et = input?.end_time ? String(input.end_time) : null;
  if (!!st !== !!et) return { error: 'Give both a start and an end time, or neither for all day' };
  if (st && (!TIME_RE.test(st) || !TIME_RE.test(et!))) return { error: 'Use times like 16:00' };
  if (st && et! <= st) return { error: 'The end time comes before the start' };
  const note = typeof input?.note === 'string' ? input.note.replace(/\s+/g, ' ').trim().slice(0, MAX_AWAY_NOTE) : '';
  return { value: { start_date: start, end_date: end, weekday, start_time: st, end_time: et, note } };
}

/**
 * Whether an unavailable time overlaps an event slot: the date is covered (and
 * on the weekday, for a weekly slot) and, when both have times, the times
 * overlap. An all-day block or an all-day event overlaps any time that day.
 */
export function coversSlot(u: Unavailability, date: string, start?: string | null, end?: string | null): boolean {
  const d = String(date || '').slice(0, 10);
  if (!DATE_RE.test(d) || d < u.start_date || (u.end_date && d > u.end_date)) return false;
  if (u.weekday !== null && u.weekday !== undefined && weekdayOf(d) !== Number(u.weekday)) return false;
  if (!u.start_time || !u.end_time || !start || !TIME_RE.test(start)) return true;
  // An event with only a start time runs an hour for this purpose.
  const evEnd = end && TIME_RE.test(end) && end > start ? end : plusHour(start);
  return u.start_time < evEnd && start < u.end_time;
}

function plusHour(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Whether an entry touches any day from..to (both "YYYY-MM-DD", inclusive). */
export function overlapsRange(u: Unavailability, from: string, to: string): boolean {
  if (u.start_date > to || (u.end_date && u.end_date < from)) return false;
  if (u.weekday === null || u.weekday === undefined) return true;
  // A weekly slot needs its weekday to fall inside the overlap.
  const a = u.start_date > from ? u.start_date : from;
  const b = u.end_date && u.end_date < to ? u.end_date : to;
  const days = dayCount(a, b);
  if (days >= 7) return true;
  const first = weekdayOf(a);
  return ((Number(u.weekday) - first + 7) % 7) < days;
}

function hm(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

function shortDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Dec 5 – Dec 7", "Dec 5, 4 PM – 6 PM", "Tuesdays 4 PM – 6 PM until Jan 9" (en-US; Bruno and the server use it too). */
export function describeUnavailability(u: Unavailability): string {
  const times = u.start_time && u.end_time ? `${hm(u.start_time)} – ${hm(u.end_time)}` : 'all day';
  if (u.weekday !== null && u.weekday !== undefined) {
    return `${WEEKDAYS[Number(u.weekday)]}s ${times}${u.end_date ? ` until ${shortDate(u.end_date)}` : ''}`;
  }
  const days = !u.end_date || u.end_date === u.start_date ? shortDate(u.start_date) : `${shortDate(u.start_date)} – ${shortDate(u.end_date)}`;
  return u.start_time ? `${days}, ${times}` : days;
}
