// FTC team statistics: shared hook + dashboard card + dedicated stats page.
// Match data comes from the backend's FTC Scout proxy (credited to ftcscout.org).
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TeamScoutView } from './scout/CompeteView';
import { AnalyzeView } from './scout/AnalyzeView';
import { useTeamStats } from './scout/useTeamStats';
import {
  Trophy, MapPin, GraduationCap, Target, Bot,
  Cog, Flag, ChevronRight, RefreshCw, Settings as SettingsIcon,
  CircleAlert, Search,
} from 'lucide-react';
import { fetchFtcTeam, invalidateFtcSeason, FtcNotConnectedError } from './ftcCache';

export interface FtcOprStat { value: number | null; rank: number | null }
export interface FtcEvent {
  code?: string; name: string; date: string | null; type: string | null;
  rank: number | null; wins: number | null; losses: number | null; ties: number | null;
  awards: string[];
}
export interface FtcTeamPayload {
  number: number; name: string; school?: string; sponsors?: string[];
  city?: string; state?: string; country?: string;
  rookieYear?: number; seasons: number[]; season: number;
  totalTeams?: number | null;
  opr: { tot: FtcOprStat | null; auto: FtcOprStat | null; dc: FtcOprStat | null; eg: FtcOprStat | null };
  oprSource?: string | null;
  events: FtcEvent[];
  source?: 'first-events' | 'ftc-scout' | 'cache';
  /** For a cached response: where the data originally came from. */
  origin?: 'first-events' | 'ftc-scout';
  fetchedAt?: string;
  cached?: boolean;
  /** Served from cache because every live source was unreachable. */
  stale?: boolean;
}

// FTC season number -> game name (season N = the N–N+1 school year)
export const FTC_SEASON_NAMES: Record<number, string> = {
  2022: 'POWERPLAY',
  2023: 'CENTERSTAGE',
  2024: 'INTO THE DEEP',
  2025: 'DECODE',
  2026: 'BIOBUZZ',
};
export const seasonLabel = (s: number) =>
  `${s}–${String(s + 1).slice(2)}${FTC_SEASON_NAMES[s] ? ` · ${FTC_SEASON_NAMES[s]}` : ''}`;

// Season that started most recently (FTC seasons start in September),
// clamped to the seasons the server supports.
export function currentFtcSeason(): number {
  const now = new Date();
  const s = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Math.min(Math.max(s, 2022), 2026);
}

export function useFtcTeam() {
  const [season, setSeason] = useState(currentFtcSeason);
  // Only the very first load may auto-step back a season; after that the
  // user's explicit pick always sticks (and shows "no data yet").
  const autoFallbackRef = useRef(true);
  const [data, setData] = useState<FtcTeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  // Last season list we saw, so a season that fails to load (e.g. a new
  // season with no data yet) can still show the pills to switch back.
  const [knownSeasons, setKnownSeasons] = useState<number[]>([]);
  // Guards against out-of-order responses when the season changes quickly:
  // only the latest load may write state.
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (s: number, opts?: { refresh?: boolean }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    if (opts?.refresh) invalidateFtcSeason(s);
    setLoading(true);
    setError(null);
    setNotConnected(false);
    // Set when this load hands off to a different season: the spinner stays
    // up until that reload finishes (no flash of an empty/error state).
    let handedOff = false;
    try {
      const payload = await fetchFtcTeam(s, controller.signal);
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      if (payload?.seasons?.length) setKnownSeasons(payload.seasons);
      // A season that hasn't started can still come back as a profile with
      // no events and no OPR — on the first load, step back to the team's
      // most recent earlier season instead of opening on an empty view.
      if (autoFallbackRef.current && !payload?.events?.length && payload?.opr?.tot?.value == null) {
        const prev = (payload?.seasons || []).filter((x: number) => x < s).sort((a: number, b: number) => b - a)[0];
        autoFallbackRef.current = false;
        if (prev) {
          handedOff = true;
          setSeason(prev); // effect reloads with that season
          return;
        }
      }
      autoFallbackRef.current = false;
      setData(payload);
    } catch (e: any) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      if (autoFallbackRef.current && isNoSeasonData(e?.message || null) && s > 2022) {
        autoFallbackRef.current = false;
        handedOff = true;
        setSeason(s - 1); // effect reloads with the previous season
        return;
      }
      autoFallbackRef.current = false;
      if (e instanceof FtcNotConnectedError) {
        setNotConnected(true);
        setData(null);
      } else {
        setError(e?.message || 'Could not load team statistics');
        setData(null);
      }
    } finally {
      if (!handedOff && requestId === requestIdRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(season);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  return { season, setSeason, data, loading, error, notConnected, knownSeasons, refresh: () => load(season, { refresh: true }) };
}

// The API's 404 for a season the team hasn't competed in (yet).
function isNoSeasonData(error: string | null): boolean {
  return !!error && /no record of that team number this season/i.test(error);
}
function seasonErrorText(error: string | null, season: number): string {
  if (isNoSeasonData(error)) return `There's no ${seasonLabel(season)} data for your team yet — pick another season.`;
  return error || 'Something went wrong.';
}

function SeasonPills({ seasons, active, onPick, small }: { seasons: number[]; active: number; onPick: (s: number) => void; small?: boolean }) {
  if (!seasons?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {seasons.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className={
            `rounded-full font-bold transition-all ${small ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'} ` +
            (s === active
              ? 'bg-accent text-accent-ink shadow-[0_4px_16px_rgba(255,199,0,0.25)]'
              : 'bg-text-base/5 text-text-muted hover:text-text-base hover:bg-text-base/10 border border-text-base/10')
          }
        >
          {s}–{String(s + 1).slice(2)}
        </button>
      ))}
    </div>
  );
}

function OprTile({ label, stat, icon: Icon, accent, totalTeams }: { label: string; stat: FtcOprStat | null; icon: any; accent?: boolean; totalTeams?: number | null }) {
  const pct = percentileLine(stat?.rank ?? null, totalTeams);
  return (
    <div className="p-4 card-surface flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${accent ? 'text-accent' : 'text-text-muted'}`} />
        <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${accent ? 'text-accent' : 'text-text-base'}`}>
        {stat?.value != null ? stat.value : '—'}
      </p>
      <p className="text-[11px] text-text-muted">
        {stat?.rank != null ? <span className="text-text-base/80 font-semibold">Rank #{stat.rank.toLocaleString()}</span> : 'Unranked'}
        {pct && <span className="text-text-muted/70"> · {pct}</span>}
      </p>
    </div>
  );
}

function recordLine(e: FtcEvent) {
  if (e.wins == null && e.losses == null) return null;
  return `${e.wins ?? 0}W – ${e.losses ?? 0}L${e.ties ? ` – ${e.ties}T` : ''}`;
}

// Placement badge: 1st gold, 2nd silver, 3rd bronze, everything else light grey.
function placementBadgeClass(rank: number | null): string {
  if (rank === 1) return 'bg-[#FFD54A] text-black shadow-[0_4px_16px_rgba(255,213,74,0.35)]';
  if (rank === 2) return 'bg-[#C9D2DC] text-black shadow-[0_4px_16px_rgba(201,210,220,0.25)]';
  if (rank === 3) return 'bg-[#E0A266] text-black shadow-[0_4px_16px_rgba(224,162,102,0.25)]';
  return 'bg-text-base/[0.22] text-text-base';
}

// Worldwide percentile for a rank, e.g. rank 616 of 8868 -> "93rd percentile".
function percentileLine(rank: number | null, total: number | null | undefined): string | null {
  if (rank == null || !total || total <= 0) return null;
  const pct = Math.max(0, Math.min(100, (1 - rank / total) * 100));
  return `${Math.round(pct)}th percentile`;
}

// Compact card for the dashboard: connected team at a glance.
export function FtcTeamCard() {
  const navigate = useNavigate();
  const { season, setSeason, data, loading, error, notConnected, knownSeasons, refresh } = useFtcTeam();

  if (loading) {
    return (
      <div className="card-surface p-6 lg:col-span-3 flex items-center gap-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm animate-pulse">Loading FTC stats…</p>
      </div>
    );
  }

  if (notConnected) {
    return (
      <div className="card-surface p-6 lg:col-span-3 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="rounded-xl bg-accent/12 p-3 w-fit">
          <Trophy className="w-6 h-6 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-display font-bold text-text-base">Connect your FTC team</h3>
          <p className="text-sm text-text-muted mt-0.5">Link your team number to pull live stats, rankings, and event history from FTC Scout.</p>
        </div>
        <button
          onClick={() => navigate('/settings?section=workspace')}
          className="flex items-center gap-2 bg-accent text-accent-ink font-bold px-5 py-2.5 rounded-xl hover:brightness-105 shadow-[0_4px_16px_rgba(255,199,0,0.25)] whitespace-nowrap"
        >
          <SettingsIcon className="w-4 h-4" /> Connect team
        </button>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-surface p-6 lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <CircleAlert className="w-6 h-6 text-rose-400 shrink-0" />
          <p className="text-sm text-text-muted flex-1">{seasonErrorText(error, season)}</p>
          <button onClick={refresh} className="flex items-center gap-1.5 text-sm text-accent font-bold hover:opacity-80">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
        {knownSeasons.length > 1 && <SeasonPills seasons={knownSeasons} active={season} onPick={setSeason} small />}
      </div>
    );
  }

  const best = data.events
    .filter((e) => e.rank != null)
    .sort((a, b) => (a.rank as number) - (b.rank as number))[0];

  return (
    <div className="card-surface p-6 lg:col-span-3 flex flex-col gap-5 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="bg-accent text-accent-ink font-display font-bold text-lg px-3 py-1 rounded-xl">#{data.number}</span>
            <h3 className="text-xl font-display font-bold text-text-base tracking-tight">{data.name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-text-muted">
            {data.school && <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />{data.school}</span>}
            {(data.city || data.state) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[data.city, data.state].filter(Boolean).join(', ')}</span>}
            {data.rookieYear && <span>Rookie {data.rookieYear}</span>}
          </div>
        </div>
        <SeasonPills seasons={data.seasons} active={season} onPick={setSeason} small />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <OprTile label="Total OPR" stat={data.opr.tot} icon={Target} accent />
        <OprTile label="Auto" stat={data.opr.auto} icon={Bot} />
        <OprTile label="TeleOp" stat={data.opr.dc} icon={Cog} />
        <OprTile label="Endgame" stat={data.opr.eg} icon={Flag} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-text-base/5 mt-1">
        <p className="text-xs text-text-muted pt-3">
          {best ? <>Best finish: <span className="text-text-base font-bold">#{best.rank} — {best.name}</span></> : 'No ranked events this season.'}
          <span className="ml-2 text-text-muted/60">Match data: ftcscout.org</span>
        </p>
        <button
          onClick={() => navigate('/stats')}
          className="flex items-center gap-1 text-sm font-bold text-accent hover:opacity-80 mt-2"
        >
          Full team stats <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Dedicated stats page: /stats — Compete (our team, in depth) and Analyze
// (event scouting workspace). Mode lives in ?mode= so links/back work.
export function TeamStatsView() {
  const { mode, setMode, season, setSeason, myTeam, focusTeam, viewTeam } = useTeamStats();

  const tabs = (
    <div className="inline-flex rounded-2xl card-surface p-1 gap-1" role="tablist" aria-label="Team stats mode">
      {([['compete', 'Compete', Trophy], ['analyze', 'Analyze', Search]] as const).map(([k, label, Icon]) => (
        <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${mode === k ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-text-base'}`}>
          <Icon className="w-4 h-4" />{label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5 pb-8 min-w-0">
      {tabs}
      {mode === 'compete' ? (
        <TeamScoutView
          number={null}
          season={season}
          onSeasonChange={setSeason}
          autoSeason
          actions={{ onViewTeam: viewTeam }}
        />
      ) : (
        <AnalyzeView key={focusTeam?.number ?? 'none'} season={season} onSeasonChange={setSeason} myTeam={myTeam} initialTeam={focusTeam} />
      )}
    </div>
  );
}
