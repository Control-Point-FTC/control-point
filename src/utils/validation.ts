// Input rules shared by the client forms and the server routes, so the form
// shows the same message the API would return and the API never trusts the
// form. Browser-free: server.ts imports this too (deploy ships src/utils).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 24h HH:MM, or empty (no time). */
export function isTimeOrEmpty(v: unknown): boolean {
  return v == null || v === '' || (typeof v === 'string' && TIME_RE.test(v));
}

/**
 * Event start/end rule. Events are same-day: an end time needs a start time
 * and must be after it. Returns a user-facing message, or null when valid.
 */
export function eventTimeError(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = start || '';
  const e = end || '';
  if (!isTimeOrEmpty(s)) return 'Start time must look like 14:30';
  if (!isTimeOrEmpty(e)) return 'End time must look like 16:00';
  if (e && !s) return 'Add a start time, or clear the end time';
  if (s && e && e <= s) return 'End time must be after the start time';
  return null;
}

/** Full event validation for create/update (after merging with the stored row). */
export function eventError(e: { title?: unknown; date?: unknown; start_time?: unknown; end_time?: unknown }): string | null {
  const title = typeof e.title === 'string' ? e.title.trim() : '';
  if (!title) return 'Title is required';
  if (title.length > 200) return 'Title must be 200 characters or fewer';
  if (!isIsoDate(e.date)) return 'Pick a valid date';
  return eventTimeError(e.start_time as string, e.end_time as string);
}

// --- Money -------------------------------------------------------------------

/** Hard cap on a single budget entry. FTC team budgets are thousands, not millions. */
export const MONEY_MAX = 1_000_000;
/** Entries at or above this ask the user to confirm before saving. */
export const MONEY_CONFIRM_AT = 10_000;

/**
 * Parse a positive dollar amount, rounded to cents. Rejects zero, negatives,
 * non-numbers and anything over MONEY_MAX.
 */
export function parseMoney(input: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const raw = typeof input === 'string' ? input.replace(/[$,\s]/g, '') : input;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: 'Enter an amount, like 125.50' };
  if (n <= 0) return { ok: false, error: 'Amount must be more than $0' };
  if (n > MONEY_MAX) return { ok: false, error: `Amount can't be more than ${formatMoney(MONEY_MAX)}` };
  // EPSILON: 10.005 is stored as 10.00499… in binary; round it the way people do.
  const value = Math.round((n + Number.EPSILON * Math.max(1, Math.abs(n))) * 100) / 100;
  if (value <= 0) return { ok: false, error: 'Amount must be at least $0.01' };
  return { ok: true, value };
}

/** "$1,234.50" */
export function formatMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Compact axis label: $950, $1.2k, $3.4M, $2B. */
export function formatMoneyCompact(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (x: number) => (Math.round(x * 10) / 10).toString();
  if (a >= 1e9) return `${sign}$${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}

// --- Attendance --------------------------------------------------------------

/** Grid codes: Present, Late, Excused, Unexcused, School event. */
export const ATTENDANCE_CODES = ['P', 'L', 'E', 'U', 'S'] as const;
/** Absences known in advance — the only marks allowed on a future day. */
export const FUTURE_OK_CODES = ['E', 'S'] as const;

/**
 * A day that hasn't happened yet can only be pre-marked as an excused absence
 * or a school event. `today` is the viewer's local YYYY-MM-DD (the server
 * passes the latest "today" on Earth so no timezone is wrongly refused).
 */
export function attendanceMarkError(date: string, status: string, today: string): string | null {
  if (!isIsoDate(date)) return 'Invalid date';
  if (!(ATTENDANCE_CODES as readonly string[]).includes(status)) return 'Unknown attendance status';
  if (date > today && !(FUTURE_OK_CODES as readonly string[]).includes(status)) {
    return 'Future days can only be marked Excused or School event';
  }
  return null;
}

/** Local YYYY-MM-DD for a Date (not UTC). */
export function localIsoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD shifted by whole days (UTC arithmetic on a date string). */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** The calendar date in the furthest-ahead timezone (UTC+14). */
export function latestTodayOnEarth(now: Date = new Date()): string {
  return new Date(now.getTime() + 14 * 3600 * 1000).toISOString().slice(0, 10);
}
/** The calendar date in the furthest-behind timezone (UTC-12). */
export function earliestTodayOnEarth(now: Date = new Date()): string {
  return new Date(now.getTime() - 12 * 3600 * 1000).toISOString().slice(0, 10);
}

// --- Budget entries ----------------------------------------------------------

export interface BudgetEntry { type: 'income' | 'expense'; amount: number; category: string; description: string; date: string }

/**
 * Validate a budget create (existing = null) or update (patch merged over the
 * stored row). Returns the clean entry or a user-facing error.
 */
/**
 * Required text fields, shared by forms and the API so a blank title or
 * description is refused in both places. Returns the first problem as a
 * sentence ("Add a description"), or null when every field has text.
 */
export function requiredTextError(values: Record<string, unknown>, fields: Array<[key: string, label: string]>): string | null {
  for (const [key, label] of fields) {
    if (!String(values?.[key] ?? '').trim()) return `Add ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`;
  }
  return null;
}

/** Required fields per record type (the form and the API use the same lists). */
export const REQUIRED = {
  task: [['title', 'title']] as Array<[string, string]>,
  budget: [['description', 'description'], ['category', 'category']] as Array<[string, string]>,
  outreach: [['title', 'title'], ['date', 'date']] as Array<[string, string]>,
  communication: [['recipient', 'contact'], ['subject', 'subject']] as Array<[string, string]>,
};

/** A log entry needs a contact and subject; a reply in a thread needs a subject or a message. */
export function communicationError(values: Record<string, unknown>, isReply: boolean): string | null {
  if (!isReply) return requiredTextError(values, REQUIRED.communication);
  return String(values?.body ?? '').trim() || String(values?.subject ?? '').trim() ? null : 'Add a message';
}

export function budgetEntryFrom(body: any, existing: Partial<BudgetEntry> | null): BudgetEntry | { error: string } {
  const b = body || {};
  const pick = <K extends keyof BudgetEntry>(k: K) => (b[k] !== undefined ? b[k] : existing?.[k]);
  const type = pick('type');
  if (type !== 'income' && type !== 'expense') return { error: 'Type must be income or expense' };
  const money = parseMoney(pick('amount'));
  if (money.ok === false) return { error: money.error };
  const date = pick('date');
  if (!isIsoDate(date)) return { error: 'Pick a valid date' };
  const category = String(pick('category') ?? '').trim();
  if (category.length > 80) return { error: 'Category must be 80 characters or fewer' };
  const description = String(pick('description') ?? '').trim();
  if (description.length > 500) return { error: 'Description must be 500 characters or fewer' };
  const missing = requiredTextError({ description, category }, REQUIRED.budget);
  if (missing) return { error: missing };
  return { type, amount: money.value, category, description, date };
}
