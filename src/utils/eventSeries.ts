// Calendar recurrence and reminders (V3.5 phase 3, calendar half).
//
// A repeating event is stored as one row per occurrence, all sharing a
// series_id (the id of the first row). Materialized rows keep every existing
// per-event path working unchanged: Google sync, drag-to-move, the ICS feed,
// Bruno, reminders. A series is therefore always finite: it ends after a
// number of times or on a date, capped at MAX_OCCURRENCES and MAX_SPAN_DAYS.
//
// Pure functions, no Date.now(): shared by the browser and the server.

import { addDays, addMonths, dateOf, isoOf } from './quickAdd';

export type RepeatFreq = 'daily' | 'weekly' | 'monthly';
export interface EventRepeat {
  freq: RepeatFreq;
  interval: number;
  /** Total occurrences including the first. Set when `until` isn't. */
  count?: number;
  /** Last allowed date (YYYY-MM-DD), inclusive. */
  until?: string;
}

export const MAX_OCCURRENCES = 100;
export const MAX_SPAN_DAYS = 366;
export const DEFAULT_COUNT = 10;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && isoOf(dateOf(v)) === v;

/** Parse a repeat rule (JSON text or object); null when absent or invalid. */
export function readEventRepeat(v: unknown): EventRepeat | null {
  let o: any = v;
  if (typeof v === 'string') { try { o = JSON.parse(v); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  if (!['daily', 'weekly', 'monthly'].includes(o.freq)) return null;
  const interval = Math.min(52, Math.max(1, Math.floor(Number(o.interval) || 1)));
  const out: EventRepeat = { freq: o.freq, interval };
  if (isIso(o.until)) out.until = o.until;
  else out.count = Math.min(MAX_OCCURRENCES, Math.max(2, Math.floor(Number(o.count) || DEFAULT_COUNT)));
  return out;
}

/** Dates of every occurrence, starting with `start` itself. */
export function seriesDates(start: string, rule: EventRepeat): string[] {
  const last = addDays(start, MAX_SPAN_DAYS);
  const limit = rule.until && rule.until < last ? rule.until : last;
  const max = rule.until ? MAX_OCCURRENCES : Math.min(MAX_OCCURRENCES, rule.count || DEFAULT_COUNT);
  const out: string[] = [];
  for (let i = 0; out.length < max; i++) {
    // Monthly steps from the start date each time so Jan 31 -> Feb 28 -> Mar 31.
    const d = rule.freq === 'daily' ? addDays(start, i * rule.interval)
      : rule.freq === 'weekly' ? addDays(start, i * 7 * rule.interval)
        : addMonths(start, i * rule.interval);
    if (d > limit) break;
    out.push(d);
  }
  return out;
}

/** "Every week" / "Every 3 days". */
export function everyLabel(r: Pick<EventRepeat, 'freq' | 'interval'>): string {
  const unit = r.freq === 'daily' ? 'day' : r.freq === 'weekly' ? 'week' : 'month';
  return r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
}

/** "Every week, 10 times" / "Every 2 weeks until Dec 12". */
export function repeatLabel(r: EventRepeat | null | undefined): string {
  if (!r) return '';
  const every = everyLabel(r);
  if (r.until) return `${every} until ${dateOf(r.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  return `${every}, ${r.count} times`;
}

// --- Reminders ---------------------------------------------------------------

/** Minutes before the start. All-day events count from ALL_DAY_REMINDER_AT. */
export const REMINDER_CHOICES = [
  { value: 10, label: '10 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
] as const;
export const ALL_DAY_REMINDER_AT = '09:00';

/** A stored or submitted reminder; null = no reminder. */
export function cleanReminder(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === 'none') return null;
  const n = Math.floor(Number(v));
  return REMINDER_CHOICES.some((c) => c.value === n) ? n : null;
}

export function reminderLabel(minutes: number | null | undefined): string {
  return REMINDER_CHOICES.find((c) => c.value === minutes)?.label || '';
}

/** UTC ms of a wall-clock date + time in an IANA zone (DST-safe). */
export function zonedToUtcMs(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const offsetAt = (ms: number) => {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  // Two passes converge across DST changes.
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return guess;
}

/** When the event starts (UTC ms); all-day events "start" at ALL_DAY_REMINDER_AT. */
export function eventStartMs(e: { date: string; start_time?: string | null }, tz: string): number {
  return zonedToUtcMs(e.date, e.start_time || ALL_DAY_REMINDER_AT, tz);
}

/** When the reminder should go out (UTC ms), or null when the event has none. */
export function reminderDueMs(e: { date: string; start_time?: string | null; reminder_minutes?: number | null }, tz: string): number | null {
  const lead = cleanReminder(e.reminder_minutes);
  if (lead == null) return null;
  return eventStartMs(e, tz) - lead * 60_000;
}

/** "starts in 30 minutes" / "is tomorrow at 6:00 PM" / "is today" for the reminder text. */
export function reminderText(e: { title: string; start_time?: string | null; reminder_minutes?: number | null }): string {
  const lead = cleanReminder(e.reminder_minutes) ?? 0;
  const when = lead >= 2880 ? 'in 2 days' : lead >= 1440 ? 'tomorrow' : lead >= 60 ? `in ${lead / 60} hour${lead === 60 ? '' : 's'}` : `in ${lead} minutes`;
  if (!e.start_time) return `Reminder: ${e.title} is ${lead >= 1440 ? when : 'today'}`;
  return `Reminder: ${e.title} starts ${when}`;
}
