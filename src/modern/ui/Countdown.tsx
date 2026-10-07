// A countdown that ticks every second (owner spec). One shared timer drives
// every countdown on the page; screen readers aren't sent a new number every
// second (the label updates, the region isn't live).
import { useEffect, useState } from 'react';
import { cn } from '../../components/cn';
import { formatCountdown } from '../../utils/countdown';

const listeners = new Set<() => void>();
let timer: number | null = null;
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (timer == null) timer = window.setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer != null) { window.clearInterval(timer); timer = null; }
  };
}

/** The current time, re-rendered every second. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(() => setNow(Date.now())), []);
  return now;
}

/** Re-render every 30 s (deadline-based counts flip without a reload). */
export function useHalfMinuteTick(): void {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
}

export function Countdown({ to, className, overdueLabel = 'Overdue by' }: { to: Date; className?: string; overdueLabel?: string }) {
  const now = useNow();
  const left = to.getTime() - now;
  const text = left >= 0 ? `in ${formatCountdown(left)}` : `${overdueLabel} ${formatCountdown(left)}`;
  return (
    <span role="timer" aria-live="off" className={cn('font-mono tabular-nums', left < 0 && 'text-destructive', className)}>
      {text}
    </span>
  );
}
