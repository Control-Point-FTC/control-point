// Attendance tied to calendar events: the late window before anyone is marked
// absent, and RSVP follow-through ("of those who said going, how many came").
// Shared by the attendance page and Bruno's workspace facts.

/** Minutes after an event starts before the rest can be marked absent. */
export const LATE_WINDOW_MIN = 15;

/** When the late window ends for an event ("YYYY-MM-DD", "HH:MM"), in local time; null for all-day events. */
export function lateWindowEnds(date: string, startTime?: string | null): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '').slice(0, 10)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(startTime || ''))) return null;
  const at = new Date(`${String(date).slice(0, 10)}T${startTime}:00`);
  return Number.isNaN(at.getTime()) ? null : new Date(at.getTime() + LATE_WINDOW_MIN * 60_000);
}

export type FollowThroughRow = { said_going: number; going_came: number };

/** Totals over events, and the share who came after saying going (null when nobody said going). */
export function followThrough(rows: FollowThroughRow[]): { said: number; came: number; percent: number | null } {
  const said = rows.reduce((n, r) => n + Number(r.said_going || 0), 0);
  const came = rows.reduce((n, r) => n + Number(r.going_came || 0), 0);
  return { said, came, percent: said ? Math.round((came / said) * 100) : null };
}

/** The SQL behind follow-through: full-RSVP events of a team in a date range, newest first. */
export const FOLLOW_THROUGH_SQL = `
  SELECT e.id, e.title, e.date,
    SUM(CASE WHEN r.status = 'going' THEN 1 ELSE 0 END) AS said_going,
    SUM(CASE WHEN r.status = 'going' AND a.status IN ('P', 'L') THEN 1 ELSE 0 END) AS going_came,
    SUM(CASE WHEN r.status = 'not_going' THEN 1 ELSE 0 END) AS said_no,
    (SELECT COUNT(*) FROM attendance a2 JOIN members m2 ON m2.id = a2.member_id
      WHERE m2.team_id = e.team_id AND a2.date = e.date AND a2.status IN ('P', 'L')) AS came
  FROM events e
  LEFT JOIN event_rsvps r ON r.event_id = e.id
  LEFT JOIN attendance a ON a.member_id = r.member_id AND a.date = e.date
  WHERE e.team_id = ? AND e.rsvp_mode = 'full' AND e.date >= ? AND e.date <= ?
  GROUP BY e.id ORDER BY e.date DESC LIMIT 50`;
