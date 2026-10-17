// Unavailable times on the calendar: everyone's (names and when), the "My
// availability" sheet to add or remove your own, and the "Away" line on an
// event. Notes come back only for your own entries (and for attendance
// managers). Rules shared with the server and Bruno: src/utils/unavailability.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarOff, Loader2, Trash2, UserX } from 'lucide-react';
import {
  Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
  Switch, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { apiFetch } from '../../../services/api';
import { notify } from '../../../components/dialog';
import { coversSlot, describeUnavailability, MAX_AWAY_NOTE, WEEKDAYS, type Unavailability } from '../../../utils/unavailability';

export type AwayItem = Unavailability & { id: number; member_id: number; member_name: string; note?: string };

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The team's unavailable times from two months back to most of a year ahead; follows live changes. */
export function useUnavailability(todayKey: string) {
  const [items, setItems] = useState<AwayItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const load = useCallback(() => {
    const from = shift(todayKey, -60);
    const to = shift(todayKey, 330);
    return apiFetch(`/api/unavailability?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.items)) return;
        setItems(d.items);
        setCanManage(!!d.can_manage);
      })
      .catch(() => {});
  }, [todayKey]);
  useEffect(() => {
    void load();
    const on = () => { void load(); };
    window.addEventListener('availability-changed', on);
    return () => window.removeEventListener('availability-changed', on);
  }, [load]);
  return { items, canManage, reload: load };
}

/** Names of members whose unavailable times clash with an event. */
export function awayFor(items: AwayItem[], event: { date?: string; start_time?: string | null; end_time?: string | null } | null): string[] {
  if (!event?.date) return [];
  return [...new Set(items.filter((u) => coversSlot(u, String(event.date), event.start_time, event.end_time)).map((u) => u.member_name))];
}

/** "Away: Ana, Ben" on an event's sheet (nothing when nobody is). */
export function AwayLine({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
      <UserX className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span><span className="font-medium">Away:</span> {names.join(', ')}</span>
    </p>
  );
}

type Form = { kind: 'dates' | 'weekly'; start_date: string; end_date: string; weekday: string; allDay: boolean; start_time: string; end_time: string; note: string };

export function AvailabilitySheet({ open, onOpenChange, todayKey, items, canManage, currentUserId, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayKey: string;
  items: AwayItem[];
  canManage: boolean;
  currentUserId: number | null | undefined;
  onChanged: () => void;
}) {
  const side = useIsNarrow() ? 'bottom' : 'right';
  const blank = useCallback((): Form => ({ kind: 'dates', start_date: todayKey, end_date: todayKey, weekday: String(new Date(`${todayKey}T12:00:00Z`).getUTCDay()), allDay: true, start_time: '16:00', end_time: '18:00', note: '' }), [todayKey]);
  const [f, setF] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(blank()); }, [open, blank]);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  // Yours, then (for attendance managers) everyone else's still to come.
  const mine = useMemo(() => items.filter((u) => u.member_id === currentUserId && (u.end_date === null || u.end_date >= todayKey)), [items, currentUserId, todayKey]);
  const others = useMemo(() => items.filter((u) => u.member_id !== currentUserId && (u.end_date === null || u.end_date >= todayKey)), [items, currentUserId, todayKey]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const body = {
        start_date: f.start_date,
        end_date: f.kind === 'weekly' ? (f.end_date || null) : f.end_date,
        weekday: f.kind === 'weekly' ? Number(f.weekday) : null,
        start_time: f.allDay ? null : f.start_time,
        end_time: f.allDay ? null : f.end_time,
        note: f.note,
      };
      const res = await apiFetch('/api/unavailability', { method: 'POST', body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { notify(d?.error || 'Could not save that — try again.', 'error'); return; }
      notify('Saved. The team can see when you are away.', 'success');
      setF(blank());
      onChanged();
    } catch {
      notify('Could not save that — check your connection.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (u: AwayItem) => {
    const res = await apiFetch(`/api/unavailability/${u.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) { notify('Could not remove that — try again.', 'error'); return; }
    onChanged();
  };

  const row = (u: AwayItem, who?: string) => (
    <li key={u.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{who ? `${who} · ` : ''}{describeUnavailability(u)}</p>
        {u.note && <p className="truncate text-muted-foreground">{u.note}</p>}
      </div>
      <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Remove ${who ? `${who}'s ` : ''}unavailable time ${describeUnavailability(u)}`} onClick={() => void remove(u)}><Trash2 /></Button>
    </li>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={side === 'right' ? 'gap-0 p-0 sm:max-w-md' : 'gap-0 p-0'}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>My availability</SheetTitle>
          <SheetDescription>Mark when you can't be there. The team sees your name on events that clash; your note stays private to you and attendance managers.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <ToggleGroup type="single" value={f.kind} onValueChange={(v) => v && set({ kind: v as Form['kind'], end_date: v === 'weekly' ? '' : f.start_date })} aria-label="Kind of unavailable time" className="w-full">
            <ToggleGroupItem value="dates" className="flex-1">Dates</ToggleGroupItem>
            <ToggleGroupItem value="weekly" className="flex-1">Every week</ToggleGroupItem>
          </ToggleGroup>
          {f.kind === 'weekly' && (
            <div className="space-y-1.5">
              <Label htmlFor="away-weekday">Day</Label>
              <Select value={f.weekday} onValueChange={(v) => set({ weekday: v })}>
                <SelectTrigger id="away-weekday"><SelectValue /></SelectTrigger>
                <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="away-from">{f.kind === 'weekly' ? 'Starting' : 'From'}</Label>
              <Input id="away-from" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value, ...(f.kind === 'dates' && f.end_date < e.target.value ? { end_date: e.target.value } : {}) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="away-to">{f.kind === 'weekly' ? 'Until (optional)' : 'To'}</Label>
              <Input id="away-to" type="date" min={f.start_date} value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="away-all-day">All day</Label>
            <Switch id="away-all-day" checked={f.allDay} onCheckedChange={(v) => set({ allDay: v })} />
          </div>
          {!f.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="away-start">From</Label>
                <Input id="away-start" type="time" value={f.start_time} onChange={(e) => set({ start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="away-end">To</Label>
                <Input id="away-end" type="time" value={f.end_time} onChange={(e) => set({ end_time: e.target.value })} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="away-note">Note (private)</Label>
            <Input id="away-note" maxLength={MAX_AWAY_NOTE} placeholder="Family trip, exams, piano lesson…" value={f.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="animate-spin" /> : <CalendarOff />} Add unavailable time
          </Button>
          <div className="space-y-2">
            <Label className="block">Yours</Label>
            {mine.length ? <ul className="space-y-2">{mine.map((u) => row(u))}</ul> : <p className="text-sm text-muted-foreground">Nothing yet. You're marked available.</p>}
          </div>
          {canManage && others.length > 0 && (
            <div className="space-y-2">
              <Label className="block">Everyone else</Label>
              <ul className="space-y-2">{others.map((u) => row(u, u.member_name))}</ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
