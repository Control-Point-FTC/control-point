// FTC team statistics: shared hook + dashboard card + dedicated stats page.
// Match data comes from the backend's FTC Scout proxy (credited to ftcscout.org).
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, MapPin, GraduationCap, CalendarDays, Target, Bot,
  Cog, Flag, Medal, ChevronRight, RefreshCw, Settings as SettingsIcon,
  ExternalLink, CircleAlert, X,
} from 'lucide-react';
import { fetchFtcTeam, fetchFtcEvent, invalidateFtcSeason, FtcNotConnectedError } from './ftcCache';
import type { FtcEventDetail, FtcMatch, FtcMatchTeam } from './ftcCache';

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

function sourceBadgeText(d: { source?: string; origin?: string; cached?: boolean; stale?: boolean }): string {
  const name = (s?: string) => (s === 'first-events' ? 'FIRST' : s === 'ftc-scout' ? 'FTC Scout' : null);
  if (d.cached || d.source === 'cache') {
    const from = name(d.origin);
    return `● ${d.stale ? 'Offline copy' : 'Cached'}${from ? ` · ${from}` : ''}`;
  }
  return d.source === 'first-events' ? '● Live · FIRST' : '● FTC Scout';
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

// Event detail modal: venue info + full match list with alliance breakdowns.
function FtcEventDetailModal({ event, season, teamNumber, onClose }: {
  event: FtcEvent; season: number; teamNumber: number; onClose: () => void;
}) {
  const [detail, setDetail] = useState<FtcEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    fetchFtcEvent(season, event.code || '', ctrl.signal)
      .then((d) => { if (!ctrl.signal.aborted) { setDetail(d); setLoading(false); } })
      .catch((e: any) => { if (!ctrl.signal.aborted) { setError(e?.message || 'Could not load event details'); setLoading(false); } });
    return () => ctrl.abort();
  }, [season, event.code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const quals = (detail?.matches || []).filter((m) => m.level === 'Quals');
  const playoffs = (detail?.matches || []).filter((m) => m.level !== 'Quals');

  const resultBadge = (r: FtcMatch['result']) => {
    if (r === 'win') return <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">Win</span>;
    if (r === 'loss') return <span className="text-[10px] font-bold uppercase tracking-wide bg-rose-500/15 text-rose-400 px-2 py-0.5 rounded-full">Loss</span>;
    if (r === 'tie') return <span className="text-[10px] font-bold uppercase tracking-wide bg-text-base/10 text-text-muted px-2 py-0.5 rounded-full">Tie</span>;
    return null;
  };

  const matchRow = (m: FtcMatch) => {
    const redWon = m.played && m.redScore != null && m.blueScore != null && m.redScore > m.blueScore;
    const blueWon = m.played && m.redScore != null && m.blueScore != null && m.blueScore > m.redScore;
    const alliance = (teams: FtcMatchTeam[], color: 'red' | 'blue') => (
      <div className="flex-1 min-w-0">
        {teams.map((t) => (
          <p key={t.number} className={`text-xs truncate ${t.number === teamNumber ? 'font-bold text-text-base' : 'text-text-muted'}`}>
            <span className={`font-mono ${color === 'red' ? 'text-rose-400/90' : 'text-sky-400/90'}`}>{t.number}</span>
            {' '}{t.name}
          </p>
        ))}
      </div>
    );
    return (
      <div key={`${m.level}-${m.num}`} className="flex items-center gap-3 py-2.5 border-b border-text-base/5 last:border-0">
        <span className="w-12 shrink-0 text-xs font-mono font-bold text-text-base">{m.label}</span>
        {alliance(m.red, 'red')}
        <div className="shrink-0 text-center">
          {m.played && m.redScore != null ? (
            <p className="text-sm font-mono font-bold">
              <span className={redWon ? 'text-text-base' : 'text-text-muted'}>{m.redScore}</span>
              <span className="text-text-muted/50 mx-1">–</span>
              <span className={blueWon ? 'text-text-base' : 'text-text-muted'}>{m.blueScore}</span>
            </p>
          ) : (
            <p className="text-[11px] text-text-muted/60 italic">scheduled</p>
          )}
        </div>
        {alliance(m.blue, 'blue')}
        <div className="w-14 shrink-0 flex justify-end">{resultBadge(m.result)}</div>
      </div>
    );
  };

  const dateRange = detail?.start
    ? detail.end && detail.end !== detail.start ? `${detail.start} → ${detail.end}` : detail.start
    : event.date;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Event details">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default" onClick={onClose} aria-label="Close event details" />
      <div className="relative w-full sm:max-w-2xl max-h-[88vh] overflow-hidden flex flex-col card-surface rounded-t-2xl sm:rounded-2xl border border-text-base/10 shadow-2xl">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-text-base/10 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-display font-bold text-lg ${placementBadgeClass(event.rank)}`}>
                {event.rank ?? '–'}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-display font-bold text-text-base leading-tight">{detail?.name || event.name}</h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-text-muted">
                  {dateRange && <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{dateRange}</span>}
                  {detail?.type && <span className="uppercase tracking-wide">{detail.type}</span>}
                </div>
                {(detail?.venue || detail?.city) && (
                  <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {[detail.venue, [detail.city, detail.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-text-base/10 text-text-muted hover:text-text-base transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Team's result at this event */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-xs">
            {event.rank != null && <span className="text-text-muted">Quals rank <span className="text-text-base font-bold">#{event.rank}</span></span>}
            {recordLine(event) && <span className="text-text-base/80 font-bold">{recordLine(event)}</span>}
            {detail?.oprNp != null && <span className="text-text-muted">Event OPR <span className="text-text-base font-bold">{detail.oprNp}</span></span>}
            {(detail?.awards || event.awards).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(detail?.awards?.length ? detail.awards : event.awards).map((a) => (
                  <span key={a} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                    <Medal className="w-3 h-3" />{a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Matches */}
        <div className="overflow-y-auto p-5 sm:p-6 custom-scrollbar">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-muted animate-pulse">Loading matches…</p>
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CircleAlert className="w-8 h-8 text-rose-400" />
              <p className="text-sm text-text-muted">{error}</p>
            </div>
          )}
          {!loading && !error && detail && (
            <div className="space-y-6">
              {quals.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">Qualification matches ({quals.length})</h4>
                  <div>{quals.map(matchRow)}</div>
                </div>
              )}
              {playoffs.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">Playoff matches ({playoffs.length})</h4>
                  <div>{playoffs.map(matchRow)}</div>
                </div>
              )}
              {quals.length === 0 && playoffs.length === 0 && (
                <p className="text-sm text-text-muted text-center py-8">No match data reported for this event yet.</p>
              )}
            </div>
          )}
        </div>
        <p className="px-5 py-3 border-t border-text-base/10 text-center text-[11px] text-text-muted/60 shrink-0">
          Match data courtesy of <a href="https://ftcscout.org" target="_blank" rel="noreferrer" className="underline hover:text-accent">ftcscout.org</a>
        </p>
      </div>
    </div>
  );
}

// Dedicated stats page: /stats
export function TeamStatsView() {
  const navigate = useNavigate();
  const { season, setSeason, data, loading, error, notConnected, knownSeasons, refresh } = useFtcTeam();
  const [selectedEvent, setSelectedEvent] = useState<FtcEvent | null>(null);

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
        <h3 className="text-xl font-display font-bold text-text-base">No FTC team connected yet</h3>
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
        <h3 className="text-xl font-display font-bold text-text-base">{isNoSeasonData(error) ? `No ${seasonLabel(season)} data yet` : "Couldn't load stats"}</h3>
        <p className="text-sm text-text-muted">{seasonErrorText(error, season)}</p>
        <button onClick={refresh} className="flex items-center gap-2 bg-accent text-accent-ink font-bold px-6 py-3 rounded-xl hover:brightness-105">
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
        {knownSeasons.length > 1 && <SeasonPills seasons={knownSeasons} active={season} onPick={setSeason} />}
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
                <h2 className="text-2xl font-display font-bold text-text-base tracking-tight">Team {data.number}</h2>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-accent/15 text-accent px-2 py-1 rounded-full">{seasonLabel(season)}</span>
                {data.source && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border border-text-base/15 text-text-muted"
                    title={data.fetchedAt ? `Last updated ${new Date(data.fetchedAt).toLocaleString()}` : undefined}
                  >
                    {sourceBadgeText(data)}
                  </span>
                )}
              </div>
              <p className="text-lg text-text-base/80 font-semibold mt-0.5">{data.name}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-text-muted">
                {data.school && <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />{data.school}</span>}
                {(data.city || data.state) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[data.city, data.state, data.country].filter(Boolean).join(', ')}</span>}
                {data.rookieYear && <span>Rookie year {data.rookieYear}</span>}
              </div>
              {data.sponsors && data.sponsors.length > 0 && (
                <p className="text-[11px] text-text-muted/80 mt-1.5">
                  <span className="font-bold uppercase tracking-wide text-text-muted/60">Sponsors: </span>
                  {data.sponsors.join(' · ')}
                </p>
              )}
            </div>
          </div>
          <a
            href={`https://ftcscout.org/teams/${data.number}`}
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
        <h3 className="text-sm font-bold text-text-base uppercase tracking-widest mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-accent" /> Offensive Power Rating
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <OprTile label="Total OPR" stat={data.opr.tot} icon={Target} accent />
          <OprTile label="Autonomous" stat={data.opr.auto} icon={Bot} />
          <OprTile label="TeleOp" stat={data.opr.dc} icon={Cog} />
          <OprTile label="Endgame" stat={data.opr.eg} icon={Flag} />
        </div>
        <p className="text-[11px] text-text-muted/70 mt-2">OPR estimates a team's average point contribution per match. Ranks are worldwide for the selected season.</p>
      </div>

      {/* Event history */}
      <div>
        <h3 className="text-sm font-bold text-text-base uppercase tracking-widest mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-accent" /> Event History
        </h3>
        {sortedEvents.length === 0 ? (
          <div className="card-surface p-8 text-center text-sm text-text-muted">No events recorded for this season.</div>
        ) : (
          <div className="space-y-3">
            {sortedEvents.map((e, i) => (
              <button
                key={e.code || i}
                onClick={() => e.code && setSelectedEvent(e)}
                className="w-full text-left card-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 hover:border-accent/30 transition-colors cursor-pointer group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-display font-bold text-lg ${placementBadgeClass(e.rank)}`}>
                  {e.rank ?? '–'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-base font-bold truncate group-hover:text-accent transition-colors">{e.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-text-muted">
                    {e.date && <span>{e.date}</span>}
                    {e.type && <span className="uppercase tracking-wide">{e.type}</span>}
                    {recordLine(e) && <span className="text-text-base/70 font-semibold">{recordLine(e)}</span>}
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
                <div className="flex items-center gap-3 shrink-0">
                  {e.rank != null && (
                    <span className="text-xs text-text-muted whitespace-nowrap">Rank <span className="text-text-base font-bold">#{e.rank}</span></span>
                  )}
                  {e.code && (
                    <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-accent opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      See details <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-text-muted/60">Match data courtesy of <a href="https://ftcscout.org" target="_blank" rel="noreferrer" className="underline hover:text-accent">ftcscout.org</a> · OPR & rankings update as events report results</p>

      {selectedEvent && (
        <FtcEventDetailModal
          event={selectedEvent}
          season={season}
          teamNumber={data.number}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
