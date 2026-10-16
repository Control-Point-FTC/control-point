// On-time rate for tasks, shared by the Insights tab and Bruno's workspace facts
// so both say the same number. A task counts when it was finished in the window
// and had a due date; it's on time when it was finished on or before that day
// (in the team's calendar, which `localDate` supplies).

export const ON_TIME_WINDOW_DAYS = 30;

const realDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;

export function onTimeStats(
  tasks: { status?: string; due_date?: string | null; completed_at?: string | null }[],
  opts: { since: Date; localDate: (iso: string) => string },
): { onTime: number; total: number } {
  let onTime = 0;
  let total = 0;
  for (const t of tasks) {
    const due = realDate(t.due_date);
    if (t.status !== 'done' || !due || !t.completed_at) continue;
    const at = new Date(t.completed_at);
    if (Number.isNaN(at.getTime()) || at < opts.since) continue;
    total++;
    if (opts.localDate(t.completed_at) <= due) onTime++;
  }
  return { onTime, total };
}

/** "83%" or null when nothing finished with a due date in the window. */
export function onTimePercent(s: { onTime: number; total: number }): number | null {
  return s.total ? Math.round((s.onTime / s.total) * 100) : null;
}

/**
 * YYYY-MM-DD of an instant in a timezone: the team's saved zone (as Bruno uses),
 * else the browser's own zone when it isn't set or isn't a real zone.
 */
export function localDateIn(timeZone?: string | null): (iso: string) => string {
  let fmt: Intl.DateTimeFormat;
  try { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { fmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
  return (iso) => {
    const parts = fmt.formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
}
