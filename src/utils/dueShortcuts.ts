// Due-date shortcuts (Today, Tomorrow, In a week), counted from the team's
// today so a late-evening click doesn't land a day off.
import { localDateIn } from './taskInsights';

/** YYYY-MM-DD plus n calendar days (no timezone drift: noon UTC). */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Today in the team's timezone (else the browser's). */
export function teamToday(timeZone?: string | null, now: Date = new Date()): string {
  return localDateIn(timeZone)(now.toISOString());
}

export function dueShortcuts(today: string): { label: string; date: string }[] {
  return [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDaysISO(today, 1) },
    { label: 'In a week', date: addDaysISO(today, 7) },
  ];
}
