// Workspace scouting shortlist for one season, with optimistic edits.
//
// Writes are serialized (one request in flight) so each server response
// reflects every earlier edit; edits still queued behind it are re-applied
// on top of that snapshot, so nothing pending flickers away. A season change
// starts a new epoch: the list is cleared, queued writes for the old season
// are dropped and late responses from it are ignored. A failed write rolls
// back to the server's list (plus any still-pending edits) and reports why.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShortlistEntry } from '../../types/ftcScout';
import { fetchShortlist, removeShortlistEntry, saveShortlistPatch } from '../../services/ftcScoutApi';
import { applyShortlistPatch, type ShortlistPatch } from '../../utils/shortlist';

type Op = { apply: (list: ShortlistEntry[]) => ShortlistEntry[]; send: () => Promise<ShortlistEntry[]> };

export function useShortlist(season: number) {
  const [entries, setEntries] = useState<ShortlistEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const pending = useRef<Op[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const withPending = (list: ShortlistEntry[]) => pending.current.reduce((l, op) => op.apply(l), list);

  useEffect(() => {
    const ep = ++epoch.current;
    pending.current = [];
    chain.current = Promise.resolve();
    setEntries([]);
    setLoaded(false);
    setError(null);
    fetchShortlist(season)
      .then((list) => { if (ep === epoch.current) { setEntries(withPending(list)); setLoaded(true); } })
      .catch((e) => { if (ep === epoch.current) setError(e instanceof Error ? e.message : 'Could not load the shortlist'); });
    return () => { epoch.current++; };
  }, [season]);

  const enqueue = useCallback((op: Op) => {
    const ep = epoch.current;
    pending.current.push(op);
    setEntries((l) => op.apply(l));
    chain.current = chain.current.then(async () => {
      if (ep !== epoch.current) return;
      try {
        const list = await op.send();
        if (ep !== epoch.current) return;
        pending.current = pending.current.filter((o) => o !== op);
        setEntries(withPending(list));
        setError(null);
      } catch (e) {
        if (ep !== epoch.current) return;
        pending.current = pending.current.filter((o) => o !== op);
        setError(`${e instanceof Error ? e.message : 'Could not save the shortlist'} — that change wasn't saved.`);
        try {
          const list = await fetchShortlist(season);
          if (ep === epoch.current) setEntries(withPending(list));
        } catch { /* keep the optimistic list; the error is already shown */ }
      }
    });
  }, [season]);

  const patch = useCallback((p: Omit<ShortlistPatch, 'season'>) => {
    const full: ShortlistPatch = { ...p, season };
    const now = new Date().toISOString();
    enqueue({
      apply: (list) => {
        const i = list.findIndex((x) => x.teamNumber === p.teamNumber);
        const next = applyShortlistPatch(i === -1 ? null : list[i], full, now);
        return i === -1 ? [...list, next] : list.map((x, j) => (j === i ? next : x));
      },
      send: () => saveShortlistPatch(full),
    });
  }, [season, enqueue]);

  const remove = useCallback((teamNumber: number) => {
    enqueue({ apply: (list) => list.filter((x) => x.teamNumber !== teamNumber), send: () => removeShortlistEntry(season, teamNumber) });
  }, [season, enqueue]);

  return { entries, loaded, error, patch, remove };
}
