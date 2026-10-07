// Manual scouting on this device (audit H-4). Every save lands in a local
// outbox first, so scouting keeps working with bad or no Wi-Fi at an event;
// the outbox syncs whenever the app is online (on save, when the connection
// comes back, and every 30 s while anything is waiting). The last list the
// server sent is cached per workspace + season so it shows offline too.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { summarizeScouting, type ScoutEntry } from '../../utils/scouting';

const outboxKey = (teamId: number | string) => `cp-scout-outbox:${teamId}`;
const cacheKey = (teamId: number | string, season: number) => `cp-scout-cache:${teamId}:${season}`;

function readJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full / unavailable */ }
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

export function useScouting({ teamId, season }: { teamId: number | null | undefined; season: number }) {
  const tid = teamId ?? 'none';
  const [server, setServer] = useState<ScoutEntry[]>(() => readJSON(cacheKey(tid, season), []));
  const [outbox, setOutbox] = useState<ScoutEntry[]>(() => readJSON(outboxKey(tid), []));
  const [state, setState] = useState<SyncState>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const syncing = useRef(false);
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;

  // Workspace or season changed: load what this device has for it.
  useEffect(() => {
    setServer(readJSON(cacheKey(tid, season), []));
    setOutbox(readJSON(outboxKey(tid), []));
  }, [tid, season]);

  const persistOutbox = (next: ScoutEntry[]) => { outboxRef.current = next; setOutbox(next); writeJSON(outboxKey(tid), next); };

  const sync = useCallback(async () => {
    if (!teamId || syncing.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState('offline'); return; }
    syncing.current = true;
    setState('syncing');
    try {
      const pending = outboxRef.current.slice(0, 200);
      let body: any;
      if (pending.length) {
        const res = await apiFetch('/api/scouting/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season, entries: pending }),
        });
        body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Sync failed');
        // Accepted or permanently refused entries leave the outbox; a refused
        // one is reported once rather than retried forever.
        const done = new Set((body.results || []).map((r: any) => r.uuid));
        const refused = (body.results || []).filter((r: any) => !r.ok);
        if (refused.length) setLastError(refused[0].error || 'Some entries were not saved');
        persistOutbox(outboxRef.current.filter((e) => !done.has(e.uuid)));
      } else {
        const res = await apiFetch(`/api/scouting/entries?season=${season}`);
        body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load scouting');
      }
      if (Array.isArray(body.entries)) { setServer(body.entries); writeJSON(cacheKey(tid, season), body.entries); }
      setState('idle');
    } catch (e: any) {
      setState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      setLastError(e?.message || 'Sync failed');
    } finally {
      syncing.current = false;
    }
    // More than one batch waiting: keep going.
    if (outboxRef.current.length && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      setTimeout(() => { void sync(); }, 0);
    }
  }, [teamId, tid, season]);

  useEffect(() => {
    void sync();
    const online = () => void sync();
    const changed = () => void sync();
    window.addEventListener('online', online);
    window.addEventListener('scouting-changed', changed);
    const timer = window.setInterval(() => { if (outboxRef.current.length) void sync(); }, 30_000);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('scouting-changed', changed);
      window.clearInterval(timer);
    };
  }, [sync]);

  /** Save (create or edit) on this device first, then sync. */
  const save = useCallback((e: Omit<ScoutEntry, 'updatedAt' | 'uuid'> & { uuid?: string }) => {
    const entry: ScoutEntry = { ...e, uuid: e.uuid || newScoutId(), updatedAt: Date.now() };
    persistOutbox([...outboxRef.current.filter((x) => x.uuid !== entry.uuid), entry]);
    void sync();
    return entry;
  }, [sync]);

  const remove = useCallback((e: ScoutEntry) => save({ ...e, deleted: true }), [save]);

  // What to show: the server list with this device's unsynced edits on top.
  const entries = useMemo(() => {
    const byId = new Map<string, ScoutEntry>();
    for (const e of server) byId.set(e.uuid, e);
    for (const e of outbox) if (e.season === season) byId.set(e.uuid, { ...byId.get(e.uuid), ...e });
    return [...byId.values()].filter((e) => !e.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [server, outbox, season]);

  const summary = useMemo(() => summarizeScouting(entries), [entries]);
  const pending = outbox.length;

  return { entries, summary, pending, state, lastError, clearError: () => setLastError(null), save, remove, sync };
}
