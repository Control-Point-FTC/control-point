// Calendar event types and the agenda field, shared by the calendar, the
// server and Bruno's event cards so all three accept the same values.

export const EVENT_TYPE_IDS = ['meeting', 'competition', 'scrimmage', 'outreach', 'deadline', 'social', 'other'] as const;
export type EventTypeId = (typeof EVENT_TYPE_IDS)[number];

export const EVENT_TYPE_LABELS: Record<EventTypeId, string> = {
  meeting: 'Meeting', competition: 'Competition', scrimmage: 'Scrimmage', outreach: 'Outreach',
  deadline: 'Deadline', social: 'Social', other: 'Other',
};

/** A known type (case-insensitive), or null. */
export function cleanEventType(v: unknown): EventTypeId | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (EVENT_TYPE_IDS as readonly string[]).includes(s) ? (s as EventTypeId) : null;
}

export const MAX_AGENDA = 4000;

/** Agenda text as stored: trimmed, at most 4000 characters. */
export function cleanAgenda(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, MAX_AGENDA) : '';
}

/** Notes for calendar exports (Google, ICS): the agenda first, then the notes. */
export function eventExportNotes(e: { description?: string | null; agenda?: string | null }): string {
  const agenda = (e.agenda || '').trim();
  const notes = (e.description || '').trim();
  return [agenda ? `Agenda:\n${agenda}` : '', notes].filter(Boolean).join('\n\n');
}

/**
 * What a location is: a video-call or web link (opened as is), or a place
 * (opened in maps). Only http(s) links count, so nothing else becomes a link.
 */
export function locationHref(location: unknown): { kind: 'link' | 'place'; href: string } | null {
  const s = typeof location === 'string' ? location.trim() : '';
  if (!s) return null;
  let url = s.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  // Sentence punctuation and unmatched closing brackets after a link aren't part of it.
  while (url) {
    const last = url.at(-1)!;
    const unmatched = (open: string, close: string) => last === close && url!.split(close).length > url!.split(open).length;
    if ('.,;:!?'.includes(last) || unmatched('(', ')') || unmatched('[', ']')) url = url.slice(0, -1);
    else break;
  }
  if (url) {
    try { const u = new URL(url); if (u.protocol === 'http:' || u.protocol === 'https:') return { kind: 'link', href: u.toString() }; } catch { /* not a URL */ }
  }
  return { kind: 'place', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s)}` };
}
