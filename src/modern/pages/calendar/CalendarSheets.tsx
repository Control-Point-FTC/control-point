// Calendar side sheets (Modern): event details for everyone, and the
// create/edit form (Bruno quick-add first) for calendar managers. Open state
// and form values live in the shared draft store via useCalendarController.
import { useEffect, useState } from 'react';
import { CalendarDays, Clock, Loader2, MapPin, Pencil, Sparkles, Trash2, Users, Wand2, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Switch, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { EVENT_TYPES, type useCalendarController } from '../../../components/calendar/useCalendarController';
import { eventTimeError } from '../../../utils/validation';

type Ctl = ReturnType<typeof useCalendarController>;

/** Event type colours, all from theme tokens. */
export const TYPE_META: Record<string, { label: string; dot: string; chip: string; bar: string }> = {
  meeting: { label: 'Meeting', dot: 'bg-info', chip: 'bg-info/12 text-info', bar: 'border-l-info' },
  competition: { label: 'Competition', dot: 'bg-chart-4', chip: 'bg-chart-4/12 text-chart-4', bar: 'border-l-chart-4' },
  deadline: { label: 'Deadline', dot: 'bg-warning', chip: 'bg-warning/12 text-warning', bar: 'border-l-warning' },
  social: { label: 'Social', dot: 'bg-success', chip: 'bg-success/12 text-success', bar: 'border-l-success' },
  other: { label: 'Other', dot: 'bg-muted-foreground', chip: 'bg-muted text-muted-foreground', bar: 'border-l-muted-foreground' },
};
export const typeMeta = (t?: string) => TYPE_META[t || 'other'] || TYPE_META.other;

/** "18:30" → browser-locale time ("6:30 PM" / "18:30"). */
export function localTime(t?: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function timeRange(e: any) {
  if (!e?.start_time) return 'All day';
  return e.end_time ? `${localTime(e.start_time)} – ${localTime(e.end_time)}` : localTime(e.start_time);
}
export function keyToDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function useSheetSide() {
  return useIsNarrow() ? 'bottom' : 'right';
}

export function EventViewSheet({ event, onOpenChange, ctl, teams }: {
  event: any | null;
  onOpenChange: (open: boolean) => void;
  ctl: Ctl;
  teams: any[];
}) {
  const side = useSheetSide();
  const meta = typeMeta(event?.event_type);
  const team = event?.team_id ? teams.find((t) => String(t.id) === String(event.team_id)) : null;
  const finished = ctl.isEventFinished(event);
  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn('gap-0 p-0', side === 'right' ? 'sm:max-w-md' : '')}>
        {event && (
          <>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', meta.chip)}>
                  <span className={cn('size-1.5 rounded-full', meta.dot)} /> {meta.label}
                </span>
                {finished && <Badge variant="outline">Finished</Badge>}
              </div>
              <SheetTitle className="text-xl leading-snug">{event.title}</SheetTitle>
              <SheetDescription>{keyToDate(event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-sm">
                <dt className="flex items-center gap-2 text-muted-foreground"><Clock className="size-4" /> Time</dt>
                <dd>{timeRange(event)}</dd>
                <dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="size-4" /> Where</dt>
                <dd>{event.location || <span className="text-muted-foreground">No location</span>}</dd>
                <dt className="flex items-center gap-2 text-muted-foreground"><Users className="size-4" /> Team</dt>
                <dd>{team ? `${team.name}${team.number ? ` #${team.number}` : ''}` : 'All teams'}</dd>
              </dl>
              <Separator />
              <div>
                <Label className="mb-2 block">Notes</Label>
                {event.description
                  ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{event.description}</p>
                  : <p className="text-sm text-muted-foreground">No notes.</p>}
              </div>
            </div>
            {ctl.canManageCalendar && typeof event.id === 'number' && (
              <div className="flex items-center gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button variant="outline" onClick={() => { onOpenChange(false); ctl.openEdit(event); }}><Pencil /> Edit</Button>
                <Button
                  variant="ghost"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => { void ctl.deleteEvent(event.id, event.title, () => onOpenChange(false)); }}
                >
                  <Trash2 /> Delete
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function EventEditorSheet({ ctl, teams }: { ctl: Ctl; teams: any[] }) {
  const side = useSheetSide();
  const f = ctl.form;
  const set = (patch: Partial<typeof f>) => ctl.setForm({ ...f, ...patch });
  // Re-validated on every change, so fixing a time immediately unblocks Save.
  const timeError = eventTimeError(f.start_time, f.end_time);
  const editing = !!ctl.editingId;
  // All day = no times. Starts on for an existing event saved without times.
  const [allDay, setAllDay] = useState(false);
  useEffect(() => {
    if (ctl.showModal) setAllDay(editing && !f.start_time && !f.end_time);
    // Only when the editor opens (or switches event), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.showModal, ctl.editingId]);
  return (
    <Sheet open={ctl.showModal} onOpenChange={(o) => { if (!o) ctl.closeEditor(); }}>
      <SheetContent side={side} className={cn('gap-0 p-0', side === 'right' ? 'sm:max-w-lg' : '')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{editing ? 'Edit event' : 'New event'}</SheetTitle>
          <SheetDescription>{editing ? 'Changes show on everyone’s calendar.' : 'Describe it to Bruno, or fill in the details.'}</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => { e.preventDefault(); void ctl.handleSave(); }}
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {!editing && (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <Label htmlFor="event-ai" className="mb-2 flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent" /> Quick add with Bruno</Label>
                <Textarea
                  id="event-ai"
                  value={ctl.aiText}
                  onChange={(e) => ctl.setAiText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ctl.handleAiParse(); } }}
                  placeholder="e.g. Parent meeting tomorrow at 6pm in Room 101 — or paste several events at once"
                  className="min-h-16 bg-background"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">One event fills the form; several can be created together.</p>
                  <Button type="button" variant="outline" size="sm" disabled={!ctl.aiText.trim() || ctl.aiBusy} onClick={() => void ctl.handleAiParse()}>
                    {ctl.aiBusy ? <Loader2 className="animate-spin" /> : <Wand2 />} {ctl.aiBusy ? 'Reading…' : 'Parse'}
                  </Button>
                </div>
                {ctl.aiNote && <p className="mt-2 text-xs text-muted-foreground" role="status">{ctl.aiNote}</p>}
                {ctl.aiProposals.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                      {ctl.aiProposals.map((p: any, i: number) => (
                        <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.title}</span>
                            <span className="block text-xs text-muted-foreground">{p.date}{p.time ? ` · ${localTime(p.time)}` : ''}</span>
                          </span>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${p.title}`} onClick={() => ctl.setAiProposals(ctl.aiProposals.filter((_: any, j: number) => j !== i))}>
                            <X />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button type="button" className="w-full" disabled={ctl.aiCreating} onClick={() => void ctl.handleAiCreateAll()}>
                      {ctl.aiCreating && <Loader2 className="animate-spin" />} Create all {ctl.aiProposals.length} events
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="event-title">Title</Label>
              <Input id="event-title" required value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="What’s happening?" />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <ToggleGroup type="single" value={f.event_type} onValueChange={(v) => { if (v) set({ event_type: v }); }} aria-label="Event type" className="flex-wrap justify-start">
                {EVENT_TYPES.map((t) => (
                  <ToggleGroupItem key={t.value} value={t.value}>
                    <span className={cn('size-2 rounded-full', typeMeta(t.value).dot)} /> {t.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2 sm:col-span-3">
                <Label htmlFor="event-date"><CalendarDays className="size-3.5" /> Date</Label>
                <Input id="event-date" type="date" required value={f.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-3">
                <Label htmlFor="event-all-day">All day</Label>
                <Switch
                  id="event-all-day" checked={allDay}
                  onCheckedChange={(on) => { setAllDay(on); if (on) set({ start_time: '', end_time: '' }); }}
                />
              </div>
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="event-start">Starts</Label>
                <Input id="event-start" type="time" disabled={allDay} value={f.start_time} onChange={(e) => set({ start_time: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="event-end">Ends</Label>
                <Input
                  id="event-end" type="time" disabled={allDay} value={f.end_time} onChange={(e) => set({ end_time: e.target.value })}
                  aria-invalid={timeError ? true : undefined} aria-describedby={timeError ? 'event-time-error' : undefined}
                />
              </div>
              {timeError && (
                <p id="event-time-error" role="alert" className="text-sm text-destructive sm:col-span-3 sm:order-last">{timeError}</p>
              )}
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="event-team">Team</Label>
                <Select value={f.team_id || 'all'} onValueChange={(v) => set({ team_id: v === 'all' ? '' : v })}>
                  <SelectTrigger id="event-team"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
                    {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.number ? ` #${t.number}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-location">Location</Label>
              <Input id="event-location" value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="Where?" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-desc">Notes</Label>
              <Textarea id="event-desc" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Agenda, what to bring…" className="min-h-24" />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {editing && (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void ctl.handleDelete()}>
                <Trash2 /> Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={ctl.closeEditor}>Cancel</Button>
              <Button type="submit" disabled={!f.title.trim() || !f.date || !!timeError}>{editing ? 'Save changes' : 'Create event'}</Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
