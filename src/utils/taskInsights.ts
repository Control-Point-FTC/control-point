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
