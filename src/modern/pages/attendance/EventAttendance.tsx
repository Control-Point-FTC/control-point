// Attendance for today's calendar event: who said they're coming (or can't),
// a late window before anyone is marked absent, and RSVP follow-through.
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, UserX } from 'lucide-react';
import { apiFetch } from '../../../services/api';
import { cn } from '../../../components/cn';
import { Button } from '../../../components/ui-kit';
import { cleanRsvpMode, RSVP_STATUS_LABELS } from '../../../types/eventRsvp';
import { followThrough, lateWindowEnds, LATE_WINDOW_MIN } from '../../../utils/eventAttendance';
import { rsvpCountsText } from '../../ui/RsvpButtons';
import { localTime } from '../calendar/CalendarSheets';

export type RsvpByMember = Map<number, { status: string }>;
export type EventRsvps = { answers: RsvpByMember; invitees: number[] | null };

/** Today's events that take RSVPs or have a start time (first one leads). */
export function todaysEvents(events: any[], today: string): any[] {
  return (events || []).filter((e) => String(e.date).slice(0, 10) === today)
    .sort((a, b) => String(a.start_time || '99').localeCompare(String(b.start_time || '99')));
}

/** Each member's answer for an event, and who it's for (null until known). */
export function useEventRsvps(event: any | null): EventRsvps {
  const [state, setState] = useState<EventRsvps>({ answers: new Map(), invitees: null });
  const counts = event?.rsvp_counts ? `${event.rsvp_counts.going}|${event.rsvp_counts.maybe}|${event.rsvp_counts.not_going}` : '';
  useEffect(() => {
    if (!event) { setState({ answers: new Map(), invitees: null }); return; }
    let live = true;
    apiFetch(`/api/events/${event.id}/rsvps`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!live || !d || !Array.isArray(d.answers)) return;
      setState({
        answers: (cleanRsvpMode(event.rsvp_mode) ?? 'none') === 'none' ? new Map() : new Map(d.answers.map((a: any) => [Number(a.member_id), { status: String(a.status) }])),
        invitees: Array.isArray(d.invitee_ids) ? d.invitee_ids.map(Number) : null,
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [event?.id, event?.rsvp_mode, event?.attendee_roles?.join?.(','), counts]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/** "Said going" / "Can't make it" next to a name in roll call. */
export function RsvpChip({ status }: { status?: string }) {
  if (!status) return null;
  const label = (RSVP_STATUS_LABELS as Record<string, string>)[status];
  if (!label) return null;
  return (
    <span className={cn('ml-1.5 rounded-full px-1.5 py-px text-[10px] font-medium',
      status === 'going' ? 'bg-success/15 text-success' : status === 'maybe' ? 'bg-warning/15 text-warning' : 'bg-destructive/10 text-destructive')}>
      {status === 'going' ? 'Said going' : status === 'maybe' ? 'Said maybe' : label}
    </span>
  );
}

/**
 * Today's event: time, RSVP counts, and the late window (the team's clock).
 * Until the event has been going for LATE_WINDOW_MIN minutes, people not here
 * yet aren't absent; after it, one click asks the server to mark everyone it's
 * for who is still unmarked (arrivals and excuses meanwhile are kept).
 */
export function TodayEventCard({ event, unmarked, onMarkRest, timeZone, now = Date.now() }: {
  event: any; unmarked: number; onMarkRest: () => void | Promise<void>; timeZone: string; now?: number;
}) {
  const [busy, setBusy] = useState(false);
  const ends = lateWindowEnds(event.date, event.start_time, timeZone);
  const waiting = !!ends && now < ends.getTime();
  const counts = rsvpCountsText(event);
  return (
    <section aria-label="Today's event" className="rounded-xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="size-3.5" /> Today's event</p>
      <p className="mt-1 font-medium">{event.title}</p>
      <p className="text-sm text-muted-foreground">{event.start_time ? localTime(event.start_time) : 'All day'}{counts ? ` · ${counts}` : ''}</p>
      {unmarked > 0 && (
        waiting ? (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            Waiting for people to arrive: the rest can be marked absent from {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(ends!)} ({LATE_WINDOW_MIN} minutes after the start).
          </p>
        ) : (
          <Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy} onClick={async () => { setBusy(true); try { await onMarkRest(); } finally { setBusy(false); } }}>
            <UserX /> Mark the {unmarked} not here absent
          </Button>
        )
      )}
    </section>
  );
}

/** Insights: of those who said going, how many came (full-RSVP events, last 60 finished days). `version` reloads it. */
export function RsvpFollowThrough({ version = '' }: { version?: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch('/api/attendance/rsvp-turnout').then((r) => (r.ok ? r.json() : [])).then((d) => { if (live) setRows(Array.isArray(d) ? d : []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [version]);
  const total = useMemo(() => followThrough(rows ?? []), [rows]);
  if (!rows || rows.length === 0) return null;
  return (
    <section aria-label="RSVP follow-through" className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">RSVP follow-through (last 60 days, before today)</p>
      <p className="font-display text-2xl font-semibold tabular-nums">{total.percent == null ? '—' : `${total.percent}%`}</p>
      <p className="text-xs text-muted-foreground">{total.said ? `${total.came} of ${total.said} who said going came` : 'Nobody has said going yet'}</p>
      <ul className="mt-3 space-y-1 text-xs">
        {rows.slice(0, 5).map((r) => (
          <li key={r.event_id} className="flex justify-between gap-2">
            <span className="truncate">{r.title} <span className="text-muted-foreground">{r.date}</span></span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{r.going_came}/{r.said_going} came · {r.came} here</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
