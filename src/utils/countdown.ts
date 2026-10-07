// Countdowns (owner spec: they tick every second). Shared by the dashboard
// and the task views; pure so they're easy to test.

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** When something is due, in local time. No time = the end of that day. */
export function dueMoment(date: string | null | undefined, time?: string | null): Date | null {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = time && TIME_RE.test(time) ? `${time}:00` : '23:59:59';
  const m = new Date(`${d}T${t}`);
  return Number.isNaN(m.getTime()) ? null : m;
}

/** An open task past its full deadline (its time, or the end of its date). */
export function isTaskOverdue(t: { due_date?: string | null; due_time?: string | null; status?: string } | null | undefined, now = Date.now()): boolean {
  if (!t?.due_date || t.status === 'done') return false;
  const at = dueMoment(t.due_date, t.due_time);
  return !!at && at.getTime() < now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2d 03:14:22", "03:14:22" — always to the second. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const days = Math.floor(s / 86400);
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return days ? `${days}d ${hms}` : hms;
}
