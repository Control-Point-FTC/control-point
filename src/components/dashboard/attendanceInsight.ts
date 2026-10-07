// Attendance insight for the dashboard (admins): how turnout is trending,
// who has missed meetings in a row (worth a check-in), and the best streak.
// Pure — computed from the attendance the app already has.
//
// A "meeting day" is any date with at least one attendance record that isn't
// hidden. Present (P) and Late (L) count as attended; Excused (E) is neither
// held against anyone nor counted as attended; Absent (A) or no record on a
// meeting day is a miss.

export interface InsightMember { id: number; name: string }
export interface InsightRecord { member_id: number; date: string; status: string }

export interface AttendanceInsight {
  thisWeekRate: number | null;
  lastWeekRate: number | null;
  /** Members whose last 2+ meeting days were all misses (most first). */
  missingInARow: { id: number; name: string; misses: number }[];
  bestStreak: { id: number; name: string; days: number } | null;
}

const DAY = 864e5;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function attendanceInsight(
  records: InsightRecord[],
  members: InsightMember[],
  hiddenDates: string[],
  today: string,
): AttendanceInsight {
  const hidden = new Set(hiddenDates);
  const days = [...new Set(records.map((r) => r.date).filter((d) => d <= today && !hidden.has(d)))].sort();
  const status = new Map<string, string>();
  for (const r of records) status.set(`${r.member_id}|${r.date}`, r.status);
  const attended = (s?: string) => s === 'P' || s === 'L';

  const t = Date.parse(today + 'T12:00:00Z');
  const weekStart = iso(t - 6 * DAY);
  const prevStart = iso(t - 13 * DAY);
  const rate = (from: string, to: string) => {
    let yes = 0, n = 0;
    for (const d of days) {
      if (d < from || d > to) continue;
      for (const m of members) {
        const s = status.get(`${m.id}|${d}`);
        if (s === 'E') continue; // excused: not counted either way
        n++;
        if (attended(s)) yes++;
      }
    }
    return n ? Math.round((yes / n) * 100) : null;
  };

  const missingInARow: AttendanceInsight['missingInARow'] = [];
  let bestStreak: AttendanceInsight['bestStreak'] = null;
  for (const m of members) {
    let misses = 0, streak = 0, countingMisses = true, countingStreak = true;
    for (let i = days.length - 1; i >= 0 && (countingMisses || countingStreak); i--) {
      const s = status.get(`${m.id}|${days[i]}`);
      if (s === 'E') continue; // excused days don't break or extend anything
      if (attended(s)) { countingMisses = false; if (countingStreak) streak++; }
      else { countingStreak = false; if (countingMisses) misses++; }
    }
    if (misses >= 2) missingInARow.push({ id: m.id, name: m.name, misses });
    if (streak >= 2 && (!bestStreak || streak > bestStreak.days)) bestStreak = { id: m.id, name: m.name, days: streak };
  }
  missingInARow.sort((a, b) => b.misses - a.misses || a.name.localeCompare(b.name));

  return {
    thisWeekRate: rate(weekStart, today),
    lastWeekRate: rate(prevStart, iso(t - 7 * DAY)),
    missingInARow,
    bestStreak,
  };
}
