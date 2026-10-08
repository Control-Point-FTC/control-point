// Multi-select for every list in the app (V3.5 "bulk control everywhere").
//
//   const sel = useSelection(visibleRows, (r) => r.id);
//   <SelectAllCheckbox sel={sel} label="Select all tasks" />
//   <RowCheckbox sel={sel} id={row.id} label={`Select ${row.title}`} />
//   <BulkBar sel={sel} noun="task" actions={[...]} />
//
// - Shift-click a row checkbox selects the range from the last one clicked.
// - Rows that leave the list (deleted, filtered out) drop out of the selection,
//   so an action never touches something you can no longer see.
// - Esc clears the selection; the bar is a labelled toolbar.
// Bulk actions call the existing per-row endpoints through runBulk, so every
// permission check, notification and live update stays exactly as it is for
// one row.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { Button, Checkbox } from '../../components/ui-kit';
import { confirmDialog, notify } from '../../components/dialog';
import { cn } from '../../components/cn';

export type RowId = string | number;

export interface Selection {
  /** Ids currently selected that are still in the list, in list order. */
  ids: RowId[];
  count: number;
  has: (id: RowId) => boolean;
  /** Toggle one row; `range` (shift-click) extends from the last toggled row. */
  toggle: (id: RowId, range?: boolean) => void;
  set: (ids: RowId[]) => void;
  toggleAll: () => void;
  clear: () => void;
  all: boolean;
  some: boolean;
  /** Every id in the list, in order (for select-all). */
  listIds: RowId[];
}

export function useSelection<T>(rows: readonly T[], getId: (row: T) => RowId): Selection {
  const listIds = useMemo(() => rows.map(getId), [rows, getId]);
  const [picked, setPicked] = useState<Set<RowId>>(() => new Set());
  const anchor = useRef<RowId | null>(null);

  // Drop ids whose rows are gone (deleted elsewhere, filtered, workspace switch).
  useEffect(() => {
    setPicked((cur) => {
      if (!cur.size) return cur;
      const live = new Set(listIds);
      let changed = false;
      const next = new Set<RowId>();
      for (const id of cur) { if (live.has(id)) next.add(id); else changed = true; }
      return changed ? next : cur;
    });
  }, [listIds]);

  const ids = useMemo(() => listIds.filter((id) => picked.has(id)), [listIds, picked]);
  const has = useCallback((id: RowId) => picked.has(id), [picked]);

  const toggle = useCallback((id: RowId, range = false) => {
    // Read the anchor now: the state updater runs later, after it moves.
    const from = anchor.current != null ? listIds.indexOf(anchor.current) : -1;
    const anchorId = anchor.current;
    setPicked((cur) => {
      const next = new Set(cur);
      const to = listIds.indexOf(id);
      if (range && from >= 0 && to >= 0) {
        // Range follows the anchor's state: extend a selection, or clear a run.
        const on = cur.has(anchorId!);
        const [a, b] = from < to ? [from, to] : [to, from];
        for (let i = a; i <= b; i++) { if (on) next.add(listIds[i]); else next.delete(listIds[i]); }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = id;
  }, [listIds]);

  const all = listIds.length > 0 && ids.length === listIds.length;
  const toggleAll = useCallback(() => {
    setPicked(all ? new Set() : new Set(listIds));
    anchor.current = null;
  }, [all, listIds]);
  const clear = useCallback(() => { setPicked(new Set()); anchor.current = null; }, []);
  const set = useCallback((next: RowId[]) => setPicked(new Set(next)), []);

  return { ids, count: ids.length, has, toggle, set, toggleAll, clear, all, some: ids.length > 0 && !all, listIds };
}

/** Header checkbox: checked when all are selected, a dash when some are. */
export function SelectAllCheckbox({ sel, label, className }: { sel: Selection; label: string; className?: string }) {
  return (
    <Checkbox
      aria-label={label}
      checked={sel.all ? true : sel.some ? 'indeterminate' : false}
      disabled={!sel.listIds.length}
      onCheckedChange={() => sel.toggleAll()}
      className={cn('max-sm:size-5', className)}
    />
  );
}

/**
 * One row's checkbox. Clicks never reach the row (so they don't open it);
 * shift-click selects a range. A 44px hit area on phones.
 */
export function RowCheckbox({ sel, id, label, className }: { sel: Selection; id: RowId; label: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center max-sm:-m-3 max-sm:p-3', className)}
      onClick={(e) => {
        e.stopPropagation();
        // The padding around the box is part of the target (44px on phones);
        // a click on the box itself is handled by the box.
        if (!(e.target as Element).closest('[data-slot="checkbox"]')) sel.toggle(id, e.shiftKey);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); }}
      data-row-checkbox
    >
      <Checkbox
        aria-label={label}
        checked={sel.has(id)}
        onClick={(e) => { e.preventDefault(); sel.toggle(id, e.shiftKey); }}
        className="max-sm:size-5"
      />
    </span>
  );
}

export interface BulkAction {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** Runs against the selected ids. Return false to keep the selection. */
  run: (ids: RowId[]) => Promise<void | boolean> | void | boolean;
  /** Hidden when false (e.g. no permission). */
  show?: boolean;
  /**
   * Renders instead of a button (e.g. a dropdown of statuses). Start the
   * work with `exec`: it holds the bar busy (so a second action can't
   * overlap the first) and clears the selection when it finishes.
   */
  render?: (ids: RowId[], busy: boolean, exec: (task: () => unknown) => void) => ReactNode;
}

/** Floating toolbar for the current selection. Esc clears it. */
export function BulkBar({ sel, noun, plural, actions, className }: {
  sel: Selection; noun: string; plural?: string; actions: BulkAction[]; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const open = sel.count > 0;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      // Leave Esc to an open dialog or menu.
      if (document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')) return;
      sel.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, sel]);

  const label = `${sel.count} ${sel.count === 1 ? noun : plural || `${noun}s`} selected`;
  // One action at a time: a ref, not just state, so two clicks in the same
  // tick can't both start.
  const running = useRef(false);
  const exec = async (task: () => unknown) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const keep = await task();
      if (keep !== false) sel.clear();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const go = (a: BulkAction) => exec(() => a.run(sel.ids));
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-print-hide
          role="toolbar"
          aria-label={label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18 }}
          className={cn(
            'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-border bg-popover/95 p-2 pl-4 shadow-xl backdrop-blur',
            'max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]',
            className,
          )}
        >
          <span className="mr-auto flex items-center gap-2 text-sm font-medium" aria-live="polite">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {label}
          </span>
          {actions.filter((a) => a.show !== false).map((a) => (
            a.render ? <span key={a.label}>{a.render(sel.ids, busy, (task) => { void exec(task); })}</span> : (
              <Button
                key={a.label}
                size="sm"
                variant={a.danger ? 'destructive' : 'outline'}
                disabled={busy}
                onClick={() => void go(a)}
                className="max-sm:h-11"
              >
                {a.icon}{a.label}
              </Button>
            )
          ))}
          <Button size="icon-sm" variant="ghost" aria-label="Clear selection" disabled={busy} onClick={sel.clear} className="max-sm:size-11"><X /></Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Run one request per id (a few at a time) and report the outcome once.
 * `request` resolves true on success. Returns the ids that succeeded.
 */
export async function runBulk(ids: RowId[], request: (id: RowId) => Promise<boolean>, opts: {
  verb: string; noun: string; plural?: string; concurrency?: number;
}): Promise<RowId[]> {
  const ok: RowId[] = [];
  let failed = 0;
  const queue = [...ids];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()!;
      try { if (await request(id)) ok.push(id); else failed++; } catch { failed++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, ids.length) }, worker));
  const n = (k: number) => `${k} ${k === 1 ? opts.noun : opts.plural || `${opts.noun}s`}`;
  if (failed && ok.length) notify(`${opts.verb} ${n(ok.length)}; ${failed} couldn't be changed. Try those again.`, 'error');
  else if (failed) notify(`Couldn't ${opts.verb.toLowerCase()} ${n(failed)}. Try again.`, 'error');
  else notify(`${opts.verb} ${n(ok.length)}`, 'success');
  return ok;
}

/** Confirm, then delete each id with `request`. */
export async function bulkDelete(ids: RowId[], request: (id: RowId) => Promise<boolean>, opts: {
  noun: string; plural?: string; detail?: string;
}): Promise<RowId[] | false> {
  const n = `${ids.length} ${ids.length === 1 ? opts.noun : opts.plural || `${opts.noun}s`}`;
  const ok = await confirmDialog({
    title: `Delete ${n}?`,
    message: opts.detail || `This permanently deletes ${n}. This can't be undone.`,
    confirmLabel: `Delete ${n}`,
    danger: true,
  });
  if (!ok) return false;
  return runBulk(ids, request, { verb: 'Deleted', noun: opts.noun, plural: opts.plural });
}
