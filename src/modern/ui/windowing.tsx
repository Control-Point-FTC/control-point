// Long lists (audit Section 8: "no virtualization anywhere"; tasks, chat and
// inventory render every item into the DOM). Two tools:
//
// - useVirtualRows: true windowing for single-column lists and tables, over
//   the page's scroll container (#main). Short lists render as before.
// - useIncrementalGroups + LoadMore: for layouts that animate or drag between groups (task
//   board columns, card grids) — render the first chunk and add more as the
//   end scrolls into view.
//
// Both render everything while printing (Export → Print), so paper always
// gets the whole list.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

/** Lists at or below this many rows render without windowing. */
export const WINDOW_THRESHOLD = 60;

/** True while the browser is printing; set synchronously so the print
 *  snapshot already has every row. */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => flushSync(() => setPrinting(true));
    const off = () => setPrinting(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
  return printing;
}

function scrollParent(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('main');
}

export interface VirtualRows {
  /** Attach to the list/table body container (used to find its offset). */
  ref: React.RefObject<HTMLElement | null>;
  /** The rows to render now (all of them when windowing is off), each with
   *  props for its row element (measurement while windowed). */
  rows<T>(items: T[]): { item: T; index: number; rowProps: Record<string, unknown> }[];
  /** Space standing in for the rows above / below the window (0 when off). */
  paddingTop: number;
  paddingBottom: number;
  windowed: boolean;
}

/** Window a single-column list of `count` rows (variable heights are measured). */
export function useVirtualRows(count: number, estimate: number, threshold = WINDOW_THRESHOLD): VirtualRows {
  const ref = useRef<HTMLElement | null>(null);
  const printing = usePrinting();
  const enabled = count > threshold && !printing && !!scrollParent();
  // Where the list starts inside the scroll container.
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    if (!enabled) return;
    const main = scrollParent();
    const el = ref.current;
    if (!main || !el) return;
    const read = () => setMargin(el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(main);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  const v = useVirtualizer({
    count: enabled ? count : 0,
    getScrollElement: scrollParent,
    estimateSize: () => estimate,
    overscan: 8,
    scrollMargin: margin,
    // Before the first measurement, assume the window's height.
    initialRect: { width: 0, height: typeof window === 'undefined' ? 800 : window.innerHeight },
  });
  if (!enabled) {
    return {
      ref, windowed: false, paddingTop: 0, paddingBottom: 0,
      rows: (items) => items.map((item, index) => ({ item, index, rowProps: {} })),
    };
  }
  const vis = v.getVirtualItems();
  const total = v.getTotalSize();
  const first = vis[0];
  const last = vis[vis.length - 1];
  return {
    ref,
    windowed: true,
    paddingTop: first ? first.start - margin : 0,
    paddingBottom: last ? total - (last.end - margin) : 0,
    rows: (items) => vis.filter((vi) => vi.index < items.length).map((vi) => ({
      item: items[vi.index], index: vi.index, rowProps: { ref: v.measureElement, 'data-index': vi.index },
    })),
  };
}

/** Render the first `step` items of each group (a task-board column, a
 *  card grid), with more added by <LoadMore>. Everything while printing;
 *  limits reset when `resetKey` changes (a new filter or search). */
export function useIncrementalGroups(step = WINDOW_THRESHOLD, resetKey?: unknown) {
  const printing = usePrinting();
  const [limits, setLimits] = useState<Record<string, number>>({});
  useEffect(() => { setLimits({}); }, [resetKey]);
  return {
    slice<T>(key: string, items: T[]): T[] {
      return printing ? items : items.slice(0, limits[key] ?? step);
    },
    hidden(key: string, count: number): number {
      return printing ? 0 : Math.max(0, count - (limits[key] ?? step));
    },
    more(key: string) {
      setLimits((l) => ({ ...l, [key]: (l[key] ?? step) + step }));
    },
  };
}

/** Shown after a partial list: loads more as it scrolls near (or on click). */
export function LoadMore({ hidden, onMore, as: Tag = 'div', className }: { hidden: number; onMore: () => void; as?: 'div' | 'li'; className?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (!hidden || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
    }, { root: scrollParent(), rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hidden]);
  if (!hidden) return null;
  return (
    <Tag ref={ref as any} className={className ?? 'flex justify-center py-2'} data-print-hide>
      <button type="button" onClick={() => onMoreRef.current()} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        Show more ({hidden} left)
      </button>
    </Tag>
  );
}

/** A placeholder row keeping the scroll height of rows outside the window. */
export function Spacer({ height, as: Tag = 'tr', colSpan }: { height: number; as?: 'tr' | 'li'; colSpan?: number }) {
  if (height <= 0) return null;
  return Tag === 'tr'
    ? <tr aria-hidden="true" style={{ height }}><td colSpan={colSpan} style={{ padding: 0, border: 0 }} /></tr>
    : <li aria-hidden="true" style={{ height }} />;
}
