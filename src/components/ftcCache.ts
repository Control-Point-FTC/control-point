import { apiFetch } from '../services/api';
import type { FtcTeamPayload } from './FtcStats';

/**
 * Short-TTL in-memory cache for FTC team stats.
 *
 * The dashboard card and the /stats page each run their own `useFtcTeam`
 * instance; without this they each fetched `/api/ftc/team?season=…`
 * independently. Entries live for 10 minutes and are keyed by team ID +
 * season to prevent cross-team data leaks on team switch.
 */
const TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; data: FtcTeamPayload }>();

/** Cache key: team ID + season. */
function cacheKey(teamId: string | number, season: number): string {
  return `${teamId}:${season}`;
}

/** Thrown when the team has no FTC team connected (HTTP 404 + message). */
export class FtcNotConnectedError extends Error {
  constructor() {
    super('no ftc team connected');
    this.name = 'FtcNotConnectedError';
  }
}

export function getFtcCacheEntry(teamId: string | number, season: number): FtcTeamPayload | null {
  const hit = cache.get(cacheKey(teamId, season));
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  if (hit) cache.delete(cacheKey(teamId, season));
  return null;
}

export function invalidateFtcSeason(season: number, teamId?: string | number): void {
  if (teamId != null) {
    cache.delete(cacheKey(teamId, season));
  } else {
    // Legacy: clear all entries for this season across teams
    for (const key of cache.keys()) {
      if (key.endsWith(`:${season}`)) cache.delete(key);
    }
  }
}

/** Called on team switch / logout — clears all cached entries. */
export function clearFtcCache(): void {
  cache.clear();
}

/**
 * Fetches (or returns the cached) FTC payload for a team + season.
 * Only successful responses are cached; 404s and errors always re-fetch.
 * The teamId ensures Team A's data is never served to Team B.
 * If teamId is not provided, falls back to season-only key (legacy behavior).
 */
export async function fetchFtcTeam(
  season: number,
  signal?: AbortSignal,
  teamId?: string | number
): Promise<FtcTeamPayload> {
  const key = teamId != null ? cacheKey(teamId, season) : season;
  const hit = cache.get(key as any);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  if (hit) cache.delete(key as any);

  const res = await apiFetch(`/api/ftc/team?season=${season}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404 && /no ftc team connected/i.test(body?.error || '')) {
    throw new FtcNotConnectedError();
  }
  if (!res.ok) {
    throw new Error(body?.error || `FTC request failed (${res.status})`);
  }
  const data = body as FtcTeamPayload;
  cache.set(key as any, { expiresAt: Date.now() + TTL_MS, data });
  return data;
}

export interface FtcMatchTeam { number: number; name: string }
export interface FtcMatch {
  num: number; label: string; level: string | null; series: number | null;
  played: boolean;
  red: FtcMatchTeam[]; blue: FtcMatchTeam[];
  redScore: number | null; blueScore: number | null;
  result: 'win' | 'loss' | 'tie' | null;
}
export interface FtcEventDetail {
  code: string; season: number; name: string;
  start: string | null; end: string | null; type: string | null;
  venue: string | null; city: string | null; state: string | null; country: string | null;
  timezone: string | null;
  rank: number | null; wins: number | null; losses: number | null; ties: number | null;
  oprNp: number | null; awards: string[];
  matches: FtcMatch[]; qualsCount: number; playoffsCount: number;
}

const eventCache = new Map<string, { expiresAt: number; data: FtcEventDetail }>();

/** Fetch a single event's detail (matches, alliances, scores). Cached 10 min. */
export async function fetchFtcEvent(
  season: number,
  code: string,
  signal?: AbortSignal
): Promise<FtcEventDetail> {
  const key = `${season}:${code}`;
  const hit = eventCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  if (hit) eventCache.delete(key);

  const res = await apiFetch(`/api/ftc/event?season=${season}&code=${encodeURIComponent(code)}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Event request failed (${res.status})`);
  const data = body as FtcEventDetail;
  eventCache.set(key, { expiresAt: Date.now() + TTL_MS, data });
  return data;
}
