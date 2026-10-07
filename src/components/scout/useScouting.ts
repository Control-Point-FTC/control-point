// Manual scouting on this device (audit H-4). Every save lands in a local
// outbox first, so scouting keeps working with bad or no Wi-Fi at an event;
// the outbox syncs whenever the app is online.
//
// The outbox belongs to one member in one workspace: each queued entry is
// its own storage key (`cp-scout-q:<workspace>:<member>:<uuid>`), so two
// tabs never overwrite each other's work, and only the signed-in member's
// own entries are ever sent with their session. A queued entry leaves the
// outbox only once the exact version that was sent has been accepted.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { summarizeScouting, type ScoutEntry } from '../../utils/scouting';

const qPrefix = (teamId: number, memberId: number) => `cp-scout-q:${teamId}:${memberId}:`;
const cacheKey = (teamId: number, season: number) => `cp-scout-cache:${teamId}:${season}`;
const RETRY_MS = 30_000;

function readQueue(prefix: string): ScoutEntry[] {
  const out: ScoutEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try { out.push(JSON.parse(localStorage.getItem(k) || 'null')); } catch { /* skip a corrupt item */ }
    }
  } catch { /* storage unavailable */ }
  return out.filter(Boolean);
}

function readCache(key: string): ScoutEntry[] {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; }
}

export function newScoutId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC 4122 v4 fallback for older browsers.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

/** Thrown by save() when this device can't store the entry (storage full or blocked). */
export class ScoutStorageError extends Error {}

export function useScouting({ teamId, memberId, season }: { teamId: number | null | undefined; memberId: number | null | undefined; season: number }) {
  const ready = !!teamId && !!memberId;
  const prefix = ready ? qPrefix(teamId!, memberId!) : '';
  const [server, setServer] = useState<ScoutEntry[]>([]);
  const [queue, setQueue] = useState<ScoutEntry[]>([]);
  const [state, setState] = useState<SyncState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const syncing = useRef(false);
  const retryTimer = useRef<number | null>(null);
  // Bumped whenever the workspace, member or season changes or the view
  // closes: a sync started for the old one stops instead of continuing.
  const gen = useRef(0);

  const reloadQueue = useCallback(() => setQueue(ready ? readQueue(prefix) : []), [ready, prefix]);

  useEffect(() => {
    setServer(ready ? readCache(cacheKey(teamId!, season)) : []);
    reloadQueue();
  }, [ready, teamId, season, reloadQueue]);

  const sync = useCallback(async () => {
    if (!ready || syncing.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState('offline'); return; }
    const my = gen.current;
    const ctrl = new AbortController();
    const stale = () => my !== gen.current;
    syncing.current = true;
    setState('syncing');
    let moreToSend = false;
    try {
      const pending = readQueue(prefix).slice(0, 200);
      let body: any;
      if (pending.length) {
        const res = await apiFetch('/api/scouting/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season, entries: pending }),
          signal: ctrl.signal,
        });
        if (stale()) return;
        body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Sync failed');
        const sent = new Map(pending.map((e) => [e.uuid, e.updatedAt]));
        for (const r of body.results || []) {
          // Accepted or permanently refused: drop it — but only if nobody
          // edited it again on this device while it was on its way.
          if (!r.ok) setLastError(r.error || 'Some entries were not saved');
          try {
            const k = prefix + r.uuid;
            const now = JSON.parse(localStorage.getItem(k) || 'null');
            if (now && now.updatedAt === sent.get(r.uuid)) localStorage.removeItem(k);
          } catch { /* storage unavailable: it will be re-sent (idempotent) */ }
        }
        moreToSend = readQueue(prefix).length > 0;
      } else {
        const res = await apiFetch(`/api/scouting/entries?season=${season}`, { signal: ctrl.signal });
        if (stale()) return;
        body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load scouting');
      }
      if (stale()) return;
      if (Array.isArray(body.entries)) {
        setServer(body.entries);
        try { localStorage.setItem(cacheKey(teamId!, season), JSON.stringify(body.entries)); } catch { /* cache is optional */ }
      }
      reloadQueue();
      setState('idle');
    } catch (e: any) {
      if (stale()) return;
      setState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      setLastError(e?.message || 'Sync failed');
    } finally {
      syncing.current = false;
    }
    // Another full batch waiting after a successful one: keep going now.
    // After a failure the 30-second timer retries instead.
    if (moreToSend && !stale()) void sync();
  }, [ready, prefix, season, teamId, reloadQueue]);

  useEffect(() => {
    if (!ready) return;
    const my = ++gen.current;
    void sync();
    const kick = () => { if (my === gen.current) void sync(); };
    // Another tab changed this member's queue: show it.
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.startsWith(prefix)) reloadQueue(); };
    window.addEventListener('online', kick);
    window.addEventListener('scouting-changed', kick);
    window.addEventListener('storage', onStorage);
    retryTimer.current = window.setInterval(() => { if (readQueue(prefix).length) kick(); }, RETRY_MS);
    return () => {
      gen.current++;
      window.removeEventListener('online', kick);
      window.removeEventListener('scouting-changed', kick);
      window.removeEventListener('storage', onStorage);
      if (retryTimer.current) window.clearInterval(retryTimer.current);
    };
  }, [ready, prefix, sync, reloadQueue]);

  /** Save (create or edit) on this device first, then sync. Throws ScoutStorageError if it can't be stored. */
  const save = useCallback((e: Omit<ScoutEntry, 'updatedAt' | 'uuid'> & { uuid?: string }) => {
    if (!ready) throw new ScoutStorageError('Join a workspace first');
    const entry: ScoutEntry = { ...e, uuid: e.uuid || newScoutId(), updatedAt: Date.now() };
    try {
      localStorage.setItem(prefix + entry.uuid, JSON.stringify(entry));
    } catch {
      throw new ScoutStorageError('This device couldn’t store the entry (storage is full or blocked). It was not saved.');
    }
    reloadQueue();
    void sync();
    return entry;
  }, [ready, prefix, reloadQueue, sync]);

  const remove = useCallback((e: ScoutEntry) => save({ ...e, deleted: true }), [save]);

  // What to show: the server list with this device's unsynced edits on top.
  const entries = useMemo(() => {
    const byId = new Map<string, ScoutEntry>();
    for (const e of server) byId.set(e.uuid, e);
    for (const e of queue) if (e.season === season) byId.set(e.uuid, { ...byId.get(e.uuid), ...e });
    return [...byId.values()].filter((e) => !e.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [server, queue, season]);

  const summary = useMemo(() => summarizeScouting(entries), [entries]);

  return { entries, summary, pending: queue.length, state, lastError, clearError: () => setLastError(null), save, remove, sync };
}
