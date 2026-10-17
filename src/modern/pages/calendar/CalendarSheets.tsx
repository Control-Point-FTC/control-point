// Calendar side sheets (Modern): event details for everyone, and the
// create/edit form (Bruno quick-add first) for calendar managers. Open state
// and form values live in the shared draft store via useCalendarController.
import { useEffect, useState } from 'react';
import { Bell, CalendarDays, Clock, Loader2, MapPin, Pencil, Plus, Repeat, Sparkles, Trash2, Users, Wand2, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Input, Label, Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Switch, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { EVENT_TYPES, repeatError, type useCalendarController } from '../../../components/calendar/useCalendarController';
import { eventTimeError } from '../../../utils/validation';
import { everyLabel, readEventRepeat, repeatLabel, reminderLabel, REMINDER_CHOICES } from '../../../utils/eventSeries';
import { locationHref, MAX_AGENDA } from '../../../types/eventTypes';
import { RSVP_MODES, RSVP_MODE_LABELS, RSVP_STATUS_LABELS, cleanRsvpMode } from '../../../types/eventRsvp';
import { RsvpButtons, rsvpCountsText } from '../../ui/RsvpButtons';
import { apiFetch } from '../../../services/api';
import { AwayLine } from './Availability';

type Ctl = ReturnType<typeof useCalendarController>;

/** Event type colours, all from theme tokens. */
export const TYPE_META: Record<string, { label: string; dot: string; chip: string; bar: string }> = {
  meeting: { label: 'Meeting', dot: 'bg-info', chip: 'bg-info/12 text-info', bar: 'border-l-info' },
  competition: { label: 'Competition', dot: 'bg-chart-4', chip: 'bg-chart-4/12 text-chart-4', bar: 'border-l-chart-4' },
  deadline: { label: 'Deadline', dot: 'bg-warning', chip: 'bg-warning/12 text-warning', bar: 'border-l-warning' },
  scrimmage: { label: 'Scrimmage', dot: 'bg-pink-400', chip: 'bg-pink-400/12 text-pink-600 dark:text-pink-300', bar: 'border-l-pink-400' },
  outreach: { label: 'Outreach', dot: 'bg-chart-1', chip: 'bg-chart-1/12 text-chart-1', bar: 'border-l-chart-1' },
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

export function EventViewSheet({ event, onOpenChange, ctl, teams, away = [] }: {
  event: any | null;
  /** Members whose unavailable times clash with it. */
  away?: string[];
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
                <dd><EventLocation location={event.location} /></dd>
                <dt className="flex items-center gap-2 text-muted-foreground"><Users className="size-4" /> Team</dt>
                <dd>{team ? `${team.name}${team.number ? ` #${team.number}` : ''}` : 'All teams'}</dd>
                {readEventRepeat(event.recurrence) && (<>
                  <dt className="flex items-center gap-2 text-muted-foreground"><Repeat className="size-4" /> Repeats</dt>
                  <dd>{repeatLabel(readEventRepeat(event.recurrence))}</dd>
                </>)}
                {reminderLabel(event.reminder_minutes) && (<>
                  <dt className="flex items-center gap-2 text-muted-foreground"><Bell className="size-4" /> Reminder</dt>
                  <dd>{reminderLabel(event.reminder_minutes)}{!event.start_time && Number(event.reminder_minutes) < 1440 ? ' 9 AM' : ''}</dd>
                </>)}
              </dl>
              <AwayLine names={away} />
              {cleanRsvpMode(event.rsvp_mode) && cleanRsvpMode(event.rsvp_mode) !== 'none' && (
                <RsvpSection event={event} />
              )}
              <Separator />
              {event.agenda?.trim() && (
                <div>
                  <Label className="mb-2 block">Agenda</Label>
                  <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground/90">
                    {String(event.agenda).split('\n').map((line: string) => line.trim()).filter(Boolean).map((line: string, i: number) => <li key={i}>{line}</li>)}
                  </ol>
                </div>
              )}
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
                {event.series_id ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive"><Trash2 /> Delete…</Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-1.5">
                      {([['one', 'This event'], ['following', 'This and following'], ['all', 'All events in the series']] as const).map(([scope, label]) => (
                        <Button
                          key={scope} variant="ghost" className="w-full justify-start text-destructive hover:text-destructive"
                          onClick={() => { void ctl.deleteEvent(event.id, event.title, () => onOpenChange(false), scope); }}
                        >
                          {label}
                        </Button>
                      ))}
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Button
                    variant="ghost"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => { void ctl.deleteEvent(event.id, event.title, () => onOpenChange(false)); }}
                  >
                    <Trash2 /> Delete
                  </Button>
                )}
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
  const editingEvent = editing ? ctl.events.find((e: any) => e.id === ctl.editingId) : null;
  const repError = repeatError(f, editingEvent);
  const inSeries = !!editingEvent?.series_id;
  // A series' repeat rule changes from this occurrence on, never for just one.
  const canEditRepeat = !inSeries || f.scope === 'following';
  // All day = no times. Starts on for an existing event saved without times.
  const [allDay, setAllDay] = useState(false);
  useEffect(() => {
    if (ctl.showModal) setAllDay(editing && !f.start_time && !f.end_time);
    // Only when the editor opens (or switches event), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.showModal, ctl.editingId]);
  // Times filled in some other way (Bruno quick-add) mean it isn't all day.
  useEffect(() => {
    if (f.start_time || f.end_time) setAllDay(false);
  }, [f.start_time, f.end_time]);
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
              {!allDay && (
                <div className="flex flex-wrap items-center gap-1 sm:col-span-3" role="group" aria-label="Start time shortcuts">
                  {START_CHIPS.map((t) => (
                    <button key={t} type="button" aria-pressed={f.start_time === t} onClick={() => set({ start_time: t, ...(f.end_time && f.end_time <= t ? { end_time: '' } : {}) })}
                      className={cn('rounded-full border px-2.5 py-0.5 text-xs', f.start_time === t ? 'border-accent bg-accent/15' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}>
                      {localTime(t)}
                    </button>
                  ))}
                  <button type="button" disabled={!f.start_time || !plusTwoHours(f.start_time)} onClick={() => set({ end_time: plusTwoHours(f.start_time) })}
                    className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                    Ends +2h
                  </button>
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="event-repeat"><Repeat className="size-3.5" /> Repeats</Label>
                <Select value={f.repeat || 'none'} disabled={!canEditRepeat} onValueChange={(v) => set({ repeat: (v === 'none' ? '' : v) as typeof f.repeat })}>
                  <SelectTrigger id="event-repeat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Doesn’t repeat</SelectItem>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Every week</SelectItem>
                    <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                    <SelectItem value="monthly">Every month</SelectItem>
                    {f.repeat === 'custom' && f.repeat_rule && <SelectItem value="custom">{everyLabel(f.repeat_rule)}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-reminder"><Bell className="size-3.5" /> Reminder</Label>
                <Select value={f.reminder || 'none'} onValueChange={(v) => set({ reminder: v === 'none' ? '' : v })}>
                  <SelectTrigger id="event-reminder"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No reminder</SelectItem>
                    {REMINDER_CHOICES.map((c) => <SelectItem key={c.value} value={String(c.value)}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {f.repeat && canEditRepeat && (
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Ends</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <ToggleGroup type="single" value={f.repeat_end} onValueChange={(v) => { if (v) set({ repeat_end: v as 'count' | 'until' }); }} aria-label="When the repeat ends">
                      <ToggleGroupItem value="count">After</ToggleGroupItem>
                      <ToggleGroupItem value="until">On date</ToggleGroupItem>
                    </ToggleGroup>
                    {f.repeat_end === 'count' ? (
                      <span className="flex items-center gap-2 text-sm">
                        <Input
                          id="event-repeat-count" type="number" inputMode="numeric" min={2} max={100} className="w-20"
                          value={f.repeat_count} onChange={(e) => set({ repeat_count: e.target.value })} aria-label="Number of times"
                          aria-invalid={repError ? true : undefined}
                        /> times
                      </span>
                    ) : (
                      <Input
                        id="event-repeat-until" type="date" className="w-auto" min={f.date || undefined}
                        value={f.repeat_until} onChange={(e) => set({ repeat_until: e.target.value })} aria-label="Last date"
                        aria-invalid={repError ? true : undefined}
                      />
                    )}
                  </div>
                  {repError && <p role="alert" className="text-sm text-destructive">{repError}</p>}
                </div>
              )}
              {f.reminder && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Everyone on the team gets an inbox notification{f.start_time ? '' : ' (all-day events count from 9 AM)'}.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="event-rsvp">RSVP</Label>
                <Select value={f.rsvp_mode} onValueChange={(v) => set({ rsvp_mode: v as typeof f.rsvp_mode })}>
                  <SelectTrigger id="event-rsvp"><SelectValue /></SelectTrigger>
                  <SelectContent>{RSVP_MODES.map((m) => <SelectItem key={m} value={m}>{RSVP_MODE_LABELS[m]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <AttendeeRoles value={f.attendee_roles} onChange={(ids) => set({ attendee_roles: ids })} open={ctl.showModal} />
              {f.rsvp_mode === 'decline_only' && <p className="text-xs text-muted-foreground sm:col-span-2">People only say when they can't come; giving a reason excuses them on that day's attendance.</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-location">Location</Label>
              <Input id="event-location" value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="An address, or a video-call link" />
              {f.location.trim() && <p className="text-xs text-muted-foreground">{locationHref(f.location)?.kind === 'link' ? 'Shows as a link people can click to join.' : 'Shows as a place that opens in maps.'}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-agenda">Agenda <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="event-agenda" value={f.agenda} maxLength={MAX_AGENDA} onChange={(e) => set({ agenda: e.target.value })} placeholder={'One item per line, e.g.\n4:00 Drive practice\n5:00 Intake review'} className="min-h-20" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-desc">Notes</Label>
              <Textarea id="event-desc" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="What to bring, parking…" className="min-h-24" />
            </div>
            {!editing && !f.repeat && <ExtraDays f={f} set={set} />}
          </div>
          {inSeries && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-6 py-3">
              <span className="text-sm text-muted-foreground">This event repeats. Apply to</span>
              <ToggleGroup type="single" value={f.scope} onValueChange={(v) => { if (v) set({ scope: v as 'one' | 'following' }); }} aria-label="Apply changes to">
                <ToggleGroupItem value="one" size="sm">This event</ToggleGroupItem>
                <ToggleGroupItem value="following" size="sm">This and following</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {editing && (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void ctl.handleDelete()}>
                <Trash2 /> {inSeries && f.scope === 'following' ? 'Delete these' : 'Delete'}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={ctl.closeEditor}>Cancel</Button>
              <Button type="submit" disabled={!f.title.trim() || !f.date || !!timeError || !!repError}>{editing ? 'Save changes' : 'Create event'}</Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** The start-time chips: the usual after-school slots. */
export const START_CHIPS = ['15:30', '16:00', '17:00', '18:00', '19:00'] as const;

/** "HH:MM" two hours later, or '' when that runs past midnight. */
export function plusTwoHours(start: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(start || '');
  if (!m) return '';
  const total = Number(m[1]) * 60 + Number(m[2]) + 120;
  if (total >= 24 * 60) return '';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** A location as a link: a video call opens as is, a place opens in maps. */
export function EventLocation({ location }: { location?: string | null }) {
  const href = locationHref(location);
  if (!href) return <span className="text-muted-foreground">No location</span>;
  return (
    <a href={href.href} target="_blank" rel="noopener noreferrer" className="break-words text-accent underline-offset-2 hover:underline">
      {String(location).trim()}<span className="sr-only">{href.kind === 'link' ? ' (opens the link)' : ' (opens in maps)'}</span>
    </a>
  );
}

/** "+ Add another day": a multi-day event, each day with its own times. */
function ExtraDays({ f, set }: { f: Ctl['form']; set: (patch: Partial<Ctl['form']>) => void }) {
  const days = f.extra_days;
  const update = (i: number, patch: Partial<(typeof days)[number]>) => set({ extra_days: days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const nextDate = () => {
    const last = [f.date, ...days.map((d) => d.date)].filter(Boolean).sort().at(-1);
    if (!last) return '';
    const d = new Date(`${last}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  return (
    <div className="space-y-2">
      {days.map((d, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
          <div className="grid gap-1">
            <Label htmlFor={`extra-day-${i}`} className="text-xs">Day {i + 2}</Label>
            <Input id={`extra-day-${i}`} type="date" value={d.date} min={f.date || undefined} onChange={(e) => update(i, { date: e.target.value })} className="w-auto" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`extra-start-${i}`} className="text-xs">Starts</Label>
            <Input id={`extra-start-${i}`} type="time" value={d.start_time} onChange={(e) => update(i, { start_time: e.target.value })} className="w-28" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`extra-end-${i}`} className="text-xs">Ends</Label>
            <Input id={`extra-end-${i}`} type="time" value={d.end_time} onChange={(e) => update(i, { end_time: e.target.value })} className="w-28" />
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove day ${i + 2}`} onClick={() => set({ extra_days: days.filter((_, j) => j !== i) })}><X /></Button>
        </div>
      ))}
      {days.length < 13 && (
        <Button type="button" variant="outline" size="sm" disabled={!f.date}
          onClick={() => set({ extra_days: [...days, { date: nextDate(), start_time: f.start_time, end_time: f.end_time }] })}>
          <Plus /> Add another day
        </Button>
      )}
      {days.length > 0 && <p className="text-xs text-muted-foreground">Each day is saved as its own event with the same details.</p>}
    </div>
  );
}

/** "Who's it for": the whole team, or members of the picked roles. */
function AttendeeRoles({ value, onChange, open }: { value: number[]; onChange: (ids: number[]) => void; open: boolean }) {
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    apiFetch('/api/roles').then((r) => (r.ok ? r.json() : [])).then((d) => { if (live && Array.isArray(d)) setRoles(d.map((r: any) => ({ id: Number(r.id), name: String(r.name) }))); }).catch(() => {});
    return () => { live = false; };
  }, [open]);
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="grid gap-2">
      <Label>Who's it for</Label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who the event is for">
        <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])}
          className={cn('rounded-full border px-2.5 py-1 text-xs', value.length === 0 ? 'border-accent bg-accent/15' : 'border-border text-muted-foreground hover:bg-muted')}>
          Whole team
        </button>
        {roles.map((r) => (
          <button key={r.id} type="button" aria-pressed={value.includes(r.id)} onClick={() => toggle(r.id)}
            className={cn('rounded-full border px-2.5 py-1 text-xs', value.includes(r.id) ? 'border-accent bg-accent/15' : 'border-border text-muted-foreground hover:bg-muted')}>
            {r.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The event sheet's RSVP: your answer, the counts, and who answered. */
function RsvpSection({ event }: { event: any }) {
  const [who, setWho] = useState<{ answers: { member_id: number; name: string; status: string; reason?: string }[]; no_answer: number } | null>(null);
  const load = () => {
    apiFetch(`/api/events/${event.id}/rsvps`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && Array.isArray(d.answers)) setWho(d); }).catch(() => {});
  };
  useEffect(load, [event.id, event.rsvp_counts?.going, event.rsvp_counts?.maybe, event.rsvp_counts?.not_going]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section aria-label="RSVP" className="space-y-3">
      <Separator />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>RSVP</Label>
        <span className="text-xs text-muted-foreground">{rsvpCountsText(event)}{who && who.no_answer > 0 ? ` · ${who.no_answer} no answer yet` : ''}</span>
      </div>
      {event.invited === false
        ? <p className="text-sm text-muted-foreground">This event is for other roles.</p>
        : <RsvpButtons event={event} onChanged={load} />}
      {who && who.answers.length > 0 && (
        <ul className="space-y-1 text-sm">
          {who.answers.map((a) => (
            <li key={a.member_id} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{a.name}</span>
              <span className="text-muted-foreground">{(RSVP_STATUS_LABELS as Record<string, string>)[a.status] ?? a.status}{a.reason ? ` — ${a.reason}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
