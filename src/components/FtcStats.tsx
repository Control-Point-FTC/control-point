// FTC team statistics: shared hook + dashboard card + dedicated stats page.
// Match data comes from the backend's FTC Scout proxy (credited to ftc-scout.org).
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, MapPin, GraduationCap, CalendarDays, Target, Bot,
  Cog, Flag, Medal, ChevronRight, RefreshCw, Settings as SettingsIcon,
  ExternalLink, CircleAlert,
} from 'lucide-react';
import { fetchFtcTeam, invalidateFtcSeason, FtcNotConnectedError } from './ftcCache';

export interface FtcOprStat { value: number | null; rank: number | null }
export interface FtcEvent {
  code?: string; name: string; date: string | null; type: string | null;
  rank: number | null; wins: number | null; losses: number | null; ties: number | null;
  awards: string[];
}
export interface FtcTeamPayload {
  number: number; name: string; school?: string;
  city?: string; state?: string; country?: string;
  rookieYear?: number; seasons: number[]; season: number;
  opr: { tot: FtcOprStat | null; auto: FtcOprStat | null; dc: FtcOprStat | null; eg: FtcOprStat | null };
  events: FtcEvent[];
}

// FTC season number -> game name (season N = the N–N+1 school year)
export const FTC_SEASON_NAMES: Record<number, string> = {
  2022: 'POWERPLAY',
  2023: 'CENTERSTAGE',
  2024: 'INTO THE DEEP',
  2025: 'DECODE',
};
export const seasonLabel = (s: number) =>
  `${s}–${String(s + 1).slice(2)}${FTC_SEASON_NAMES[s] ? ` · ${FTC_SEASON_NAMES[s]}` : ''}`;

export function useFtcTeam() {
  const [season, setSeason] = useState(2025);
  const [data, setData] = useState<FtcTeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
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
    try {
      const payload = await fetchFtcTeam(s, controller.signal);
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setData(payload);
    } catch (e: any) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      if (e instanceof FtcNotConnectedError) {
        setNotConnected(true);
        setData(null);
      } else {
        setError(e?.message || 'Could not load team statistics');
        setData(null);
      }
    } finally {
      if (requestId === requestIdRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(season);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  return { season, setSeason, data, loading, error, notConnected, refresh: () => load(season, { refresh: true }) };
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
              : 'bg-white/5 text-text-muted hover:text-white hover:bg-white/10 border border-white/10')
          }
        >
          {s}–{String(s + 1).slice(2)}
        </button>
      ))}
    </div>
  );
}

function OprTile({ label, stat, icon: Icon, accent }: { label: string; stat: FtcOprStat | null; icon: any; accent?: boolean }) {
  return (
    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${accent ? 'text-accent' : 'text-text-muted'}`} />
        <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${accent ? 'text-accent' : 'text-white'}`}>
        {stat?.value != null ? stat.value : '—'}
      </p>
      <p className="text-[11px] text-text-muted">
        {stat?.rank != null ? <span className="text-white/80 font-semibold">Rank #{stat.rank.toLocaleString()}</span> : 'Unranked'}
      </p>
    </div>
  );
}

function recordLine(e: FtcEvent) {
  if (e.wins == null && e.losses == null) return null;
  return `${e.wins ?? 0}W – ${e.losses ?? 0}L${e.ties ? ` – ${e.ties}T` : ''}`;
}

// Compact card for the dashboard: connected team at a glance.
export function FtcTeamCard() {
  const navigate = useNavigate();
  const { season, setSeason, data, loading, error, notConnected, refresh } = useFtcTeam();

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
          <h3 className="text-lg font-display font-bold text-white">Connect your FTC team</h3>
          <p className="text-sm text-text-muted mt-0.5">Link your team number to pull live stats, rankings, and event history from FTC Scout.</p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 bg-accent text-accent-ink font-bold px-5 py-2.5 rounded-xl hover:brightness-105 shadow-[0_4px_16px_rgba(255,199,0,0.25)] whitespace-nowrap"
        >
          <SettingsIcon className="w-4 h-4" /> Connect team
        </button>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-surface p-6 lg:col-span-3 flex items-center gap-4">
        <CircleAlert className="w-6 h-6 text-rose-400 shrink-0" />
        <p className="text-sm text-text-muted flex-1">{error || 'Stats unavailable.'}</p>
        <button onClick={refresh} className="flex items-center gap-1.5 text-sm text-accent font-bold hover:opacity-80">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
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
            <h3 className="text-xl font-display font-bold text-white tracking-tight">{data.name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-text-muted">
            {data.school && <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />{data.school}</span>}
            {(data.city || data.state) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[data.city, data.state].filter(Boolean).join(', ')}</span>}
            {data.rookieYear && <span>Rookie {data.rookieYear}</span>}
          </div>
        </div>
        <SeasonPills seasons={data.seasons} active={season} onPick={setSeason} small />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OprTile label="Total OPR" stat={data.opr.tot} icon={Target} accent />
        <OprTile label="Auto" stat={data.opr.auto} icon={Bot} />
        <OprTile label="TeleOp" stat={data.opr.dc} icon={Cog} />
        <OprTile label="Endgame" stat={data.opr.eg} icon={Flag} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/5 mt-1">
        <p className="text-xs text-text-muted pt-3">
          {best ? <>Best finish: <span className="text-white font-bold">#{best.rank} — {best.name}</span></> : 'No ranked events this season.'}
          <span className="ml-2 text-text-muted/60">Match data: ftc-scout.org</span>
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

// Dedicated stats page: /stats
export function TeamStatsView() {
  const navigate = useNavigate();
  const { season, setSeason, data, loading, error, notConnected, refresh } = useFtcTeam();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted animate-pulse">Loading team statistics…</p>
      </div>
    );
  }

  if (notConnected) {
    return (
      <div className="card-surface p-10 flex flex-col items-center text-center gap-4 max-w-xl mx-auto">
        <div className="rounded-2xl bg-accent/12 p-4">
          <Trophy className="w-10 h-10 text-accent" />
        </div>
        <h3 className="text-xl font-display font-bold text-white">No FTC team connected yet</h3>
        <p className="text-sm text-text-muted">Connect your FTC team number in Settings to see live stats, OPR rankings, and event history from FTC Scout.</p>
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 bg-accent text-accent-ink font-bold px-6 py-3 rounded-xl hover:brightness-105"
        >
          <SettingsIcon className="w-4 h-4" /> Go to Settings
        </button>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card-surface p-10 flex flex-col items-center text-center gap-4 max-w-xl mx-auto">
        <CircleAlert className="w-10 h-10 text-rose-400" />
        <h3 className="text-xl font-display font-bold text-white">Couldn't load stats</h3>
        <p className="text-sm text-text-muted">{error || 'Something went wrong.'}</p>
        <button onClick={refresh} className="flex items-center gap-2 bg-accent text-accent-ink font-bold px-6 py-3 rounded-xl hover:brightness-105">
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </div>
    );
  }

  const sortedEvents = [...data.events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      {/* Team header */}
      <div className="card-surface p-6 sm:p-8 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shrink-0">
              <Trophy className="w-7 h-7 text-accent-ink" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-display font-bold text-white tracking-tight">Team {data.number}</h2>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-accent/15 text-accent px-2 py-1 rounded-full">{seasonLabel(season)}</span>
              </div>
              <p className="text-lg text-white/80 font-semibold mt-0.5">{data.name}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-text-muted">
                {data.school && <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />{data.school}</span>}
                {(data.city || data.state) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[data.city, data.state, data.country].filter(Boolean).join(', ')}</span>}
                {data.rookieYear && <span>Rookie year {data.rookieYear}</span>}
              </div>
            </div>
          </div>
          <a
            href={`https://ftc-scout.org/teams/${data.number}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-accent transition-colors"
          >
            View on FTC Scout <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="mt-5">
          <SeasonPills seasons={data.seasons} active={season} onPick={setSeason} />
        </div>
      </div>

      {/* OPR cards */}
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-accent" /> Offensive Power Rating
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OprTile label="Total OPR" stat={data.opr.tot} icon={Target} accent />
          <OprTile label="Autonomous" stat={data.opr.auto} icon={Bot} />
          <OprTile label="TeleOp" stat={data.opr.dc} icon={Cog} />
          <OprTile label="Endgame" stat={data.opr.eg} icon={Flag} />
        </div>
        <p className="text-[11px] text-text-muted/70 mt-2">OPR estimates a team's average point contribution per match. Ranks are worldwide for the selected season.</p>
      </div>

      {/* Event history */}
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent" /> Event History
        </h3>
        {sortedEvents.length === 0 ? (
          <div className="card-surface p-8 text-center text-sm text-text-muted">No events recorded for this season.</div>
        ) : (
          <div className="space-y-3">
            {sortedEvents.map((e, i) => (
              <div key={e.code || i} className="card-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-display font-bold text-lg ${e.rank === 1 ? 'bg-accent text-accent-ink' : 'bg-white/5 text-white'}`}>
                  {e.rank ?? '–'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{e.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-text-muted">
                    {e.date && <span>{e.date}</span>}
                    {e.type && <span className="uppercase tracking-wide">{e.type}</span>}
                    {recordLine(e) && <span className="text-white/70 font-semibold">{recordLine(e)}</span>}
                  </div>
                  {e.awards.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {e.awards.map((a) => (
                        <span key={a} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                          <Medal className="w-3 h-3" />{a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {e.rank != null && (
                  <span className="text-xs text-text-muted whitespace-nowrap">Rank <span className="text-white font-bold">#{e.rank}</span></span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-text-muted/60">Match data courtesy of <a href="https://ftc-scout.org" target="_blank" rel="noreferrer" className="underline hover:text-accent">ftc-scout.org</a> · OPR & rankings update as events report results</p>
    </div>
  );
}
