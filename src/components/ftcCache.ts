import { apiFetch } from '../services/api';
import type { FtcTeamPayload } from './FtcStats';

/**
 * Short-TTL in-memory cache for FTC team stats.
 *
 * The dashboard card and the /stats page each run their own `useFtcTeam`
 * instance; without this they each fetched `/api/ftc/team?season=…`
 * independently. Entries live for 10 minutes, are keyed by season (the
 * server scopes by the session's active team), and are dropped on team
 * switch via `clearFtcCache()`.
 */
const TTL_MS = 10 * 60 * 1000;

const cache = new Map<number, { expiresAt: number; data: FtcTeamPayload }>();

/** Thrown when the team has no FTC team connected (HTTP 404 + message). */
export class FtcNotConnectedError extends Error {
  constructor() {
    super('no ftc team connected');
    this.name = 'FtcNotConnectedError';
  }
}

export function getFtcCacheEntry(season: number): FtcTeamPayload | null {
  const hit = cache.get(season);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  if (hit) cache.delete(season);
  return null;
}

export function invalidateFtcSeason(season: number): void {
  cache.delete(season);
}

/** Called on team switch / logout — the server scopes by active team. */
export function clearFtcCache(): void {
  cache.clear();
}

/**
 * Fetches (or returns the cached) FTC payload for a season.
 * Only successful responses are cached; 404s and errors always re-fetch.
 */
export async function fetchFtcTeam(season: number, signal?: AbortSignal): Promise<FtcTeamPayload> {
  const cached = getFtcCacheEntry(season);
  if (cached) return cached;

  const res = await apiFetch(`/api/ftc/team?season=${season}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404 && /no ftc team connected/i.test(body?.error || '')) {
    throw new FtcNotConnectedError();
  }
  if (!res.ok) {
    throw new Error(body?.error || `FTC request failed (${res.status})`);
  }
  const data = body as FtcTeamPayload;
  cache.set(season, { expiresAt: Date.now() + TTL_MS, data });
  return data;
}
