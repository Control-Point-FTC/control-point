// Shared Predict controller: event/season selection (synced with
// ?season=&event=), the forecast request (latest-wins), team names, the
// accuracy status and Bruno's screen context. Used by Legacy PredictView and
// the Modern Predict page so both follow the same rules.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchScoutEvent, fetchScoutTeam } from '../../services/ftcScoutApi';
import { fetchForecast, fetchPartners, fetchPredictStatus, PredictError, type ForecastView, type Partners, type PredictAccuracy, type LiveAccuracy } from '../../services/predictApi';
import { setScreenEntity } from '../../services/brunoContext';
import { currentFtcSeason } from '../FtcStats';
import type { FtcTeamEventSummary } from '../../types/ftcScout';

export type PredictTab = 'odds' | 'alliance' | 'field' | 'matches';
const ADVANCING = new Set(['LeagueTournament', 'Qualifier', 'Championship', 'SuperQualifier', 'Premier', 'FIRSTChampionship']);
const normType = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, '');
export const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);
/** "#3–#7", or "#5" when the range has collapsed (quals are over). */
export const rankRange = (lo: number, hi: number) => (Math.round(lo) === Math.round(hi) ? `#${Math.round(lo)}` : `#${Math.round(lo)}–#${Math.round(hi)}`);
export const STAGE_LABEL: Record<string, string> = {
  pre: 'Before the event',
  live: 'Quals in progress',
  quals: 'Quals finished',
  selected: 'Alliances selected',
};

/** Pick the event to open by default: ongoing/upcoming first, else the latest. */
function defaultEvent(events: FtcTeamEventSummary[]): string | null {
  if (!events.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => (e.date ?? '') >= today).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (upcoming.length) return upcoming[0].code;
  return [...events].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0].code;
}

/** Honest call for a played match, from odds recorded before it was played. */
export function preMatchCall(pre: number | null, played: { red: number; blue: number }):
  | { kind: 'none' } | { kind: 'even' } | { kind: 'called' | 'upset'; fav: 'Red' | 'Blue'; favP: number } {
  if (pre == null) return { kind: 'none' };
  if (played.red === played.blue || pre === 0.5) return { kind: 'even' };
  const favRed = pre > 0.5;
  return { kind: favRed === (played.red > played.blue) ? 'called' : 'upset', fav: favRed ? 'Red' : 'Blue', favP: favRed ? pre : 1 - pre };
}

export function usePredictController() {
  // ?season=&event= keep the choice across reloads and make it shareable.
  const [params, setParams] = useSearchParams();
  const [season, setSeason] = useState(() => {
    const s = Number(params.get('season'));
    return Number.isInteger(s) && s >= 2019 && s <= currentFtcSeason() ? s : currentFtcSeason();
  });
  const [events, setEvents] = useState<FtcTeamEventSummary[] | null>(null);
  const [myTeam, setMyTeam] = useState<number | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(() => params.get('event'));
  const [tab, setTab] = useState<PredictTab>('odds');
  const [fcState, setFc] = useState<ForecastView | null>(null);
  // Never show one event's forecast under another event's picker.
  const fc = fcState && code && fcState.season === season && fcState.event.toUpperCase() === code.toUpperCase() ? fcState : null;
  const [fcError, setFcError] = useState<PredictError | null>(null);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [accuracy, setAccuracy] = useState<PredictAccuracy | null>(null);
  const [live, setLive] = useState<LiveAccuracy | null>(null);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  // Status (back-test + live scores) loads on mount and again whenever the
  // accuracy sheet opens, so a page left open through a sync isn't stale.
  const loadStatus = useCallback(() => { fetchPredictStatus().then((s) => { setAccuracy(s.accuracy); setLive(s.live ?? null); setDataAsOf(s.dataAsOf ?? null); }).catch(() => {}); }, []);
  const [showAccuracy, setShowAccuracyState] = useState(false);
  const [autoStepped, setAutoStepped] = useState(() => params.has('season'));
  const [teamReload, setTeamReload] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  // State -> URL.
  useEffect(() => {
    if (!code) return;
    if (params.get('season') === String(season) && params.get('event') === code) return;
    setParams({ season: String(season), event: code }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, code]);
  // URL -> state (back/forward, or a link to another forecast while on the page).
  useEffect(() => {
    const s = Number(params.get('season')), e = params.get('event');
    if (Number.isInteger(s) && s >= 2019 && s <= currentFtcSeason() && s !== season) { setAutoStepped(true); setSeason(s); }
    if (e && e !== code) setCode(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Our team's events this season (advancing types only).
  useEffect(() => {
    let alive = true;
    setEvents(null); setTeamError(null);
    fetchScoutTeam(season).then((p) => {
      if (!alive) return;
      setMyTeam(p.number);
      // Advancing events only; drop a championship's parent event when the team
      // also has its division (the parent has no quals of its own).
      const evs = p.events.filter((e) => ADVANCING.has(normType(e.type))
        && !p.events.some((d) => d.code !== e.code && d.code.startsWith(e.code) && d.date === e.date));
      // A new season with no events yet: step back once to the previous season.
      if (!evs.length && !autoStepped && season > 2022) { setAutoStepped(true); setSeason(season - 1); return; }
      setEvents(evs);
      setCode((c) => (c && evs.some((e) => e.code === c) ? c : defaultEvent(evs)));
    }).catch((e) => {
      if (!alive) return;
      setTeamError(e?.status === 404 && /no ftc team/i.test(e?.message ?? '') ? 'not-connected' : e?.message ?? 'Could not load your events');
      setEvents([]);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, teamReload]);

  // Again every 10 minutes, so a page left open picks up the next sync's age.
  useEffect(() => {
    loadStatus();
    const id = window.setInterval(loadStatus, 10 * 60_000);
    return () => window.clearInterval(id);
  }, [loadStatus]);

  // Every request (initial, Refresh, Try again) gets an id and only the latest
  // may update state, so a slow answer for an old selection can't overwrite it.
  const reqId = useRef(0);
  // For an offline forecast (worked out on this device), which needs our team.
  const myTeamRef = useRef(myTeam);
  myTeamRef.current = myTeam;
  const load = useCallback((force?: boolean) => {
    const id = ++reqId.current;
    if (!code) return;
    const latest = () => id === reqId.current;
    setLoading(true); setFcError(null);
    if (force) { setRefreshKey((k) => k + 1); loadStatus(); } // re-runs the Alliance scenarios too, and re-checks the ratings' age
    fetchForecast(season, code, { force, myTeam: myTeamRef.current }).then((f) => { if (latest()) setFc(f); })
      .catch((e) => { if (latest()) { setFc(null); setFcError(e instanceof PredictError ? e : new PredictError(String(e?.message ?? e), 0)); } })
      .finally(() => { if (latest()) setLoading(false); });
    // Team names for the event (shared client cache with Team Stats).
    fetchScoutEvent(season, code).then((ev) => { if (latest()) setNames(new Map(ev.field.map((t) => [t.teamNumber, t.name]))); }).catch(() => {});
  }, [season, code]);
  useEffect(() => {
    load();
    return () => { reqId.current++; };
  }, [load]);

  // An offline forecast made before our team was known: redo it for our team
  // (offline answers aren't cached, so this works it out again).
  useEffect(() => {
    if (fc?.offline && myTeam && fc.myTeam !== myTeam) load();
  }, [fc, myTeam, load]);

  // Bruno sees the forecast on screen.
  useEffect(() => {
    setScreenEntity('predictSeason', code ? season : null);
    setScreenEntity('predictEvent', code);
    return () => { setScreenEntity('predictSeason', null); setScreenEntity('predictEvent', null); };
  }, [season, code]);

  const nameOf = useCallback((t: number) => names.get(t) ?? `Team ${t}`, [names]);

  /** Pick an event from the picker (opens on the Odds tab). */
  const chooseEvent = useCallback((c: string) => { setCode(c); setTab('odds'); }, []);
  /** Pick a season by hand (no more automatic stepping back). */
  const chooseSeason = useCallback((s: number) => { setAutoStepped(true); setSeason(s); }, []);
  const retryTeam = useCallback(() => setTeamReload((n) => n + 1), []);
  const setShowAccuracy = useCallback((open: boolean) => { setShowAccuracyState(open); if (open) loadStatus(); }, [loadStatus]);

  return {
    season, chooseSeason, seasons: [currentFtcSeason(), currentFtcSeason() - 1],
    events, myTeam, teamError, retryTeam,
    code, chooseEvent, tab, setTab,
    fc, fcError, loading, load, refreshKey, nameOf,
    accuracy, live, showAccuracy, setShowAccuracy, dataAsOf,
  };
}

/**
 * Alliance scenarios for our team. Bypasses the client cache only for a
 * Refresh made while the tab exists, not on every later mount (switching tabs
 * keeps using fresh cached choices).
 */
export function usePartners(season: number, code: string, refreshKey: number, myTeam: number | null = null) {
  const [data, setData] = useState<Partners | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const seenRefresh = useRef(refreshKey);
  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    const force = refreshKey !== seenRefresh.current;
    seenRefresh.current = refreshKey;
    fetchPartners(season, code, { force, myTeam }).then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setErr(e?.message ?? 'Could not load alliance options'); });
    return () => { alive = false; };
  }, [season, code, refreshKey, myTeam]);
  return { data, err };
}
