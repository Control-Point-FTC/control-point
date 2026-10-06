// Compete → Predict (beta): advancement odds for the workspace's team at an
// event, alliance-selection scenarios, the whole field and every match.
// All numbers come from the server's simulation engine (/api/predict/*);
// the "How accurate is this?" sheet shows the back-test results.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, Target, Users, ListOrdered, Swords, Info, RefreshCw, Settings as SettingsIcon, Trophy, Crown, Gauge, BarChart3, CircleHelp, Activity } from 'lucide-react';
import { cn } from '../ui';
import { Select } from '../Select';
import { EmptyState, ErrorState, Sheet, Skeleton, SeasonChip, SeasonPicker, relTime, seasonShort, useIsNarrow } from '../scout/ScoutUi';
import { fetchScoutEvent, fetchScoutTeam } from '../../services/ftcScoutApi';
import { fetchForecast, fetchPartners, fetchPredictStatus, PredictError, type ForecastView, type Partners, type PredictAccuracy, type LiveAccuracy } from '../../services/predictApi';
import { setScreenEntity } from '../../services/brunoContext';
import { currentFtcSeason } from '../FtcStats';
import type { FtcTeamEventSummary } from '../../types/ftcScout';

type Tab = 'odds' | 'alliance' | 'field' | 'matches';
const ADVANCING = new Set(['LeagueTournament', 'Qualifier', 'Championship', 'SuperQualifier', 'Premier', 'FIRSTChampionship']);
const normType = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, '');
const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);
/** "#3–#7", or "#5" when the range has collapsed (quals are over). */
const rankRange = (lo: number, hi: number) => (Math.round(lo) === Math.round(hi) ? `#${Math.round(lo)}` : `#${Math.round(lo)}–#${Math.round(hi)}`);
const STAGE_LABEL: Record<string, string> = {
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

export function PredictView() {
  const navigate = useNavigate();
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
  const [tab, setTab] = useState<Tab>('odds');
  const [fcState, setFc] = useState<ForecastView | null>(null);
  // Never show one event's forecast under another event's picker.
  const fc = fcState && code && fcState.season === season && fcState.event.toUpperCase() === code.toUpperCase() ? fcState : null;
  const [fcError, setFcError] = useState<PredictError | null>(null);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [accuracy, setAccuracy] = useState<PredictAccuracy | null>(null);
  const [live, setLive] = useState<LiveAccuracy | null>(null);
  // Status (back-test + live scores) loads on mount and again whenever the
  // accuracy sheet opens, so a page left open through a sync isn't stale.
  const loadStatus = () => { fetchPredictStatus().then((s) => { setAccuracy(s.accuracy); setLive(s.live ?? null); }).catch(() => {}); };
  const [showAccuracy, setShowAccuracy] = useState(false);
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

  useEffect(() => { loadStatus(); }, []);

  // Every request (initial, Refresh, Try again) gets an id and only the latest
  // may update state, so a slow answer for an old selection can't overwrite it.
  const reqId = useRef(0);
  const load = useCallback((force?: boolean) => {
    const id = ++reqId.current;
    if (!code) return;
    const latest = () => id === reqId.current;
    setLoading(true); setFcError(null);
    if (force) setRefreshKey((k) => k + 1); // re-runs the Alliance scenarios too
    fetchForecast(season, code, { force }).then((f) => { if (latest()) setFc(f); })
      .catch((e) => { if (latest()) { setFc(null); setFcError(e instanceof PredictError ? e : new PredictError(String(e?.message ?? e), 0)); } })
      .finally(() => { if (latest()) setLoading(false); });
    // Team names for the event (shared client cache with Team Stats).
    fetchScoutEvent(season, code).then((ev) => { if (latest()) setNames(new Map(ev.field.map((t) => [t.teamNumber, t.name]))); }).catch(() => {});
  }, [season, code]);
  useEffect(() => {
    load();
    return () => { reqId.current++; };
  }, [load]);

  // Bruno sees the forecast on screen.
  useEffect(() => {
    setScreenEntity('predictSeason', code ? season : null);
    setScreenEntity('predictEvent', code);
    return () => { setScreenEntity('predictSeason', null); setScreenEntity('predictEvent', null); };
  }, [season, code]);

  const nameOf = useCallback((t: number) => names.get(t) ?? `Team ${t}`, [names]);

  if (teamError === 'not-connected') {
    return (
      <EmptyState
        title="Connect your FTC team"
        body="Predict works out your team's odds at its events. Add your FTC team number in Settings to get started."
        action={<button onClick={() => navigate('/settings?section=workspace')} className="mt-2 inline-flex items-center gap-2 bg-accent text-accent-ink font-bold px-5 py-2.5 rounded-xl"><SettingsIcon className="w-4 h-4" /> Go to Settings</button>}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 pb-8 min-w-0">
      {/* Header */}
      <div className="card-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="w-5 h-5 text-accent" />
              <h2 className="font-display font-bold text-xl text-text-base">Predict</h2>
              <span className="px-2 py-0.5 rounded-full border border-sky-400/50 bg-sky-500/15 text-sky-500 text-[10px] font-black tracking-wider">BETA</span>
              <SeasonChip season={season} />
            </div>
            <p className="text-sm text-text-muted mt-1">Your odds of advancing, simulated from every team's match history. Estimates, not guarantees.</p>
          </div>
          <button onClick={() => { setShowAccuracy(true); loadStatus(); }} className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:opacity-80">
            <CircleHelp className="w-4 h-4" /> How accurate is this?
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-end">
          <div className="min-w-0">
            <label htmlFor="predict-event" className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5 block">Event</label>
            {events == null ? <Skeleton className="h-10" /> : teamError ? (
              <ErrorState message={teamError} onRetry={() => setTeamReload((n) => n + 1)} />
            ) : events.length ? (
              <Select id="predict-event" value={code ?? ''} onChange={(e) => { setCode(e.target.value); setTab('odds'); }} className="w-full">
                {events.map((e) => <option key={e.code} value={e.code}>{e.name}{e.date ? ` · ${e.date}` : ''}</option>)}
              </Select>
            ) : <p className="text-sm text-text-muted py-2">No advancing events for team {myTeam ?? ''} in {seasonShort(season)} yet.</p>}
          </div>
          <SeasonPicker seasons={[currentFtcSeason(), currentFtcSeason() - 1]} value={season} onChange={(s) => { setAutoStepped(true); setSeason(s); }} small />
        </div>
        {fc && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent font-bold">{STAGE_LABEL[fc.stage] ?? fc.stage}</span>
            <span>{fc.slots} advancement slot{fc.slots === 1 ? '' : 's'}{fc.slotsSource !== 'official' ? ' (estimated)' : ''}</span>
            <span>· {fc.runs.toLocaleString()} simulations · updated {relTime(fc.generatedAt)}</span>
            <button onClick={() => load(true)} className="inline-flex items-center gap-1 font-bold text-text-muted hover:text-text-base"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {code && (
        <div role="tablist" aria-label="Predict views" className="grid grid-cols-4 sm:flex gap-1 card-surface p-1 rounded-2xl w-full sm:w-fit">
          {([['odds', 'Odds', Target], ['alliance', 'Alliance', Users], ['field', 'Field', ListOrdered], ['matches', 'Matches', Swords]] as const).map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1.5 sm:px-4 py-2 text-xs sm:text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 whitespace-nowrap', tab === k ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-text-base')}>
              <Icon className="w-4 h-4 shrink-0" />{label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {!code ? null : fcError ? (
        fcError.status === 503 ? (
          <EmptyState title="Predictions are warming up" body="The engine is loading match history. This takes a few minutes after an update." action={<button onClick={() => load(true)} className="mt-2 inline-flex items-center gap-2 font-bold text-accent"><RefreshCw className="w-4 h-4" />Try again</button>} />
        ) : fcError.status === 422 ? (
          <EmptyState title="No forecast for this event" body={fcError.message} />
        ) : <ErrorState message={fcError.message} onRetry={() => load(true)} />
      ) : loading && !fc ? (
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-32 sm:col-span-2" /></div>
      ) : fc ? (
        <>
          {tab === 'odds' && <OddsTab fc={fc} myTeam={myTeam} />}
          {tab === 'alliance' && <AllianceTab season={season} code={code} fc={fc} nameOf={nameOf} myTeam={myTeam} refreshKey={refreshKey} />}
          {tab === 'field' && <FieldTab fc={fc} nameOf={nameOf} myTeam={myTeam} />}
          {tab === 'matches' && <MatchesTab fc={fc} myTeam={myTeam} />}
          {fc.assumptions.length > 0 && (
            <div className="card-surface p-4 text-xs text-text-muted space-y-1">
              <p className="font-bold text-text-base flex items-center gap-1.5"><Info className="w-4 h-4 text-accent" />Assumptions</p>
              {fc.assumptions.map((a) => <p key={a}>• {a}</p>)}
            </div>
          )}
        </>
      ) : null}

      <Sheet open={showAccuracy} onClose={() => setShowAccuracy(false)} title="How accurate is this?" subtitle="Back-tested on past events, and tracked live this season">
        <AccuracyPanel accuracy={accuracy} live={live} />
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Odds (our team)
// ---------------------------------------------------------------------------

function Ring({ value, label }: { value: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    // Number and label are HTML centred over the ring, so they wrap inside the
    // hole instead of running into the stroke.
    <div className="relative w-40 h-40 sm:w-48 sm:h-48" role="img" aria-label={`${label}: ${pct(value)}`}>
      <svg viewBox="0 0 128 128" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <circle cx="64" cy="64" r={r} fill="none" className="stroke-text-base/10" strokeWidth="10" />
        <circle cx="64" cy="64" r={r} fill="none" className="stroke-accent" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 64 64)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
        <span className="font-display font-bold text-text-base text-4xl sm:text-5xl leading-none tabular-nums">{pct(value)}</span>
        <span className="mt-1.5 max-w-[58%] text-[11px] sm:text-xs leading-tight text-text-muted">{label}</span>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Trophy; label: string; value: string; hint?: string }) {
  return (
    <div className="card-surface p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-accent" />{label}</p>
      <p className="text-xl font-display font-bold text-text-base mt-1">{value}</p>
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}

function OddsTab({ fc, myTeam }: { fc: ForecastView; myTeam: number | null }) {
  const me = myTeam ? fc.teams.find((t) => t.team === myTeam) : undefined;
  if (!me) return <EmptyState title={myTeam ? `Team ${myTeam} isn't at this event` : 'No team connected'} body="See the Field tab for every team's odds." />;
  const pre = fc.prequalified.includes(me.team);
  const p = me.points;
  const parts = [
    { k: 'Quals rank', v: p.quals, cls: 'bg-accent' },
    { k: 'Alliance selection', v: p.alliance, cls: 'bg-amber-500' },
    { k: 'Playoffs', v: p.playoffs, cls: 'bg-sky-500' },
    { k: 'Awards', v: p.awards ?? 0, cls: 'bg-fuchsia-500' },
  ];
  const sum = parts.reduce((s, x) => s + x.v, 0) || 1;
  const n = fc.teams.length;
  return (
    <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="card-surface p-5 flex flex-col items-center justify-center text-center gap-2">
        {pre ? <p className="text-sm font-bold text-text-base max-w-[14rem]">Team {me.team} has already qualified for the next level.</p> : <Ring value={me.pAdvance} label="chance to advance" />}
        {fc.matchesOnly && !pre && (
          <p className="text-xs text-text-muted max-w-[16rem]">
            <span className="font-bold text-text-base">{pct(fc.matchesOnly.pAdvance)}</span> from match results alone · <span className="font-bold text-text-base">{pct(me.pAdvance)}</span> with your award history
          </p>
        )}
      </div>
      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={Crown} label="Captain" value={pct(me.pCaptain)} hint="top seed picks" />
          <Stat icon={Users} label="Picked" value={pct(me.pPicked)} hint="chosen as partner" />
          <Stat icon={Trophy} label="Win event" value={pct(me.pWin)} />
          <Stat icon={Gauge} label="Finalist" value={pct(me.pFinalist)} />
        </div>
        <div className="card-surface p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Likely quals rank</p>
          <div className="relative h-3 rounded-full bg-text-base/[0.06]">
            <div className="absolute h-3 rounded-full bg-accent/40" style={{ left: `${((me.rank.p10 - 1) / Math.max(1, n - 1)) * 100}%`, width: `${Math.max(2, ((me.rank.p90 - me.rank.p10) / Math.max(1, n - 1)) * 100)}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent ring-2 ring-primary" style={{ left: `calc(${((me.rank.mean - 1) / Math.max(1, n - 1)) * 100}% - 6px)` }} />
          </div>
          <div className="flex justify-between text-[11px] text-text-muted mt-1.5"><span>1st</span><span className="font-bold text-text-base">{rankRange(me.rank.p10, me.rank.p90)}{me.rank.p10 !== me.rank.p90 && ` (avg ${me.rank.mean.toFixed(1)})`}</span><span>{n}th</span></div>
        </div>
        <div className="card-surface p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Where your expected points come from{fc.season >= 2025 ? '' : ' (2025+ points system)'}</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-text-base/[0.06]">
            {parts.map((x) => <div key={x.k} className={x.cls} style={{ width: `${(x.v / sum) * 100}%` }} title={`${x.k}: ${x.v.toFixed(1)}`} />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {parts.map((x) => (
              <div key={x.k} className="flex items-center gap-2 text-xs">
                <span className={cn('w-2.5 h-2.5 rounded-sm shrink-0', x.cls)} />
                <span className="text-text-muted">{x.k}</span>
                <span className="ml-auto font-bold text-text-base tabular-nums">{x.v.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-muted mt-2">Average over all simulations. Total {p.total != null ? p.total.toFixed(1) : '—'} points.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alliance ("who should we pick" / "best captains for us")
// ---------------------------------------------------------------------------

function AllianceTab({ season, code, fc, nameOf, myTeam, refreshKey }: { season: number; code: string; fc: ForecastView; nameOf: (t: number) => string; myTeam: number | null; refreshKey: number }) {
  const [data, setData] = useState<Partners | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Bypass the client cache only for a Refresh made while this tab exists, not
  // on every later mount (switching tabs keeps using fresh cached choices).
  const seenRefresh = useRef(refreshKey);
  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    const force = refreshKey !== seenRefresh.current;
    seenRefresh.current = refreshKey;
    fetchPartners(season, code, { force }).then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setErr(e?.message ?? 'Could not load alliance options'); });
    return () => { alive = false; };
  }, [season, code, refreshKey]);
  if (!myTeam) return <EmptyState title="Connect your FTC team" body="Alliance scenarios are worked out for your team." />;
  if (err) return <ErrorState message={err} />;
  if (!data) return (
    <div className="card-surface p-4 space-y-2" aria-busy="true">
      <p className="text-sm text-text-muted">Simulating the event once per possible partner…</p>
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11" />)}
    </div>
  );
  if (data.role === 'none') {
    const mine = fc.teams.find((t) => t.team === myTeam);
    return <EmptyState title="Alliances are set" body={`Alliance selection has happened, so your partner is locked in. Your chance to advance from here: ${pct(mine?.pAdvance)}.`} />;
  }
  const best = data.options[0]?.pAdvance ?? 0;
  return (
    <div className="card-surface p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="font-display font-bold text-lg text-text-base">{data.role === 'captain' ? 'Who should we pick?' : 'Best captains for us'}</h3>
        <p className="text-sm text-text-muted">
          {data.role === 'captain'
            ? `You're likely a captain (${pct(data.baseline.pCaptain)}). Each option simulates the event with that partner on your alliance.`
            : `You're more likely to be picked than to captain. Each option simulates the event with that captain picking you.`}
          {' '}Right now: <span className="font-bold text-text-base">{pct(data.baseline.pAdvance)}</span> to advance.
        </p>
      </div>
      <ul className="space-y-1.5">
        {data.options.map((o, i) => {
          const delta = o.pAdvance - data.baseline.pAdvance;
          return (
            <li key={o.team} className={cn('rounded-xl border border-text-base/10 p-3 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center', i === 0 && 'border-accent/50 bg-accent/[0.06]')}>
              <span className="w-7 h-7 rounded-lg bg-text-base/[0.06] text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-base truncate">{o.team} <span className="font-medium text-text-muted">{nameOf(o.team)}</span></p>
                <div className="mt-1 h-1.5 rounded-full bg-text-base/[0.06]"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${best ? (o.pAdvance / best) * 100 : 0}%` }} /></div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-text-base tabular-nums">{pct(o.pAdvance)}</p>
                <p className={cn('text-[11px] font-bold tabular-nums', delta >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{delta >= 0 ? '+' : ''}{Math.round(delta * 100)} pts · win {pct(o.pWin)}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-text-muted">Odds include rank, alliance, playoff and award points. Scout and talk to teams too — the model can't see robot changes or how well two robots work together.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

function FieldTab({ fc, nameOf, myTeam }: { fc: ForecastView; nameOf: (t: number) => string; myTeam: number | null }) {
  const narrow = useIsNarrow();
  const pre = new Set(fc.prequalified);
  const rows = fc.teams;
  if (narrow) {
    return (
      <div className="space-y-2">
        {rows.map((t) => (
          <div key={t.team} className={cn('card-surface p-3', t.team === myTeam && '!border-accent/50')}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-base truncate">{t.team} <span className="font-medium text-text-muted">{nameOf(t.team)}</span></p>
                <p className="text-[11px] text-text-muted">Rank {rankRange(t.rank.p10, t.rank.p90)} · captain {pct(t.pCaptain)} · picked {pct(t.pPicked)}</p>
                <p className="text-[11px] text-text-muted">Win {pct(t.pWin)} · {t.points.matchPoints.toFixed(1)} match pts</p>
              </div>
              <span className="text-lg font-display font-bold text-text-base tabular-nums">{pre.has(t.team) ? 'Q' : pct(t.pAdvance)}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-text-base/[0.06]"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${t.pAdvance * 100}%` }} /></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="card-surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-text-muted text-left border-b border-text-base/10">
            <th className="py-2 px-3 font-bold">Team</th><th className="py-2 px-3 font-bold w-[30%]">Chance to advance</th><th className="py-2 px-3 font-bold">Likely rank</th>
            <th className="py-2 px-3 font-bold">Captain</th><th className="py-2 px-3 font-bold">Picked</th><th className="py-2 px-3 font-bold">Win</th><th className="py-2 px-3 font-bold" title="Expected points from rank, alliance selection and playoffs">Match pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.team} className={cn('border-b border-text-base/[0.06]', t.team === myTeam && 'bg-accent/[0.08]')}>
              <td className="py-2 px-3 max-w-[16rem]"><span className="font-bold text-text-base">{t.team}</span> <span className="text-text-muted truncate">{nameOf(t.team)}</span></td>
              <td className="py-2 px-3">
                {pre.has(t.team) ? <span className="text-xs font-bold text-emerald-500">Already qualified</span> : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-text-base/[0.06]"><div className="h-2 rounded-full bg-accent" style={{ width: `${t.pAdvance * 100}%` }} /></div>
                    <span className="w-10 text-right font-bold tabular-nums text-text-base">{pct(t.pAdvance)}</span>
                  </div>
                )}
              </td>
              <td className="py-2 px-3 tabular-nums whitespace-nowrap">{rankRange(t.rank.p10, t.rank.p90)}</td>
              <td className="py-2 px-3 tabular-nums">{pct(t.pCaptain)}</td>
              <td className="py-2 px-3 tabular-nums">{pct(t.pPicked)}</td>
              <td className="py-2 px-3 tabular-nums">{pct(t.pWin)}</td>
              <td className="py-2 px-3 tabular-nums">{t.points.matchPoints.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

function MatchesTab({ fc, myTeam }: { fc: ForecastView; myTeam: number | null }) {
  const [mine, setMine] = useState(!!myTeam);
  const list = useMemo(() => (fc.matches ?? []).filter((m) => !mine || !myTeam || m.red.includes(myTeam) || m.blue.includes(myTeam)), [fc.matches, mine, myTeam]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {myTeam && (
          <label className="inline-flex items-center gap-2 text-sm font-bold text-text-base cursor-pointer">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-[var(--color-accent)]" /> Only team {myTeam}'s matches
          </label>
        )}
        <span className="text-xs text-text-muted">Upcoming matches show predicted scores and win odds; played ones show the result.</span>
      </div>
      {!list.length ? <EmptyState title="No matches yet" body="The match schedule appears here once it's published." /> : (
        <ul className="space-y-1.5">
          {list.map((m) => {
            const p = m.pRedWin;
            const favRed = p != null && p >= 0.5;
            const won = m.played ? (m.played.red === m.played.blue ? 'Tie' : m.played.red > m.played.blue ? 'Red won' : 'Blue won') : null;
            return (
              <li key={m.key} className="card-surface p-3 grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3">
                <span className="text-xs font-bold text-text-muted">{m.label}</span>
                <div className="min-w-0 space-y-1">
                  <Side color="red" teams={m.red} myTeam={myTeam} mean={m.redMean} actual={m.played?.red} />
                  <Side color="blue" teams={m.blue} myTeam={myTeam} mean={m.blueMean} actual={m.played?.blue} />
                  {p != null && (
                    <div className="flex h-1.5 rounded-full overflow-hidden" title={`Red ${pct(p)} · Blue ${pct(1 - p)}`}>
                      <div className="bg-red-500" style={{ width: `${p * 100}%` }} /><div className="bg-blue-500 flex-1" />
                    </div>
                  )}
                </div>
                <div className="text-right text-xs">
                  {won ? (
                    <>
                      <p className={cn('font-bold', won === 'Red won' ? 'text-red-500' : won === 'Blue won' ? 'text-blue-500' : 'text-text-muted')}>{won}</p>
                      <PreMatchCall pre={m.pre ?? null} played={m.played!} />
                    </>
                  ) : p != null ? (
                    <p className={cn('font-bold', favRed ? 'text-red-500' : 'text-blue-500')}>{favRed ? 'Red' : 'Blue'} {pct(favRed ? p : 1 - p)}</p>
                  ) : <p className="text-text-muted" title="Which two robots will play isn't known yet">No prediction</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Honest call for a played match, from odds recorded before it was played. */
function PreMatchCall({ pre, played }: { pre: number | null; played: { red: number; blue: number } }) {
  if (pre == null || played.red === played.blue || pre === 0.5) {
    return pre == null ? <p className="text-[11px] text-text-muted" title="No forecast was recorded before this match">No pre-match call</p> : null;
  }
  const favRed = pre > 0.5;
  const favP = favRed ? pre : 1 - pre;
  const called = favRed === (played.red > played.blue);
  return called ? (
    <p className="text-[11px] font-bold text-emerald-500" title={`Before the match: ${favRed ? 'Red' : 'Blue'} ${pct(favP)}`}>Called it · {pct(favP)}</p>
  ) : (
    <p className="text-[11px] font-bold text-amber-500" title={`Before the match the winner had ${pct(1 - favP)}`}>Upset · {pct(1 - favP)}</p>
  );
}

function Side({ color, teams, myTeam, mean, actual }: { color: 'red' | 'blue'; teams: number[]; myTeam: number | null; mean: number | null; actual?: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={cn('w-2 h-2 rounded-full shrink-0', color === 'red' ? 'bg-red-500' : 'bg-blue-500')} />
      {teams.map((t) => <span key={t} className={cn('px-1.5 py-0.5 rounded-md font-bold tabular-nums', t === myTeam ? 'bg-accent text-accent-ink' : 'bg-text-base/[0.06] text-text-base')}>{t}</span>)}
      <span className="ml-auto tabular-nums text-text-muted">
        {actual != null ? <span className="font-bold text-text-base">{actual}</span> : mean != null ? `~${Math.round(mean)}` : null}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accuracy
// ---------------------------------------------------------------------------

function AccuracyPanel({ accuracy: a, live }: { accuracy: PredictAccuracy | null; live?: LiveAccuracy | null }): ReactNode {
  if (!a) return <Skeleton className="h-40" />;
  const row = (label: string, value: string, note?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-text-base/[0.06] last:border-0">
      <span className="text-sm text-text-base">{label}</span>
      <span className="text-right"><span className="font-bold text-text-base tabular-nums">{value}</span>{note && <span className="block text-[11px] text-text-muted">{note}</span>}</span>
    </div>
  );
  const stageLabel: Record<string, string> = { pre: 'before the event', quals: 'after quals', selected: 'after alliance selection' };
  const backBrier: Record<string, number> = { pre: a.advancement.pre.brier, quals: a.advancement.quals.brier, selected: a.advancement.selected.brier };
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h4 className="font-bold text-text-base flex items-center gap-1.5 mb-1"><Activity className="w-4 h-4 text-accent" />Live this season</h4>
        {live && (live.matches.n > 0 || (['pre', 'quals', 'selected'] as const).some((s) => live.advancement[s].n > 0)) ? (
          <>
            <p className="text-xs text-text-muted mb-1">Only predictions written down <em>before</em> the results were known, scored against what happened.</p>
            {live.matches.n > 0 ? (
              <>
                {row('Match winners called', `${(live.matches.accuracy * 100).toFixed(1)}%`, `${live.matches.n.toLocaleString()} matches · ${live.matches.upsets.toLocaleString()} upsets · back-test ${(a.matches.liveAccuracy * 100).toFixed(1)}%`)}
                {row('Match odds score', live.matches.brier.toFixed(3), `Brier, lower is better · back-test ${a.matches.liveBrier.toFixed(3)}`)}
              </>
            ) : <p className="text-xs text-text-muted py-1.5">No recorded match calls have been played yet.</p>}
            {(['pre', 'quals', 'selected'] as const).filter((s) => live.advancement[s].n > 0).map((s) => (
              <div key={s}>{row(`Advancement odds ${stageLabel[s]}`, live.advancement[s].brier.toFixed(3), `${live.advancement[s].events} events · back-test ${backBrier[s].toFixed(3)}`)}</div>
            ))}
          </>
        ) : (
          <p className="text-xs text-text-muted">Collecting. Every forecast is written down before its matches are played; live scores appear here once those matches finish.</p>
        )}
      </section>
      <p className="text-text-muted">Every number below comes from replaying the {a.testSeason} season event by event, using only data that existed at the time. Settings were tuned on the season before.</p>
      <section>
        <h4 className="font-bold text-text-base flex items-center gap-1.5 mb-1"><Swords className="w-4 h-4 text-accent" />Match winners ({a.matches.count.toLocaleString()} matches)</h4>
        {row('Called correctly (live)', `${(a.matches.liveAccuracy * 100).toFixed(1)}%`, `vs ${(a.matches.oprAccuracy * 100).toFixed(1)}% for plain OPR`)}
        {row('Called correctly (before the event)', `${(a.matches.preEventAccuracy * 100).toFixed(1)}%`)}
        {row('Score range accuracy', `${(a.matches.scoreRange80Coverage * 100).toFixed(0)}%`, 'of scores land inside the "80%" range')}
      </section>
      <section>
        <h4 className="font-bold text-text-base flex items-center gap-1.5 mb-1"><BarChart3 className="w-4 h-4 text-accent" />Advancement odds ({a.advancement.events} events)</h4>
        <p className="text-xs text-text-muted mb-2">When it says X%, teams advanced about X% of the time:</p>
        <div className="space-y-1">
          {a.advancement.calibrationPre.map((b) => (
            <div key={b.predicted} className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs">
              <span className="text-text-muted tabular-nums">said {Math.round(b.predicted * 100)}%</span>
              <div className="relative h-2.5 rounded-full bg-text-base/[0.06]">
                <div className="absolute h-2.5 rounded-full bg-accent/70" style={{ width: `${b.actual * 100}%` }} />
                <div className="absolute top-[-2px] h-[14px] w-0.5 bg-text-base/60" style={{ left: `${b.predicted * 100}%` }} />
              </div>
              <span className="font-bold text-text-base tabular-nums">{Math.round(b.actual * 100)}%</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-text-muted mt-2">Bar = how often teams actually advanced; line = what was predicted. Before the event, after quals and after alliance selection the errors are {a.advancement.pre.calibrationError.toFixed(3)}, {a.advancement.quals.calibrationError.toFixed(3)} and {a.advancement.selected.calibrationError.toFixed(3)}.</p>
      </section>
      {a.partners && (
        <section>
          <h4 className="font-bold text-text-base flex items-center gap-1.5 mb-1"><Users className="w-4 h-4 text-accent" />Alliance scenarios</h4>
          <p className="text-xs text-text-muted">Knowing the real partner predicted who wins the event better than the general odds (score {a.partners.allianceWin.brier.toFixed(3)} vs {a.partners.allianceWinGeneral.brier.toFixed(3)}, lower is better, {a.partners.allianceWin.n.toLocaleString()} alliances). The real first pick was in the model's top three {Math.round(a.pickTop3 * 100)}% of the time.</p>
        </section>
      )}
      <section className="text-xs text-text-muted space-y-1">
        <h4 className="font-bold text-text-base text-sm">What it can't see</h4>
        <p>• Robot rebuilds and new mechanisms until the team plays again.</p>
        <p>• How well two robots work together, or teams declining picks.</p>
        <p>• Judged awards are estimated from each team's award history.</p>
      </section>
    </div>
  );
}
