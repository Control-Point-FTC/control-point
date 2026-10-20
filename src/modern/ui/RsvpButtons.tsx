// RSVP on an event: Going / Maybe / Can't make it (or just "Can't make it" for
// events that only ask who's missing), with an optional reason. A reason with
// "Can't make it" excuses you on that day's attendance. Used on the event sheet
// and the Home page's "This week".
import { useEffect, useState } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { notify } from '../../components/dialog';
import { cn } from '../../components/cn';
import { Button, Input } from '../../components/ui-kit';
import { MAX_RSVP_REASON, RSVP_STATUS_LABELS, cleanRsvpMode, type RsvpStatus } from '../../types/eventRsvp';

export function rsvpCountsText(e: any): string {
  const c = e?.rsvp_counts;
  if (!c || cleanRsvpMode(e?.rsvp_mode) === 'none' || !cleanRsvpMode(e?.rsvp_mode)) return '';
  return cleanRsvpMode(e.rsvp_mode) === 'decline_only'
    ? `${c.not_going} can't make it`
    : `${c.going} going · ${c.maybe} maybe · ${c.not_going} can't make it`;
}

const ICON = { going: Check, maybe: CircleHelp, not_going: X } as const;

export function RsvpButtons({ event, compact = false, onChanged }: { event: any; compact?: boolean; onChanged?: () => void }) {
  const mode = cleanRsvpMode(event?.rsvp_mode) ?? 'none';
  const [mine, setMine] = useState<{ status: RsvpStatus; reason: string; excused?: boolean } | null>(event?.my_rsvp ?? null);
  const [reason, setReason] = useState<string>(event?.my_rsvp?.reason ?? '');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  // A newer answer from elsewhere (another tab, Bruno) replaces ours.
  useEffect(() => { setMine(event?.my_rsvp ?? null); setReason(event?.my_rsvp?.reason ?? ''); }, [event?.id, event?.my_rsvp?.status, event?.my_rsvp?.reason, event?.my_rsvp?.excused]);
  const closed = mode === 'none' || event?.invited === false;
  if (closed && !mine) return null;

  const send = async (status: RsvpStatus | null, why = '') => {
    if (busy) return;
    const before = mine;
    setBusy(true);
    setMine(status ? { status, reason: why } : null);
    try {
      const res = await apiFetch(`/api/events/${event.id}/rsvp`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason: why }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || '');
      // Whether attendance really shows the excuse (not when a record already existed).
      setMine(status ? { status, reason: why, excused: !!d?.excused } : null);
      setAsking(false);
      onChanged?.();
    } catch (err: any) {
      setMine(before);
      notify((!(err instanceof TypeError) && err?.message) || 'Could not save your RSVP — try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // No longer taking answers from you (RSVPs off, or your role is no longer
  // invited) but you answered before: you can still take that answer back.
  if (closed && mine) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="group" aria-label={`RSVP for ${event.title}`}>
        <span>You answered “{RSVP_STATUS_LABELS[mine.status]}”. This event isn't taking answers from you any more.</span>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void send(null)}>Take it back</Button>
      </div>
    );
  }

  const choices: RsvpStatus[] = mode === 'decline_only' ? ['not_going'] : ['going', 'maybe', 'not_going'];
  return (
    <div className="space-y-2" role="group" aria-label={`RSVP for ${event.title}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {choices.map((s) => {
          const Icon = ICON[s];
          const on = mine?.status === s;
          return (
            <Button
              key={s} type="button" size={compact ? 'sm' : 'default'} variant="outline" aria-pressed={on} disabled={busy}
              className={cn(compact && 'h-7 px-2 text-xs', on && (s === 'going' ? 'border-success bg-success/15' : s === 'maybe' ? 'border-warning bg-warning/15' : 'border-destructive bg-destructive/10'))}
              onClick={() => {
                if (on) { void send(null); return; }
                if (s === 'not_going') { setAsking(true); return; }
                void send(s);
              }}
            >
              <Icon /> {RSVP_STATUS_LABELS[s]}
            </Button>
          );
        })}
        {mine && !asking && <span className="text-xs text-muted-foreground">Tap again to take it back</span>}
      </div>
      {asking && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void send('not_going', reason.trim()); }}>
          <Input
            autoFocus value={reason} maxLength={MAX_RSVP_REASON} onChange={(e) => setReason(e.target.value)}
            placeholder="Why? (a reason excuses you)" aria-label="Reason you can't make it" className={cn('min-w-0 flex-1', compact && 'h-8 text-xs')}
          />
          <Button type="submit" size="sm" disabled={busy}>Send</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
        </form>
      )}
      {mine?.status === 'not_going' && mine.reason && !asking && (
        <p className="text-xs text-muted-foreground">
          Reason: {mine.reason}{mine.excused ? ' · excused on attendance' : ''}
        </p>
      )}
    </div>
  );
}
