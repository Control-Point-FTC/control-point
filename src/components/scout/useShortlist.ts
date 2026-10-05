// Workspace scouting shortlist for one season, with optimistic edits.
//
// Writes are serialized per season (one request in flight) so each server response
// reflects every earlier edit; edits still queued behind it are re-applied
// on top of that snapshot, so nothing pending flickers away. A season change
// starts a new epoch: the list is cleared and responses for the old season
// no longer touch the view — but its queued writes are still sent, since the
// user already saw them applied. A failed write rolls back to the server's
// list (plus any still-pending edits) and reports why.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShortlistEntry } from '../../types/ftcScout';
import { fetchShortlist, nextShortlistWrite, removeShortlistEntry, saveShortlistPatch } from '../../services/ftcScoutApi';
import { applyShortlistPatch, type ShortlistPatch } from '../../utils/shortlist';

/** Wait before re-reading the list after a timed-out write. */
const RECHECK_DELAY_MS = 4000;
const RECONCILE_TIMEOUT_MS = 10_000;

type Op = { apply: (list: ShortlistEntry[]) => ShortlistEntry[]; send: () => Promise<ShortlistEntry[]> };

export function useShortlist(season: number) {
  const [entries, setEntries] = useState<ShortlistEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const pending = useRef<Op[]>([]);
  // One write chain per season: an old season's slow write never holds up
  // the current season's edits.
  const chains = useRef(new Map<number, Promise<void>>());
  // Last list the server confirmed for the current season (rollback target).
  const confirmed = useRef<ShortlistEntry[]>([]);

  // Bumped whenever a server snapshot is applied, so a slower reconcile read
  // can't overwrite a newer write's response.
  const version = useRef(0);

  const withPending = (list: ShortlistEntry[]) => pending.current.reduce((l, op) => op.apply(l), list);

  /** Re-read the list after a failed or timed-out write (bounded, detached). */
  const reconcile = async (ep: number, delayMs: number, timedOut: boolean) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (ep !== epoch.current) return;
    const v = version.current;
    try {
      const list = await fetchShortlist(season, { timeoutMs: RECONCILE_TIMEOUT_MS });
      if (ep !== epoch.current || v !== version.current) return;
      version.current++;
      confirmed.current = list;
      setEntries(withPending(list));
      if (timedOut) setError(null); // the list now shows what the server actually has
    } catch {
      // Still unreachable: fall back to the last confirmed list.
      if (ep === epoch.current && timedOut && v === version.current) {
        setEntries(withPending(confirmed.current));
        setError("Couldn't confirm that change was saved — check your connection and refresh.");
      }
    }
  };

  useEffect(() => {
    const ep = ++epoch.current;
    pending.current = [];
    confirmed.current = [];
    setEntries([]);
    setLoaded(false);
    setError(null);
    fetchShortlist(season)
      .then((list) => { if (ep === epoch.current) { version.current++; confirmed.current = list; setEntries(withPending(list)); setLoaded(true); } })
      .catch((e) => { if (ep === epoch.current) setError(e instanceof Error ? e.message : 'Could not load the shortlist'); });
    return () => { epoch.current++; };
  }, [season]);

  const enqueue = useCallback((op: Op) => {
    const ep = epoch.current;
    pending.current.push(op);
    setEntries((l) => op.apply(l));
    const prev = chains.current.get(season) ?? Promise.resolve();
    const next = prev.then(async () => {
      try {
        const list = await op.send();
        if (ep !== epoch.current) return;
        pending.current = pending.current.filter((o) => o !== op);
        version.current++;
        confirmed.current = list;
        setEntries(withPending(list));
        setError(null);
      } catch (e) {
        if (ep !== epoch.current) return;
        pending.current = pending.current.filter((o) => o !== op);
        // A timed-out write may still commit on the server, so its outcome
        // is unknown: keep it shown and reconcile with a later reload.
        const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError';
        if (timedOut) {
          setError('Saving is taking longer than usual — checking whether it went through…');
        } else {
          setError(`${e instanceof Error ? e.message : 'Could not save the shortlist'} — that change wasn't saved.`);
          // Drop the failed edit now (last confirmed list + other pending
          // edits), then refresh from the server if it's reachable.
          setEntries(withPending(confirmed.current));
        }
        // Reconcile outside the write queue (later edits keep flowing).
        void reconcile(ep, timedOut ? RECHECK_DELAY_MS : 0, timedOut);
      }
    });
    chains.current.set(season, next);
  }, [season]);

  const patch = useCallback((p: Omit<ShortlistPatch, 'season'>) => {
    const full: ShortlistPatch = { ...p, season };
    const origin = nextShortlistWrite();
    const now = new Date().toISOString();
    enqueue({
      apply: (list) => {
        const i = list.findIndex((x) => x.teamNumber === p.teamNumber);
        const next = applyShortlistPatch(i === -1 ? null : list[i], full, now);
        return i === -1 ? [...list, next] : list.map((x, j) => (j === i ? next : x));
      },
      send: () => saveShortlistPatch(full, origin),
    });
  }, [season, enqueue]);

  const remove = useCallback((teamNumber: number) => {
    const origin = nextShortlistWrite();
    enqueue({ apply: (list) => list.filter((x) => x.teamNumber !== teamNumber), send: () => removeShortlistEntry(season, teamNumber, origin) });
  }, [season, enqueue]);

  return { entries, loaded, error, patch, remove };
}
