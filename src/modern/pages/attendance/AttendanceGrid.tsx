// Attendance grid (admins). Each cell is a button: click/Enter opens a status
// popover; with a cell focused, P/L/E/U/S set it directly, Backspace clears,
// and arrow keys move between cells. Column menus hide a date; "Meeting days"
// chooses which weekdays show.
import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, EyeOff, Loader2, MoreHorizontal, Settings2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger,
} from '../../../components/ui-kit';
import { parseLocalDate, type useAttendanceController } from '../../../components/attendance/useAttendanceController';
import { MemberAvatar } from '../tasks/AssigneePicker';
import { EmptyState } from '../../ui/page';
import { StatusLegend, StatusPicker, statusFromKey, statusLabel, statusStyle } from './status';

type Ctl = ReturnType<typeof useAttendanceController>;

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'long' }));

export function MeetingDaysMenu({ ctl }: { ctl: Ctl }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-sm:h-11"><Settings2 /> Meeting days</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Show these days</DropdownMenuLabel>
        {WEEKDAYS.map((name, idx) => (
          <DropdownMenuCheckboxItem
            key={idx}
            checked={!ctl.isWeekdayHidden(idx)}
            onCheckedChange={() => { void ctl.toggleWeekday(idx); }}
            onSelect={(e) => e.preventDefault()}
          >
            {name}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void ctl.unhideAll(); }}>Show every day</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void ctl.hideAll(); }}>Hide every day</DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{ctl.hiddenDates.length} dates hidden · showing {ctl.visibleDates.length}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AttendanceGrid({ ctl, members }: { ctl: Ctl; members: any[] }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [pos, setPos] = useState('0:0'); // roving tab stop
  const dates = ctl.visibleDates;
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const [pr, pc] = pos.split(':').map(Number);
  const tabStop = pr < members.length && pc < dates.length ? pos : '0:0';

  const focusCell = (r: number, c: number) => {
    const el = tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}:${c}"]`);
    el?.focus();
  };

  const onCellKey = (e: React.KeyboardEvent, r: number, c: number, memberId: number, date: string) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dr, dc] = moves[e.key];
      focusCell(Math.max(0, Math.min(members.length - 1, r + dr)), Math.max(0, Math.min(dates.length - 1, c + dc)));
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const s = statusFromKey(e.key);
    if (s) {
      e.preventDefault();
      void ctl.setStatus(memberId, date, s);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border">
          <Button variant="ghost" size="icon" className="rounded-r-none max-sm:size-11" aria-label="Earlier dates" disabled={ctl.calendarStart === 0} onClick={() => ctl.setCalendarStart(Math.max(0, ctl.calendarStart - 1))}><ChevronLeft /></Button>
          <span className="min-w-36 border-x border-border px-3 text-center text-sm font-medium tabular-nums max-sm:leading-[44px] sm:leading-9">{ctl.rangeLabel}</span>
          <Button variant="ghost" size="icon" className="rounded-l-none max-sm:size-11" aria-label="Later dates" disabled={!ctl.hasMoreDates} onClick={() => ctl.setCalendarStart(ctl.calendarStart + 1)}><ChevronRight /></Button>
        </div>
        <span className="flex h-6 items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
          {ctl.savingStatus === 'saving' && <><Loader2 className="size-3.5 animate-spin" /> Saving…</>}
          {ctl.savingStatus === 'saved' && <><Check className="size-3.5 text-success" /> Saved</>}
        </span>
        <div className="ml-auto"><MeetingDaysMenu ctl={ctl} /></div>
      </div>

      {members.length === 0 ? (
        <EmptyState title="No members yet" description="Invite your team to start taking attendance." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table ref={tableRef} className="w-full border-separate border-spacing-0 text-sm" aria-label="Attendance grid">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-28 sm:min-w-40 border-b border-border bg-card px-4 py-2 text-left text-xs font-medium text-muted-foreground">Member</th>
                {dates.map((d) => {
                  const dt = parseLocalDate(d);
                  const isToday = d === todayKey;
                  return (
                    <th key={d} scope="col" className="border-b border-border px-1 py-1.5 text-center font-normal">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn('group mx-auto flex flex-col items-center rounded-md px-1.5 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isToday && 'text-accent')}
                            aria-label={`${dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} options`}
                          >
                            <span className="text-[10px] uppercase text-muted-foreground">{dt.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                            <span className={cn('text-sm font-semibold tabular-nums', isToday && 'text-accent')}>{dt.getDate()}</span>
                            <MoreHorizontal className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center">
                          <DropdownMenuLabel>{dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => { void ctl.hideDate(d); }}><EyeOff /> Hide this date</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {members.map((m: any, r: number) => (
                <tr key={m.id} className="group/row">
                  <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-4 py-1.5 text-left font-medium group-hover/row:bg-muted/40 group-last/row:border-b-0">
                    <span className="flex items-center gap-2"><MemberAvatar member={m} className="size-6 border-0" /><span className="truncate">{m.name}</span></span>
                  </th>
                  {dates.map((d, c) => {
                    const status = ctl.getStatus(m.id, d);
                    const key = `${m.id}|${d}`;
                    return (
                      <td key={d} className="border-b border-border px-1 py-1 text-center group-hover/row:bg-muted/40 group-last/row:border-b-0">
                        <Popover open={openCell === key} onOpenChange={(o) => setOpenCell(o ? key : null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              data-cell={`${r}:${c}`}
                              tabIndex={tabStop === `${r}:${c}` ? 0 : -1}
                              onFocus={() => setPos(`${r}:${c}`)}
                              onKeyDown={(e) => onCellKey(e, r, c, m.id, d)}
                              aria-label={`${m.name}, ${parseLocalDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${statusLabel(status)}`}
                              className={cn(
                                'mx-auto flex size-9 max-sm:size-11 items-center justify-center rounded-md text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card active:scale-90',
                                statusStyle(status).cell,
                                status === '-' && 'bg-muted/50 text-muted-foreground/60 hover:bg-muted',
                              )}
                            >
                              {status === '-' ? '·' : status}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" align="center">
                            <p className="mb-2 px-0.5 text-xs text-muted-foreground">{m.name} · {parseLocalDate(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                            <StatusPicker value={status} size="sm" autoFocus onPick={(s) => { setOpenCell(null); void ctl.setStatus(m.id, d, s); }} />
                          </PopoverContent>
                        </Popover>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusLegend />
        <p className="text-xs text-muted-foreground max-sm:hidden">Tip: focus a cell and press P, L, E, U or S · Backspace clears · arrows move</p>
      </div>
    </div>
  );
}
