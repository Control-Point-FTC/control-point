// Modern Calendar (phase 4b). Rebuilt on the shadcn kit over the shared
// useCalendarController (same endpoints, permission and optimistic updates as
// Legacy). Views: Month (days are buttons, "+N more" popover), Week, Agenda
// (default on phones). Everyone can open an event's details; only calendar
// managers can create, edit or delete. Dates use the browser locale.
import { createContext, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Eye, List, MapPin, Pencil, Plus, Rows3, Trash2 } from 'lucide-react';
import { useContextMenu } from '../../../components/contextmenu/ContextMenuProvider';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Popover, PopoverContent, PopoverTrigger, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { useCalendarController, toDateKey, EVENT_TYPES } from '../../../components/calendar/useCalendarController';
import { Page, PageHeader, EmptyState, Section } from '../../ui/page';
import { EventEditorSheet, EventViewSheet, keyToDate, localTime, timeRange, typeMeta } from './CalendarSheets';

type View = 'month' | 'week' | 'agenda';

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d: Date) => addDays(d, -d.getDay());

export function CalendarPage(props: any) {
  const { events, setEvents, teams, refresh, currentUser, hasScope } = props;
  const ctl = useCalendarController({ events, setEvents, refresh, currentUser, hasScope });
  const narrow = useIsNarrow();
  const [view, setView] = useState<View>(() => (narrow ? 'agenda' : 'month'));
  const [types, setTypes] = useState<string[]>([]); // empty = all types
  const [selected, setSelected] = useState<string>(ctl.todayKey);
  const [viewId, setViewId] = useState<number | string | null>(null);
  const [dragging, setDragging] = useState<number | string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const actions: CalendarActions = {
    canManage: !!ctl.canManageCalendar,
    newOn: (k) => { setSelected(k); ctl.openNew(k); },
    edit: (e) => { setViewId(null); ctl.openEdit(e); },
    move: (id, k) => void ctl.moveEvent(id, k),
    dragging, setDragging, over, setOver,
  };
  const eventById = (id: string | undefined) => (events || []).find((e: any) => String(e.id) === id);
  const dayLabel = (k: string) => keyToDate(k).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  // Right-click a day or an event.
  useContextMenu('calendar-day', (el) => {
    const k = el.dataset.cmId;
    if (!k) return null;
    return [
      ...(ctl.canManageCalendar ? [{ label: `New event on ${dayLabel(k)}`, icon: Plus, action: () => actions.newOn(k) }] : []),
      { label: 'Show this day', icon: CalendarDays, action: () => setSelected(k) },
    ];
  });
  useContextMenu('calendar-event', (el) => {
    const e = eventById(el.dataset.cmId);
    if (!e) return null;
    return [
      { label: 'Open', icon: Eye, action: () => setViewId(e.id) },
      ...(ctl.canManageCalendar && !String(e.id).startsWith('temp-') ? [
        { label: 'Edit', icon: Pencil, action: () => actions.edit(e) },
        { separator: true },
        { label: 'Delete', icon: Trash2, danger: true, action: () => void ctl.deleteEvent(e.id, e.title) },
      ] : []),
    ];
  });
  const [dir, setDir] = useState(0);
  const { cursor, setCursor, todayKey } = ctl;

  const show = (e: any) => types.length === 0 || types.includes(e.event_type || 'other');
  const dayEvents = (key: string) => (ctl.byDate[key] || []).filter(show);
  const viewEvent = viewId == null ? null : events.find((e: any) => e.id === viewId) || null;

  const step = (n: number) => {
    setDir(n);
    if (view === 'week') setCursor(addDays(cursor, 7 * n));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  };
  const goToday = () => { setDir(0); setCursor(new Date()); setSelected(todayKey); };

  const title = view === 'week'
    ? weekLabel(startOfWeek(cursor))
    : cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const monthEventCount = useMemo(() => {
    const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    return events.filter((e: any) => String(e.date).startsWith(prefix)).length;
  }, [events, cursor]);

  const viewKey = `${view}-${view === 'week' ? toDateKey(startOfWeek(cursor)) : `${cursor.getFullYear()}-${cursor.getMonth()}`}`;

  return (
    <CalendarActionsCtx.Provider value={actions}>
    <Page>
      <PageHeader
        eyebrow="Calendar"
        title={title}
        description={`${monthEventCount} ${monthEventCount === 1 ? 'event' : 'events'} this month · meetings, competitions and deadlines`}
        actions={ctl.canManageCalendar && (
          <Button onClick={() => ctl.openNew(selected || todayKey)}><Plus /> New event</Button>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-border">
            <Button variant="ghost" size="icon" className="rounded-r-none" onClick={() => step(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'}><ChevronLeft /></Button>
            <Button variant="ghost" className="rounded-none border-x border-border" onClick={goToday}>Today</Button>
            <Button variant="ghost" size="icon" className="rounded-l-none" onClick={() => step(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'}><ChevronRight /></Button>
          </div>
          <ToggleGroup type="single" value={view} onValueChange={(v) => { if (v) setView(v as View); }} aria-label="Calendar view">
            <ToggleGroupItem value="month" aria-label="Month"><CalendarDays /> <span className="max-sm:sr-only">Month</span></ToggleGroupItem>
            <ToggleGroupItem value="week" aria-label="Week"><CalendarRange /> <span className="max-sm:sr-only">Week</span></ToggleGroupItem>
            <ToggleGroupItem value="agenda" aria-label="Agenda"><List /> <span className="max-sm:sr-only">Agenda</span></ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="multiple" value={types} onValueChange={setTypes} aria-label="Filter by type" className="flex-wrap sm:ml-auto">
            {EVENT_TYPES.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} size="sm" className="px-2.5 text-xs max-sm:h-10">
                <span className={cn('size-2 rounded-full', typeMeta(t.value).dot)} /> {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={viewKey}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {view === 'month' && (
                <MonthGrid
                  cursor={cursor} todayKey={todayKey} selected={selected} dayEvents={dayEvents}
                  onSelectDay={setSelected} onOpenEvent={(e) => setViewId(e.id)} isFinished={ctl.isEventFinished}
                />
              )}
              {view === 'week' && (
                <WeekColumns
                  start={startOfWeek(cursor)} todayKey={todayKey} dayEvents={dayEvents} isFinished={ctl.isEventFinished}
                  onOpenEvent={(e) => setViewId(e.id)} canManage={ctl.canManageCalendar} onAdd={ctl.openNew}
                />
              )}
              {view === 'agenda' && (
                <Agenda
                  cursor={cursor} todayKey={todayKey} dayEvents={dayEvents} isFinished={ctl.isEventFinished}
                  onOpenEvent={(e) => setViewId(e.id)} canManage={ctl.canManageCalendar} onAdd={ctl.openNew}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="space-y-8">
          {view === 'month' && (
            <Section
              title={keyToDate(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              action={ctl.canManageCalendar && (
                <Button variant="ghost" size="sm" onClick={() => ctl.openNew(selected)}><Plus /> Add</Button>
              )}
            >
              <EventList events={dayEvents(selected)} onOpen={(e) => setViewId(e.id)} isFinished={ctl.isEventFinished} empty="Nothing scheduled." />
            </Section>
          )}
          {/* On phones the Agenda already is the list. */}
          {!(narrow && view === 'agenda') && (
            <Section title="Next up" delay={0.05}>
              <EventList events={ctl.upcomingWhere(show)} onOpen={(e) => setViewId(e.id)} isFinished={ctl.isEventFinished} showDate empty={ctl.canManageCalendar ? 'No upcoming events. Add one with New event.' : 'No upcoming events.'} />
            </Section>
          )}
        </aside>
      </div>

      <EventViewSheet event={viewEvent} onOpenChange={(o) => { if (!o) setViewId(null); }} ctl={ctl} teams={teams} />
      {ctl.canManageCalendar && <EventEditorSheet ctl={ctl} teams={teams} />}
    </Page>
    </CalendarActionsCtx.Provider>
  );
}

// Direct manipulation (owner request): double-click a day to add an event
// there, double-click an event to edit it, right-click either for a menu, and
// drag an event onto another day to move it (only the date changes; times
// stay). Adding, editing and moving need the calendar permission; everyone
// can still open events.
interface CalendarActions {
  canManage: boolean;
  newOn: (dateKey: string) => void;
  edit: (e: any) => void;
  move: (id: number | string, dateKey: string) => void;
  dragging: number | string | null;
  setDragging: (id: number | string | null) => void;
  over: string | null;
  setOver: (k: string | null) => void;
}
const NO_ACTIONS: CalendarActions = {
  canManage: false, newOn: () => {}, edit: () => {}, move: () => {}, dragging: null, setDragging: () => {}, over: null, setOver: () => {},
};
const CalendarActionsCtx = createContext<CalendarActions>(NO_ACTIONS);
const DRAG_TYPE = 'application/x-cp-event';

/** Props that make a day (month cell, week column) a drop target and a
 *  double-click/right-click surface. */
function useDayProps(key: string) {
  const a = useContext(CalendarActionsCtx);
  return {
    'data-cm-type': 'calendar-day',
    'data-cm-id': key,
    onDoubleClick: a.canManage ? () => a.newOn(key) : undefined,
    onDragOver: a.canManage ? (ev: React.DragEvent) => {
      if (a.dragging == null) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      if (a.over !== key) a.setOver(key);
    } : undefined,
    onDragLeave: a.canManage ? () => { if (a.over === key) a.setOver(null); } : undefined,
    onDrop: a.canManage ? (ev: React.DragEvent) => {
      ev.preventDefault();
      const raw = ev.dataTransfer.getData(DRAG_TYPE) || (a.dragging != null ? String(a.dragging) : '');
      a.setOver(null);
      a.setDragging(null);
      if (!raw) return;
      const id = /^\d+$/.test(raw) ? Number(raw) : raw;
      a.move(id, key);
    } : undefined,
  };
}

/** Props that make an event draggable, double-click-to-edit and right-clickable. */
function useEventProps(e: any) {
  const a = useContext(CalendarActionsCtx);
  return {
    'data-cm-type': 'calendar-event',
    'data-cm-id': String(e.id),
    draggable: a.canManage && !String(e.id).startsWith('temp-'),
    onDragStart: a.canManage ? (ev: React.DragEvent) => {
      ev.stopPropagation();
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData(DRAG_TYPE, String(e.id));
      a.setDragging(e.id);
    } : undefined,
    onDragEnd: () => { a.setDragging(null); a.setOver(null); },
    onDoubleClick: a.canManage ? (ev: React.MouseEvent) => { ev.stopPropagation(); a.edit(e); } : undefined,
  };
}

function weekLabel(start: Date) {
  const end = addDays(start, 6);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  // formatRange collapses shared parts per locale ("Oct 4 – 10, 2026").
  return typeof (fmt as any).formatRange === 'function' ? (fmt as any).formatRange(start, end) : `${fmt.format(start)} – ${fmt.format(end)}`;
}

function weekdayNames(format: 'short' | 'narrow') {
  const sun = new Date(2024, 0, 7); // a Sunday
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i).toLocaleDateString(undefined, { weekday: format }));
}

function EventChip({ e, onOpen, finished }: { e: any; onOpen: (e: any) => void; finished: boolean }) {
  const meta = typeMeta(e.event_type);
  const dnd = useEventProps(e);
  const dragging = useContext(CalendarActionsCtx).dragging === e.id;
  return (
    <button
      type="button"
      {...dnd}
      onClick={(ev) => { ev.stopPropagation(); onOpen(e); }}
      className={cn(
        dnd.draggable && 'cursor-grab active:cursor-grabbing', dragging && 'opacity-40',
        'flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        meta.chip, finished && 'opacity-55',
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dot)} />
      <span className={cn('truncate', finished && 'line-through')}>{e.start_time ? `${localTime(e.start_time)} ` : ''}{e.title}</span>
    </button>
  );
}

function MonthGrid({ cursor, todayKey, selected, dayEvents, onSelectDay, onOpenEvent, isFinished }: {
  cursor: Date; todayKey: string; selected: string;
  dayEvents: (k: string) => any[]; onSelectDay: (k: string) => void; onOpenEvent: (e: any) => void; isFinished: (e: any) => boolean;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const short = weekdayNames('short');
  const narrowNames = weekdayNames('narrow');
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
        {short.map((d, i) => <div key={d + i} className="py-2"><span className="max-sm:hidden">{d}</span><span className="sm:hidden">{narrowNames[i]}</span></div>)}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label={cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
        {days.map((d, i) => {
          const key = toDateKey(d);
          const inMonth = d.getMonth() === month;
          const list = dayEvents(key);
          const isToday = key === todayKey;
          const isSel = key === selected;
          const shown = list.slice(0, 2);
          const more = list.length - shown.length;
          return (
            <MonthCell
              key={key}
              dateKey={key}
              className={cn(
                'group relative min-h-14 border-border p-1 sm:min-h-20 sm:p-1.5 xl:min-h-28',
                i % 7 !== 6 && 'border-r', i < days.length - 7 && 'border-b',
                !inMonth && 'bg-muted/30',
                isSel && 'bg-accent/[0.06]',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(key)}
                aria-pressed={isSel}
                aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${list.length ? `, ${list.length} ${list.length === 1 ? 'event' : 'events'}` : ''}`}
                className="absolute inset-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <div className="pointer-events-none relative flex items-center justify-between">
                <span className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                  isToday ? 'bg-accent text-accent-ink' : inMonth ? 'text-foreground' : 'text-muted-foreground/60',
                )}>{d.getDate()}</span>
                {/* Narrow grids: dots instead of chips (the day list shows details). */}
                {list.length > 0 && (
                  <span className="flex gap-0.5 xl:hidden">
                    {list.slice(0, 3).map((e: any) => <span key={e.id} className={cn('size-1.5 rounded-full', typeMeta(e.event_type).dot)} />)}
                  </span>
                )}
              </div>
              <div className="relative mt-1 hidden space-y-0.5 xl:block">
                {shown.map((e: any) => <EventChip key={e.id} e={e} onOpen={onOpenEvent} finished={isFinished(e)} />)}
                {more > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                        +{more} more
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <p className="px-1.5 pb-1.5 text-xs font-medium text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                      <div className="space-y-1">
                        {list.map((e: any) => <EventChip key={e.id} e={e} onOpen={onOpenEvent} finished={isFinished(e)} />)}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </MonthCell>
          );
        })}
      </div>
    </div>
  );
}

/** A month-grid day: a drop target, double-click to add, right-click menu. */
function MonthCell({ dateKey, className, children }: { dateKey: string; className?: string; children: React.ReactNode }) {
  const props = useDayProps(dateKey);
  const over = useContext(CalendarActionsCtx).over === dateKey;
  return (
    <div role="gridcell" {...props} className={cn(className, over && 'bg-accent/15 ring-2 ring-inset ring-accent/50')}>
      {children}
    </div>
  );
}

function WeekColumns({ start, todayKey, dayEvents, isFinished, onOpenEvent, canManage, onAdd }: {
  start: Date; todayKey: string; dayEvents: (k: string) => any[]; isFinished: (e: any) => boolean;
  onOpenEvent: (e: any) => void; canManage: boolean; onAdd: (k: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid gap-3 sm:grid-cols-7 sm:gap-2">
      {days.map((d) => {
        const key = toDateKey(d);
        const list = dayEvents(key);
        const isToday = key === todayKey;
        return (
          <WeekDay key={key} dateKey={key} className={cn('flex min-h-0 flex-col rounded-xl border border-border bg-card p-2 sm:min-h-72', isToday && 'border-accent/50')}>
            <div className="mb-2 flex items-center justify-between gap-1 px-1">
              <span className="text-xs text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className={cn('flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums', isToday && 'bg-accent text-accent-ink')}>{d.getDate()}</span>
            </div>
            <div className="flex-1 space-y-1.5">
              {list.map((e: any) => (
                <WeekEvent key={e.id} e={e} done={isFinished(e)} onOpen={onOpenEvent} />
              ))}
              {list.length === 0 && <p className="px-1 text-xs text-muted-foreground/70 sm:hidden">Free</p>}
            </div>
            {canManage && (
              <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-muted-foreground" onClick={() => onAdd(key)} aria-label={`Add event on ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
                <Plus /> Add
              </Button>
            )}
          </WeekDay>
        );
      })}
    </div>
  );
}

function WeekDay({ dateKey, className, children }: { dateKey: string; className?: string; children: React.ReactNode }) {
  const props = useDayProps(dateKey);
  const over = useContext(CalendarActionsCtx).over === dateKey;
  return <div {...props} className={cn(className, over && 'bg-accent/10 ring-2 ring-accent/50')}>{children}</div>;
}

function WeekEvent({ e, done, onOpen }: { e: any; done: boolean; onOpen: (e: any) => void }) {
  const meta = typeMeta(e.event_type);
  const dnd = useEventProps(e);
  const dragging = useContext(CalendarActionsCtx).dragging === e.id;
  return (
    <button
      type="button"
      {...dnd}
      onClick={() => onOpen(e)}
      className={cn('w-full rounded-md border-l-2 bg-muted/50 px-2 py-1.5 text-left transition-colors hover:bg-muted', meta.bar, done && 'opacity-55',
        dnd.draggable && 'cursor-grab active:cursor-grabbing', dragging && 'opacity-40')}
    >
      <span className="block text-[11px] text-muted-foreground">{e.start_time ? localTime(e.start_time) : 'All day'}</span>
      <span className={cn('line-clamp-2 block text-xs font-medium break-words', done && 'line-through')}>{e.title}</span>
    </button>
  );
}

function Agenda({ cursor, todayKey, dayEvents, isFinished, onOpenEvent, canManage, onAdd }: {
  cursor: Date; todayKey: string; dayEvents: (k: string) => any[]; isFinished: (e: any) => boolean;
  onOpenEvent: (e: any) => void; canManage: boolean; onAdd: (k: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const n = new Date(year, month + 1, 0).getDate();
  const groups = Array.from({ length: n }, (_, i) => new Date(year, month, i + 1))
    .map((d) => ({ d, key: toDateKey(d), list: dayEvents(toDateKey(d)) }))
    .filter((g) => g.list.length > 0);
  if (!groups.length) {
    return (
      <EmptyState
        icon={Rows3}
        title="Nothing this month"
        description={canManage ? 'Add a meeting, competition or deadline.' : 'Check back later, or look at another month.'}
        action={canManage ? <Button variant="outline" onClick={() => onAdd(todayKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`) ? todayKey : toDateKey(new Date(year, month, 1)))}><Plus /> New event</Button> : undefined}
      />
    );
  }
  return (
    <ol className="space-y-6">
      {groups.map(({ d, key, list }) => {
        const isToday = key === todayKey;
        const past = key < todayKey;
        return (
          <li key={key} className={cn('grid grid-cols-[52px_1fr] gap-4', past && 'opacity-70')}>
            <div className="pt-1 text-center">
              <div className="text-[11px] font-medium uppercase text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div className={cn('mx-auto mt-0.5 flex size-9 items-center justify-center rounded-full text-lg font-semibold tabular-nums', isToday && 'bg-accent text-accent-ink')}>{d.getDate()}</div>
            </div>
            <div className="space-y-2">
              {list.map((e: any) => (
                <AgendaRow key={e.id} e={e} onOpen={onOpenEvent} finished={isFinished(e)} />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AgendaRow({ e, onOpen, finished, showDate }: { e: any; onOpen: (e: any) => void; finished: boolean; showDate?: boolean }) {
  const a = useContext(CalendarActionsCtx);
  const rowProps = {
    'data-cm-type': 'calendar-event', 'data-cm-id': String(e.id),
    onDoubleClick: a.canManage ? () => a.edit(e) : undefined,
  };
  const meta = typeMeta(e.event_type);
  return (
    <motion.button
      type="button"
      layout
      {...rowProps}
      onClick={() => onOpen(e)}
      whileHover={{ x: 2 }}
      className={cn('flex min-h-11 w-full items-start gap-3 rounded-xl border border-border border-l-[3px] bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', meta.bar)}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', finished && 'text-muted-foreground line-through')}>{e.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {showDate && <span>{keyToDate(e.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
          <span>{timeRange(e)}</span>
          {e.location && <span className="flex items-center gap-1"><MapPin className="size-3" />{e.location}</span>}
        </span>
      </span>
      <Badge variant="outline" className="shrink-0">{meta.label}</Badge>
    </motion.button>
  );
}

function EventList({ events, onOpen, isFinished, showDate, empty }: {
  events: any[]; onOpen: (e: any) => void; isFinished: (e: any) => boolean; showDate?: boolean; empty: string;
}) {
  if (!events.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2">
      {events.map((e) => <AgendaRow key={e.id} e={e} onOpen={onOpen} finished={isFinished(e)} showDate={showDate} />)}
    </div>
  );
}
