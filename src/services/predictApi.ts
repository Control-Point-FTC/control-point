// Client for /api/predict/* (Compete → Predict). Short TTL cache with
// in-flight de-duplication; the server caches too (2 min while an event is
// live, 10 min otherwise).
import { apiFetch } from './api';
import { createTtlCache, isOfflineFailure, markTransient } from './ftcScoutApi';
import { getOfflinePack } from './offlinePack';
import { packEvent } from '../utils/offlinePack';
import type { OfflineForecaster } from '../utils/offlineForecast';
import type { Forecast, Partners } from '../../server/predict/engine';
import type { LiveAccuracy } from '../../server/predict/monitor';

export type { Forecast, Partners, LiveAccuracy };
export type ForecastView = Forecast & {
  eventName: string; eventStart: string | null; eventEnd: string | null; myTeam: number | null;
  /**
   * Shown with no connection: worked out on this device from the offline pack
   * (`region` = the download), or the last forecast saved while online
   * (`region` null). `asOf` = when its data is from.
   */
  offline?: { asOf: string; region: string | null };
};

export interface PredictAccuracy {
  testSeason: string;
  matches: { count: number; liveAccuracy: number; liveBrier: number; preEventAccuracy: number; oprAccuracy: number; oprBrier: number; scoreRange80Coverage: number };
  advancement: {
    events: number;
    pre: { brier: number; calibrationError: number };
    quals: { brier: number; calibrationError: number };
    selected: { brier: number; calibrationError: number };
    matchesOnlyPre: { brier: number; calibrationError: number };
    naiveTopRanked: { brier: number };
    calibrationPre: { predicted: number; actual: number; n: number }[];
  };
  partners: { allianceWin: { brier: number; ece: number; n: number }; allianceWinGeneral: { brier: number; ece: number } } | null;
  pickTop3: number;
}

export interface PredictStatus { ready: boolean; readyAt: string | null; /** When the match data behind the ratings was last downloaded. */ dataAsOf?: string | null; syncError?: string | null; syncing: boolean; seasons: number[]; accuracy: PredictAccuracy; live?: LiveAccuracy | null }

/** Error with the HTTP status: 503 = warming up, 422 = event can't be forecast. */
export class PredictError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'PredictError'; }
}

const TTL = 2 * 60 * 1000;
const forecastCache = createTtlCache<ForecastView>(TTL);
const partnersCache = createTtlCache<Partners>(TTL);

async function getJson<T>(url: string): Promise<T> {
  return (await getJsonMeta<T>(url)).body;
}

/** `saved`: the service worker answered with its last saved copy (no connection). */
async function getJsonMeta<T>(url: string): Promise<{ body: T; saved: boolean }> {
  const res = await apiFetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PredictError(body?.error || `Request failed (${res.status})`, res.status);
  return { body: body as T, saved: res.headers?.get?.('X-CP-Saved-Copy') === '1' };
}

/** Stand-in error for "offline, the worker had only a saved copy". */
const SAVED_COPY = new TypeError('saved copy');

export const fetchPredictStatus = () => getJson<PredictStatus>('/api/predict/status');

/**
 * No connection: forecast on this device from the offline pack, when it has
 * the event and ratings. Answers aren't cached, so the next try goes back to
 * the server. A real answer from the server (422, 404) is never replaced.
 */
async function offlinePredict<T extends object>(err: unknown, season: number, code: string, run: (f: OfflineForecaster, ev: NonNullable<ReturnType<typeof packEvent>>, asOf: string, region: string, runs: number) => Promise<T | null> | T | null, newerThan?: string): Promise<T> {
  // PredictError 503 = the server is up but warming up: no offline answer for that.
  const offline = err instanceof PredictError ? err.status >= 502 && err.status !== 503 : isOfflineFailure(err);
  if (!offline) throw err;
  const saved = await getOfflinePack();
  const ev = saved?.pack.predict ? packEvent(saved.pack, season, code) : null;
  if (!saved || !ev) throw err;
  // A saved copy that's newer than the download stays.
  if (newerThan && Date.parse(saved.pack.dataAsOf || saved.pack.builtAt) <= Date.parse(newerThan)) throw err;
  // Loaded only when needed: the simulator stays out of the main bundle.
  const { offlineForecaster, OFFLINE_RUNS } = await import('../utils/offlineForecast');
  const f = offlineForecaster(saved.pack);
  if (!f) throw err;
  const out = await run(f, ev, saved.pack.dataAsOf || saved.pack.builtAt, saved.pack.regionName, OFFLINE_RUNS);
  if (!out) throw err;
  return markTransient(out);
}

export function fetchForecast(season: number, code: string, opts?: { force?: boolean; myTeam?: number | null }): Promise<ForecastView> {
  const onDevice = (e: unknown, newerThan?: string) => offlinePredict<ForecastView>(e, season, code, (f, ev, asOf, region, runs) => {
    const myTeam = opts?.myTeam ?? null;
    const fc = f.forecast(ev, myTeam, runs);
    return fc && { ...fc, eventName: ev.name, eventStart: ev.start, eventEnd: ev.end, myTeam, offline: { asOf, region } };
  }, newerThan);
  return forecastCache.get(`${season}:${code}`, async () => {
    let got: { body: ForecastView; saved: boolean };
    try { got = await getJsonMeta<ForecastView>(`/api/predict/event?season=${season}&code=${encodeURIComponent(code)}`); }
    catch (e) { return onDevice(e); }
    if (!got.saved) return got.body;
    // Offline, and the worker had a forecast saved while online: a newer
    // download wins; otherwise the saved one, labelled (and not cached).
    return onDevice(SAVED_COPY, got.body.generatedAt)
      .catch(() => markTransient({ ...got.body, offline: { asOf: got.body.generatedAt, region: null } }));
  }, opts);
}

export function fetchPartners(season: number, code: string, opts?: { force?: boolean; myTeam?: number | null }): Promise<Partners> {
  const onDevice = (e: unknown) => offlinePredict<Partners>(e, season, code, (f, ev) => (opts?.myTeam ? f.partners(ev, opts.myTeam) : null));
  // Keyed by our team too: an answer worked out before it was known must not be reused.
  return partnersCache.get(`${season}:${code}:${opts?.myTeam ?? 0}`, async () => {
    let got: { body: Partners; saved: boolean };
    try { got = await getJsonMeta<Partners>(`/api/predict/partners?season=${season}&code=${encodeURIComponent(code)}`); }
    catch (e) { return onDevice(e); }
    if (!got.saved) return got.body;
    // Offline with a saved copy: worked out from the download when there is one.
    return onDevice(SAVED_COPY).catch(() => markTransient(got.body));
  }, opts);
}

/** Workspace switch / logout. */
export function clearPredictCache(): void {
  forecastCache.invalidate();
  partnersCache.invalidate();
}

/** Ratings older than this get a warning: syncs run every 2 hours. */
export const RATINGS_STALE_MS = 36 * 60 * 60 * 1000;
export const ratingsStale = (asOf: string | null | undefined, now = Date.now()): boolean => !!asOf && now - Date.parse(asOf) > RATINGS_STALE_MS;
