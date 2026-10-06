// Client for /api/predict/* (Compete → Predict). Short TTL cache with
// in-flight de-duplication; the server caches too (2 min while an event is
// live, 10 min otherwise).
import { apiFetch } from './api';
import { createTtlCache } from './ftcScoutApi';
import type { Forecast, Partners } from '../../server/predict/engine';
import type { LiveAccuracy } from '../../server/predict/monitor';

export type { Forecast, Partners, LiveAccuracy };
export type ForecastView = Forecast & { eventName: string; eventStart: string | null; eventEnd: string | null; myTeam: number | null };

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

export interface PredictStatus { ready: boolean; readyAt: string | null; syncing: boolean; seasons: number[]; accuracy: PredictAccuracy; live?: LiveAccuracy | null }

/** Error with the HTTP status: 503 = warming up, 422 = event can't be forecast. */
export class PredictError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'PredictError'; }
}

const TTL = 2 * 60 * 1000;
const forecastCache = createTtlCache<ForecastView>(TTL);
const partnersCache = createTtlCache<Partners>(TTL);

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PredictError(body?.error || `Request failed (${res.status})`, res.status);
  return body as T;
}

export const fetchPredictStatus = () => getJson<PredictStatus>('/api/predict/status');

export function fetchForecast(season: number, code: string, opts?: { force?: boolean }): Promise<ForecastView> {
  return forecastCache.get(`${season}:${code}`, () => getJson<ForecastView>(`/api/predict/event?season=${season}&code=${encodeURIComponent(code)}`), opts);
}

export function fetchPartners(season: number, code: string, opts?: { force?: boolean }): Promise<Partners> {
  return partnersCache.get(`${season}:${code}`, () => getJson<Partners>(`/api/predict/partners?season=${season}&code=${encodeURIComponent(code)}`), opts);
}

/** Workspace switch / logout. */
export function clearPredictCache(): void {
  forecastCache.invalidate();
  partnersCache.invalidate();
}
