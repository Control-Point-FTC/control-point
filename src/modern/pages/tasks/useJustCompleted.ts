// Tasks that just became Done (drag, keyboard, menu, Bruno or a teammate's
// change over live sync), so the board can play a short completion flourish on
// them. The board stays mounted while cards move between columns, so it keeps
// the previous statuses here; the first render only records them.
import { useEffect, useRef, useState } from 'react';

export const CELEBRATE_MS = 1200;

export function useJustCompleted(tasks: { id: number; status?: string }[]): Set<number> {
  const prev = useRef<Map<number, string | undefined> | null>(null);
  const timers = useRef<Set<number>>(new Set());
  const [ids, setIds] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    const before = prev.current;
    prev.current = new Map(tasks.map((t) => [t.id, t.status]));
    if (!before) return;
    const fresh = tasks.filter((t) => t.status === 'done' && before.has(t.id) && before.get(t.id) !== 'done').map((t) => t.id);
    if (!fresh.length) return;
    setIds((s) => new Set([...s, ...fresh]));
    // Not cleared when the task list changes again: each flourish always ends.
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setIds((s) => {
        const next = new Set(s);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, CELEBRATE_MS);
    timers.current.add(timer);
  }, [tasks]);
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t); }, []);
  return ids;
}
