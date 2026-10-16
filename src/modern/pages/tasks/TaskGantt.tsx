// Timeline (Gantt) view of tasks: a bar from each task's start date to its due
// date (a single day when it has only one of them), on a day scale with a
// "today" line. Tasks with neither date are listed underneath. Click a bar to
// open the task. Read-only: dates are changed in the task itself.
import { useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button } from '../../../components/ui-kit';
import { isOpenStatus } from '../../../types/taskStatus';
import { STATUS_META } from './TaskSheets';

const DAY_W = 36;
const WEEKS = 6;

const day = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null);

/** A task's span on the calendar: start → due (one day when only one is set), or null. */
export function taskSpan(t: any): { from: Date; to: Date } | null {
  const s = day(t.start_date);
  const d = day(t.due_date);
  if (!s && !d) return null;
  const from = s ?? d!;
  const to = d ?? s!;
  return to < from ? { from: to, to: from } : { from, to };
}

export function TaskGantt({ tasks, onOpen, today = new Date() }: { tasks: any[]; onOpen: (id: number) => void; today?: Date }) {
  const [start, setStart] = useState(() => addDays(startOfWeek(today, { weekStartsOn: 1 }), -7));
  const days = useMemo(() => Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i)), [start]);
  const end = days[days.length - 1];
  const rows = useMemo(() => tasks
    .map((t) => ({ t, span: taskSpan(t) }))
    // Calendar days, not instants (dates are noon; the window ends at midnight of its last day).
    .filter((r) => r.span && differenceInCalendarDays(r.span.to, start) >= 0 && differenceInCalendarDays(r.span.from, end) <= 0)
    .sort((a, b) => a.span!.from.getTime() - b.span!.from.getTime() || a.span!.to.getTime() - b.span!.to.getTime()), [tasks, start, end]);
  const undated = tasks.filter((t) => !taskSpan(t));
  const [undatedShown, setUndatedShown] = useState(60);
  const todayIdx = differenceInCalendarDays(today, start);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" aria-label="Earlier" onClick={() => setStart((s) => addDays(s, -14))}><ChevronLeft /></Button>
        <Button size="sm" variant="outline" onClick={() => setStart(addDays(startOfWeek(today, { weekStartsOn: 1 }), -7))}>Today</Button>
        <Button size="sm" variant="outline" aria-label="Later" onClick={() => setStart((s) => addDays(s, 14))}><ChevronRight /></Button>
        <span className="text-sm text-muted-foreground">{format(start, 'MMM d')} – {format(end, 'MMM d, yyyy')}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="relative" style={{ width: 240 + days.length * DAY_W }}>
          {/* Day scale */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-card text-[11px] text-muted-foreground">
            <div className="w-60 shrink-0 border-r border-border px-3 py-2 font-medium text-foreground">Task</div>
            {days.map((d, i) => (
              <div key={i} className={cn('shrink-0 border-r border-border/50 py-1 text-center', (d.getDay() === 0 || d.getDay() === 6) && 'bg-muted/40')} style={{ width: DAY_W }}>
                {d.getDate() === 1 || i === 0 || d.getDay() === 1 ? <span className="block font-medium text-foreground">{format(d, 'MMM')}</span> : <span className="block">&nbsp;</span>}
                {format(d, 'd')}
              </div>
            ))}
          </div>
          {/* Today line */}
          {todayIdx >= 0 && todayIdx < days.length && (
            <div aria-hidden className="pointer-events-none absolute bottom-0 top-0 z-0 w-px bg-accent" style={{ left: 240 + todayIdx * DAY_W + DAY_W / 2 }} />
          )}
          <ul aria-label="Tasks on the timeline">
            {rows.map(({ t, span }) => {
              const from = Math.max(0, differenceInCalendarDays(span!.from, start));
              const to = Math.min(days.length - 1, differenceInCalendarDays(span!.to, start));
              const M = STATUS_META[t.status];
              const open = isOpenStatus(t.status);
              return (
                <li key={t.id} className="relative flex h-10 items-center border-b border-border/50 last:border-b-0">
                  <button type="button" onClick={() => onOpen(t.id)} className="w-60 shrink-0 truncate border-r border-border px-3 text-left text-sm hover:underline">{t.title}</button>
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    title={`${t.title}: ${format(span!.from, 'MMM d')}${span!.to > span!.from ? ` – ${format(span!.to, 'MMM d')}` : ''} · ${M?.label ?? t.status}`}
                    aria-label={`${t.title}, ${format(span!.from, 'MMM d')}${span!.to > span!.from ? ` to ${format(span!.to, 'MMM d')}` : ''}, ${M?.label ?? t.status}`}
                    className={cn(
                      'absolute h-6 rounded-md border px-2 text-left text-xs font-medium leading-6 shadow-sm',
                      t.status === 'done' ? 'border-success/40 bg-success/20 text-foreground'
                        : t.status === 'in-progress' ? 'border-chart-2/50 bg-chart-2/25 text-foreground'
                          : open ? 'border-border bg-muted text-foreground' : 'border-border bg-muted/40 text-muted-foreground line-through',
                    )}
                    style={{ left: 240 + from * DAY_W + 2, width: Math.max(DAY_W - 4, (to - from + 1) * DAY_W - 4) }}
                  >
                    {/* Short bars skip the title (it's in the left column). */}
                    {to - from >= 2 && <span className="block truncate">{t.title}</span>}
                  </button>
                </li>
              );
            })}
            {rows.length === 0 && <li className="px-3 py-6 text-sm text-muted-foreground">No dated tasks in these weeks.</li>}
          </ul>
        </div>
      </div>
      {undated.length > 0 && (
        <section aria-label="Tasks without dates">
          <h2 className="mb-2 text-sm font-medium">No dates yet <span className="text-muted-foreground">{undated.length}</span></h2>
          <ul className="flex flex-wrap gap-2">
            {undated.slice(0, undatedShown).map((t) => (
              <li key={t.id}><button type="button" onClick={() => onOpen(t.id)} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">{t.title}</button></li>
            ))}
            {undated.length > undatedShown && (
              <li><Button size="sm" variant="ghost" className="h-7" onClick={() => setUndatedShown((n) => n + 60)}>Show {Math.min(60, undated.length - undatedShown)} more</Button></li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
