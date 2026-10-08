// Client data layer for the scouting features (Team Stats → Compete /
// Analyze). Same pattern as components/ftcCache.ts: 10-minute TTL (cleared on
// workspace switch / logout via clearScoutCache), plus in-flight de-duplication so Compete and Analyze
// (and several components on one screen) share a single request.
import { apiFetch } from './api';
import type { FtcEventFull, FtcTeamProfile, FtcTeamSearchHit, ShortlistEntry } from '../types/ftcScout';
import type { ShortlistPatch } from '../utils/shortlist';
import { getOfflinePack } from './offlinePack';
import { packEvent, packSearch, packTeamProfile } from '../utils/offlinePack';

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

/** Answers from the offline pack: returned, but never cached (the next try goes back to the network). */
const transient = new WeakSet<object>();
export const markTransient = <T extends object>(v: T): T => { transient.add(v); return v; };

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
          if (inflight.get(key) === p && !(typeof data === 'object' && data && transient.has(data))) store.set(key, { expiresAt: now() + ttlMs, data });
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

async function getJson<T>(url: string, signal?: AbortSignal, timeoutMs?: number): Promise<T> {
  const res = await apiFetch(url, { signal, timeoutMs });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ScoutHttpError(body?.error || `Request failed (${res.status})`, res.status);
  return body as T;
}

/**
 * No connection (or FTC data down): answer from the offline region pack when
 * it has the answer, otherwise fail as before. A real answer from the server
 * (404, 400) is never replaced.
 */
export function isOfflineFailure(e: unknown): boolean {
  return !(e instanceof ScoutHttpError) || e.status >= 502;
}
async function orOffline<T>(live: () => Promise<T>, offline: (pack: NonNullable<Awaited<ReturnType<typeof getOfflinePack>>>['pack']) => T | null): Promise<T> {
  try {
    return await live();
  } catch (e) {
    if (!isOfflineFailure(e)) throw e;
    const saved = await getOfflinePack();
    const hit = saved ? offline(saved.pack) : null;
    if (hit) { if (typeof hit === 'object') transient.add(hit); return hit; }
    throw e;
  }
}

/** A team's season profile. `number` omitted = the workspace's own team. */
export function fetchScoutTeam(season: number, number?: number | null, opts?: { force?: boolean }): Promise<FtcTeamProfile> {
  const key = `${number ?? 'me'}:${season}`;
  const q = new URLSearchParams({ season: String(season) });
  if (number) q.set('number', String(number));
  return teamCache.get(key, () => orOffline(
    () => getJson<FtcTeamProfile>(`/api/ftc/scout/team?${q}`),
    (pack) => (number ? packTeamProfile(pack, season, number) : null),
  ), opts);
}

export function peekScoutTeam(season: number, number?: number | null): FtcTeamProfile | null {
  return teamCache.peek(`${number ?? 'me'}:${season}`);
}

export function fetchScoutEvent(season: number, code: string, opts?: { force?: boolean }): Promise<FtcEventFull> {
  const key = `${season}:${code.toUpperCase()}`;
  return eventCache.get(key, () => orOffline(
    () => getJson<FtcEventFull>(`/api/ftc/scout/event?season=${season}&code=${encodeURIComponent(code)}`),
    (pack) => packEvent(pack, season, code),
  ), opts);
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
  return searchCache.get(`${season}:${term.toLowerCase()}`, () => orOffline(
    async () => (await getJson<{ results: FtcTeamSearchHit[] }>(`/api/ftc/scout/search?season=${season}&q=${encodeURIComponent(term)}`)).results || [],
    // Team names don't change between seasons: any pack answers a search.
    // Nothing in the pack: say search is down rather than "no such team".
    (pack) => { const hits = packSearch(pack, term); return hits.length ? hits : null; },
  ));
}

// ---- Scouting shortlist (server-persisted, shared by the workspace) ----

/** Writes are queued, so a hung request must fail rather than block the queue. */
const SHORTLIST_TIMEOUT_MS = 15_000;

// Write origin: a per-tab id plus a sequence that only goes up, so the server
// can ignore this tab's own older requests that arrive late (no clocks).
const CLIENT_ID = (() => {
  try { return crypto.randomUUID(); } catch { return `c-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`; }
})();
let writeSeq = 0;
/** Allocate the next write sequence (call when the edit is made, not sent). */
export function nextShortlistWrite(): { clientId: string; seq: number } {
  return { clientId: CLIENT_ID, seq: ++writeSeq };
}

export async function fetchShortlist(season: number, opts?: { timeoutMs?: number }): Promise<ShortlistEntry[]> {
  return (await getJson<{ entries: ShortlistEntry[] }>(`/api/ftc/shortlist?season=${season}`, undefined, opts?.timeoutMs)).entries || [];
}

/** Save a field-level shortlist edit; returns the workspace's whole list. */
export async function saveShortlistPatch(patch: ShortlistPatch, origin = nextShortlistWrite()): Promise<ShortlistEntry[]> {
  const res = await apiFetch('/api/ftc/shortlist', {
    method: 'PUT',
    timeoutMs: SHORTLIST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, ...origin }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ScoutHttpError(body?.error || 'Could not save to the shortlist', res.status);
  return body.entries || [];
}

export async function removeShortlistEntry(season: number, teamNumber: number, origin = nextShortlistWrite()): Promise<ShortlistEntry[]> {
  const q = new URLSearchParams({ season: String(season), team: String(teamNumber), clientId: origin.clientId, seq: String(origin.seq) });
  const res = await apiFetch(`/api/ftc/shortlist?${q}`, { method: 'DELETE', timeoutMs: SHORTLIST_TIMEOUT_MS });
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
