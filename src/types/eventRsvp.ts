// RSVPs on calendar events, shared by the calendar, the dashboard, the server
// and Bruno's RSVP card.
//   none: no RSVP asked for
//   decline_only: people only say when they can't make it (a reason excuses them)
//   full: going / maybe / can't make it

export const RSVP_MODES = ['none', 'decline_only', 'full'] as const;
export type RsvpMode = (typeof RSVP_MODES)[number];
export const RSVP_MODE_LABELS: Record<RsvpMode, string> = { none: 'No RSVP', decline_only: "Can't-make-it only", full: 'Full RSVP' };

export const RSVP_STATUSES = ['going', 'maybe', 'not_going'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export const RSVP_STATUS_LABELS: Record<RsvpStatus, string> = { going: 'Going', maybe: 'Maybe', not_going: "Can't make it" };

export const MAX_RSVP_REASON = 300;

export function cleanRsvpMode(v: unknown): RsvpMode | null {
  return typeof v === 'string' && (RSVP_MODES as readonly string[]).includes(v) ? (v as RsvpMode) : null;
}

/** A status the event's RSVP style accepts (null when it doesn't). */
export function rsvpStatusFor(mode: unknown, status: unknown): RsvpStatus | null {
  const m = cleanRsvpMode(mode) ?? 'none';
  const s = typeof status === 'string' && (RSVP_STATUSES as readonly string[]).includes(status) ? (status as RsvpStatus) : null;
  if (!s || m === 'none') return null;
  if (m === 'decline_only' && s !== 'not_going') return null;
  return s;
}

/** Stored attendee roles (JSON text or array) → role ids; [] means the whole team. */
export function parseAttendeeRoles(raw: unknown): number[] {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 30);
}

export type RsvpCounts = { going: number; maybe: number; not_going: number };
