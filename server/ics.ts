// iCalendar (RFC 5545) feed for the team calendar. Google Calendar, Apple
// Calendar and Outlook subscribe to the URL and poll it, so the team calendar
// shows up in personal calendars without OAuth. Times are written in UTC
// (converted from the team's timezone), which every client handles without a
// VTIMEZONE block. Pure: server.ts does the I/O.

import { eventStartMs, reminderDueMs, zonedToUtcMs } from '../src/utils/eventSeries.js';

export interface IcsEvent {
  id: number;
  title: string;
  description?: string | null;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  event_type?: string | null;
  reminder_minutes?: number | null;
}

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets (RFC 5545 §3.1), never splitting a UTF-8 character. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // Continuation lines start with a space, which counts toward the 75.
    if (curLen + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curLen = 0; }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateValue = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function buildIcs(opts: { calendarName: string; timeZone: string; host: string; events: IcsEvent[]; now: number }): string {
  const { calendarName, timeZone, host, events, now } = opts;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Control Point//Team Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    `X-WR-TIMEZONE:${timeZone}`,
    // Ask clients to re-fetch hourly (Google ignores this and polls on its own schedule).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:event-${e.id}@${host}`, `DTSTAMP:${stamp(now)}`);
    if (e.start_time) {
      const start = zonedToUtcMs(e.date, e.start_time, timeZone);
      // No end time: an hour-long block reads better than a zero-length one.
      const end = e.end_time ? zonedToUtcMs(e.date, e.end_time, timeZone) : start + 60 * 60_000;
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(e.date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(e.date))}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title || 'Event')}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.event_type) lines.push(`CATEGORIES:${icsEscape(e.event_type)}`);
    const due = reminderDueMs(e, timeZone);
    if (due != null) {
      const before = Math.max(0, Math.round((eventStartMs(e, timeZone) - due) / 60_000));
      lines.push(
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title || 'Event')}`,
        // All-day events: the reminder is anchored to the morning, so use an absolute time.
        e.start_time ? `TRIGGER:-PT${before}M` : `TRIGGER;VALUE=DATE-TIME:${stamp(due)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
