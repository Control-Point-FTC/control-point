// Attendance status styles (theme tokens) + the status picker used by the
// grid popover, Today's roll call and the History sheet.
import { cn } from '../../../components/cn';
import { STATUS_LABELS } from '../../../components/attendance/useAttendanceController';

export const STATUS_STYLE: Record<string, { cell: string; dot: string; soft: string }> = {
  P: { cell: 'bg-success text-background', dot: 'bg-success', soft: 'bg-success/12 text-success' },
  L: { cell: 'bg-warning text-background', dot: 'bg-warning', soft: 'bg-warning/12 text-warning' },
  E: { cell: 'bg-info text-background', dot: 'bg-info', soft: 'bg-info/12 text-info' },
  U: { cell: 'bg-destructive text-background', dot: 'bg-destructive', soft: 'bg-destructive/12 text-destructive' },
  S: { cell: 'bg-chart-4 text-background', dot: 'bg-chart-4', soft: 'bg-chart-4/12 text-chart-4' },
  '-': { cell: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/40', soft: 'bg-muted text-muted-foreground' },
};
export const statusStyle = (s?: string) => STATUS_STYLE[s || '-'] || STATUS_STYLE['-'];
export const statusLabel = (s?: string) => STATUS_LABELS[s || '-'] || s || 'Not marked';

/** Marked statuses in picker order (clearing is separate). */
export const PICK_STATUSES = ['P', 'L', 'E', 'U', 'S'] as const;

/** Keyboard shortcut → status for focused grid cells. */
export function statusFromKey(key: string): string | null {
  const k = key.toUpperCase();
  if ((PICK_STATUSES as readonly string[]).includes(k)) return k;
  if (key === 'Backspace' || key === 'Delete' || key === '0') return '-';
  return null;
}

export function StatusPill({ status, className }: { status?: string; className?: string }) {
  const st = statusStyle(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', st.soft, className)}>
      <span className={cn('size-1.5 rounded-full', st.dot)} /> {statusLabel(status)}
    </span>
  );
}

/** A row of status buttons; `value` is the current status ('-' = none). */
export function StatusPicker({ value, onPick, size = 'md', autoFocus }: {
  value: string; onPick: (s: string) => void; size?: 'sm' | 'md'; autoFocus?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Attendance status" className="flex flex-wrap gap-1">
      {PICK_STATUSES.map((s, i) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={statusLabel(s)}
            title={`${statusLabel(s)} (${s})`}
            autoFocus={autoFocus && (on || (value === '-' && i === 0))}
            onClick={() => onPick(on ? '-' : s)}
            className={cn(
              'flex items-center justify-center rounded-md font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95',
              size === 'sm' ? 'h-8 min-w-8 px-2 text-xs max-sm:h-11 max-sm:min-w-11' : 'h-9 min-w-9 px-2.5 text-sm max-sm:h-11 max-sm:min-w-11',
              on ? statusStyle(s).cell : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

export function StatusLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground', className)}>
      {PICK_STATUSES.map((s) => (
        <span key={s} className="flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', statusStyle(s).dot)} /> {statusLabel(s)} ({s})</span>
      ))}
    </div>
  );
}
