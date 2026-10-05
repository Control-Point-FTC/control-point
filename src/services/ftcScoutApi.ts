// Client data layer for the scouting features (Team Stats → Compete /
// Analyze). Same pattern as components/ftcCache.ts: 10-minute TTL (cleared on
// workspace switch / logout via clearScoutCache), plus in-flight de-duplication so Compete and Analyze
// (and several components on one screen) share a single request.
import { apiFetch } from './api';
import type { FtcEventFull, FtcTeamProfile, FtcTeamSearchHit, ShortlistEntry } from '../types/ftcScout';
import type { ShortlistPatch } from '../utils/shortlist';

export const SCOUT_TTL_MS = 10 * 60 * 1000;

export class ScoutHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ScoutHttpError';
    this.status = status;
  }
}

interface Entry<T> { expiresAt: number; data: T }

/** A keyed TTL cache with in-flight de-duplication. Exported for tests. */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now) {
  const store = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();
  return {
    peek(key: string): T | null {
      const hit = store.get(key);
      if (hit && hit.expiresAt > now()) return hit.data;
      if (hit) store.delete(key);
      return null;
    },
    async get(key: string, load: () => Promise<T>, opts?: { force?: boolean }): Promise<T> {
      if (!opts?.force) {
        const hit = this.peek(key);
        if (hit) return hit;
        const pending = inflight.get(key);
        if (pending) return pending;
      }
      const p: Promise<T> = load()
        .then((data) => {
          // A forced reload may have superseded this request; keep the newest.
          if (inflight.get(key) === p) store.set(key, { expiresAt: now() + ttlMs, data });
          return data;
        })
        .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
      inflight.set(key, p);
      return p;
    },
    invalidate(prefix?: string) {
      if (!prefix) { store.clear(); inflight.clear(); return; }
      for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
    },
    size: () => store.size,
  };
}

const teamCache = createTtlCache<FtcTeamProfile>(SCOUT_TTL_MS);
const eventCache = createTtlCache<FtcEventFull>(SCOUT_TTL_MS);
const searchCache = createTtlCache<FtcTeamSearchHit[]>(SCOUT_TTL_MS);

/** Called on team switch / logout. */
export function clearScoutCache(): void {
  teamCache.invalidate();
  eventCache.invalidate();
  searchCache.invalidate();
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await apiFetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ScoutHttpError(body?.error || `Request failed (${res.status})`, res.status);
  return body as T;
}

/** A team's season profile. `number` omitted = the workspace's own team. */
export function fetchScoutTeam(season: number, number?: number | null, opts?: { force?: boolean }): Promise<FtcTeamProfile> {
  const key = `${number ?? 'me'}:${season}`;
  const q = new URLSearchParams({ season: String(season) });
  if (number) q.set('number', String(number));
  return teamCache.get(key, () => getJson<FtcTeamProfile>(`/api/ftc/scout/team?${q}`), opts);
}

export function peekScoutTeam(season: number, number?: number | null): FtcTeamProfile | null {
  return teamCache.peek(`${number ?? 'me'}:${season}`);
}

export function fetchScoutEvent(season: number, code: string, opts?: { force?: boolean }): Promise<FtcEventFull> {
  const key = `${season}:${code.toUpperCase()}`;
  return eventCache.get(key, () => getJson<FtcEventFull>(`/api/ftc/scout/event?season=${season}&code=${encodeURIComponent(code)}`), opts);
}

export function peekScoutEvent(season: number, code: string): FtcEventFull | null {
  return eventCache.peek(`${season}:${code.toUpperCase()}`);
}

// No AbortSignal: the request is shared between callers through the cache,
// so one caller giving up must not fail the others. Callers ignore stale
// results themselves.
export async function searchScoutTeams(q: string, season: number): Promise<FtcTeamSearchHit[]> {
  const term = q.trim();
  if (term.length < 2 && !/^\d+$/.test(term)) return [];
  return searchCache.get(`${season}:${term.toLowerCase()}`, async () => {
    const body = await getJson<{ results: FtcTeamSearchHit[] }>(`/api/ftc/scout/search?season=${season}&q=${encodeURIComponent(term)}`);
    return body.results || [];
  });
}

// ---- Scouting shortlist (server-persisted, shared by the workspace) ----

/** Writes are queued, so a hung request must fail rather than block the queue. */
const SHORTLIST_TIMEOUT_MS = 15_000;

export async function fetchShortlist(season: number): Promise<ShortlistEntry[]> {
  return (await getJson<{ entries: ShortlistEntry[] }>(`/api/ftc/shortlist?season=${season}`)).entries || [];
}

/** Save a field-level shortlist edit; returns the workspace's whole list. */
export async function saveShortlistPatch(patch: ShortlistPatch): Promise<ShortlistEntry[]> {
  const res = await apiFetch('/api/ftc/shortlist', {
    method: 'PUT',
    timeoutMs: SHORTLIST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ScoutHttpError(body?.error || 'Could not save to the shortlist', res.status);
  return body.entries || [];
}

export async function removeShortlistEntry(season: number, teamNumber: number): Promise<ShortlistEntry[]> {
  const res = await apiFetch(`/api/ftc/shortlist?season=${season}&team=${teamNumber}`, { method: 'DELETE', timeoutMs: SHORTLIST_TIMEOUT_MS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ScoutHttpError(body?.error || 'Could not remove from the shortlist', res.status);
  return body.entries || [];
}

// ---- Recently viewed teams (per browser) ----

const RECENT_KEY = 'controlpoint-scout-recent';
export interface RecentTeam { number: number; name: string }

export function readRecentTeams(): RecentTeam[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((t) => t && Number.isInteger(t.number) && typeof t.name === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushRecentTeam(t: RecentTeam): RecentTeam[] {
  const next = [t, ...readRecentTeams().filter((r) => r.number !== t.number)].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}
