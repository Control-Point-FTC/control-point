// Team Stats → Compete: a single team's season, fully interactive. Used for
// the workspace's own team (Compete tab) and, via `number`, for any team in
// Analyze → Team Detail. Every stat / row opens more context; nothing here
// compares two teams side by side — teams are measured against the event.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown, Target, Zap, Gauge, Flag, MapPin, GraduationCap, Trophy, Users, Swords, Bot, BookmarkPlus, BookmarkCheck,
  Pin, PinOff, Eye, ListOrdered, Award, CalendarDays, Clock, Settings as SettingsIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../ui';
import type { FtcEventFull, FtcMatchFull, FtcPointSplit, FtcTeamEventSummary, FtcTeamProfile } from '../../types/ftcScout';
import { fetchScoutEvent, fetchScoutTeam, ScoutHttpError } from '../../services/ftcScoutApi';
import { getScoutingContext, openBruno } from '../../services/brunoContext';
import {
  eventAverages, missingFields, partnersAndOpponents, percentile, perspective, POINT_LABELS, recordOf, seasonTrend,
  strengthsWeaknesses, teamMatches, trendDirection, winRate, type MatchPerspective, type PartnerRow, type TrendPoint,
} from '../../utils/ftcAnalysis';
import {
  ALLIANCE, ALL_SEASONS, EmptyState, ErrorState, QuickPop, ResultPill, SEASON_COLOR, SEASON_NAMES, SeasonChip, SeasonPicker,
  Sheet, Skeleton, SourceBadge, Sparkline, fmt, placementClass, relTime, seasonShort, statButtonClass,
} from './ScoutUi';

// ---------------------------------------------------------------------------
// Actions a host screen can offer on any team (never a "compare" action)
// ---------------------------------------------------------------------------

export interface TeamActions {
  onViewTeam?: (n: number, name?: string) => void;
  onAddShortlist?: (n: number, name: string) => void;
  shortlisted?: (n: number) => boolean;
  onTogglePin?: (n: number, name: string) => void;
  pinned?: (n: number) => boolean;
}

/** Ask Bruno about one team; the request carries that team as the scouting
 *  context (keeping the page's event) so the server loads its profile. */
export function scoutWithBruno(n: number, name: string, season: number) {
  const page = getScoutingContext();
  openBruno({
    prompt: `Scout team ${n} (${name}) for the ${seasonShort(season)} season: strengths, risks, penalty trends, and what to watch for in their next match. Cite the stats you use.`,
    scouting: { mode: 'analyze', season, eventCode: page?.season === season ? page.eventCode : null, selectedTeam: n },
  });
}

function TeamActionRow({ n, name, season, actions, onViewMatches, compact }: { n: number; name: string; season: number; actions: TeamActions; onViewMatches?: () => void; compact?: boolean }) {
  const btn = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-text-base/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
  const listed = actions.shortlisted?.(n);
  return (
    <div className={cn('flex flex-wrap gap-1', compact && 'gap-0.5')}>
      {actions.onViewTeam && <button className={btn} onClick={() => actions.onViewTeam!(n, name)}><Eye className="w-3.5 h-3.5" /> View team</button>}
      {onViewMatches && <button className={btn} onClick={onViewMatches}><ListOrdered className="w-3.5 h-3.5" /> View matches</button>}
      <button className={btn} onClick={() => scoutWithBruno(n, name, season)}><Bot className="w-3.5 h-3.5" /> Scout with Bruno</button>
      {actions.onAddShortlist && (
        <button className={cn(btn, listed && 'text-accent')} onClick={() => actions.onAddShortlist!(n, name)} aria-pressed={!!listed}>
          {listed ? <BookmarkCheck className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />} {listed ? 'On shortlist' : 'Add to shortlist'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

/** No results yet (used only to step back from a not-started current season). */
function hasNoResults(p: FtcTeamProfile): boolean {
  return !p.events.some((e) => e.stats && (e.stats.rank != null || e.stats.wins != null || e.stats.opr)) && p.opr?.tot?.value == null;
}

/** Nothing to show at all. Events without stats (e.g. FIRST-only seasons) still render. */
function isEmptySeason(p: FtcTeamProfile): boolean {
  return !p.events.length && p.opr?.tot?.value == null;
}

/** Team profile with BIOBUZZ-style empty-season handling (never an error). */
export function useScoutProfile(number: number | null, season: number, opts?: { onAutoSeason?: (s: number) => void }) {
  const [profile, setProfile] = useState<FtcTeamProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [noSeasonData, setNoSeasonData] = useState(false);
  const autoRef = useRef(!!opts?.onAutoSeason);
  const reqRef = useRef(0);

  const identity = `${number ?? 'me'}:${season}`;
  const shownRef = useRef<string | null>(null);
  const load = useCallback(async (force?: boolean) => {
    const id = ++reqRef.current;
    // A different team/season must never show the previous one's stats.
    if (shownRef.current !== identity) { setProfile(null); shownRef.current = null; }
    setLoading(true);
    setError(null);
    setNoSeasonData(false);
    setNotConnected(false);
    try {
      const p = await fetchScoutTeam(season, number, { force });
      if (id !== reqRef.current) return;
      // First load of the current season with nothing yet → step back once.
      if (autoRef.current && hasNoResults(p)) {
        const prev = p.seasons.filter((s) => s < season).sort((a, b) => b - a)[0];
        autoRef.current = false;
        if (prev && opts?.onAutoSeason) { opts.onAutoSeason(prev); return; }
      }
      autoRef.current = false;
      setProfile(p);
      shownRef.current = identity;
      setNoSeasonData(isEmptySeason(p));
    } catch (e) {
      if (id !== reqRef.current) return;
      const status = e instanceof ScoutHttpError ? e.status : 0;
      const msg = e instanceof Error ? e.message : 'Could not load team data';
      if (status === 404 && /no ftc team connected/i.test(msg)) { setNotConnected(true); setProfile(null); }
      else if (status === 404) {
        if (autoRef.current && opts?.onAutoSeason && season > 2022) { autoRef.current = false; opts.onAutoSeason(season - 1); return; }
        setNoSeasonData(true);
        setProfile(null);
      } else { setError(msg); }
      autoRef.current = false;
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, season]);

  // Invalidate in-flight requests when the identity changes or on unmount.
  useEffect(() => { void load(); return () => { reqRef.current++; }; }, [load]);
  return { profile, loading, error, notConnected, noSeasonData, reload: () => load(true) };
}

/** Lazily loads event payloads (shared 10-min cache) for a list of codes. */
function useEvents(season: number, codes: string[], enabled: boolean) {
  const [events, setEvents] = useState<Record<string, FtcEventFull>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const key = codes.join(',');
  useEffect(() => {
    if (!enabled || !codes.length) return;
    let alive = true;
    setLoading(true);
    void Promise.all(codes.map((c) =>
      fetchScoutEvent(season, c)
        .then((ev) => { if (alive) setEvents((s) => ({ ...s, [c]: ev })); })
        .catch((e) => { if (alive) setErrors((s) => ({ ...s, [c]: e instanceof Error ? e.message : 'Failed' })); })
    )).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, key, enabled]);
  return { events, errors, loading };
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function TeamScoutView({ number, season, onSeasonChange, actions = {}, autoSeason, headerExtra }: {
  /** null = the workspace's own team. */
  number: number | null;
  season: number;
  onSeasonChange: (s: number) => void;
  actions?: TeamActions;
  /** Step back from an empty current season on first load (own team). */
  autoSeason?: boolean;
  headerExtra?: ReactNode;
}) {
  const navigate = useNavigate();
  const { profile, loading, error, notConnected, noSeasonData, reload } = useScoutProfile(number, season, autoSeason ? { onAutoSeason: onSeasonChange } : undefined);
  const [oprOpen, setOprOpen] = useState<'tot' | 'auto' | 'dc' | 'eg' | null>(null);
  const [trendOpen, setTrendOpen] = useState<TrendKey | null>(null);
  const [match, setMatch] = useState<{ m: FtcMatchFull; ev: FtcEventFull } | null>(null);
  const seasons = profile?.seasons?.length ? [...new Set([...profile.seasons, 2026])].sort((a, b) => b - a) : ALL_SEASONS;

  if (loading && !profile) return <ProfileSkeleton />;
  if (notConnected) {
    return (
      <EmptyState
        title="No FTC team connected yet"
        body="Connect your FTC team number in Settings to see live stats, OPR rankings and event history."
        action={<button onClick={() => navigate('/settings?section=workspace')} className="mt-2 inline-flex items-center gap-2 bg-accent text-accent-ink font-bold px-5 py-2.5 rounded-xl"><SettingsIcon className="w-4 h-4" /> Go to Settings</button>}
      />
    );
  }
  if (error && !profile) return <div className="space-y-3"><SeasonPicker seasons={seasons} value={season} onChange={onSeasonChange} /><ErrorState message={error} onRetry={reload} note="FIRST Events and FTC Scout were both unreachable and there's no cached copy yet." /></div>;
  if (noSeasonData || !profile) {
    return (
      <div className="space-y-4">
        <SeasonPicker seasons={seasons} value={season} onChange={onSeasonChange} />
        <EmptyState
          title={`No ${seasonShort(season)}${SEASON_NAMES[season] ? ` · ${SEASON_NAMES[season]}` : ''} data yet`}
          body="Season not started or no data is available yet. Pick another season to see past results."
        />
      </div>
    );
  }

  const p = profile;
  const trend = seasonTrend(p.events);
  return (
    <div className="space-y-4 sm:space-y-6 pb-8 min-w-0">
      <TeamHeader p={p} season={season} seasons={seasons} onSeasonChange={onSeasonChange} actions={actions} extra={headerExtra} />
      {error && <ErrorState message={`Couldn't refresh: ${error}`} onRetry={reload} note="Showing the last loaded data." />}

      <section aria-labelledby="opr-h">
        <SectionTitle id="opr-h" icon={Target} title="Offensive power rating" right={<SourceBadge f={{ source: 'ftc-scout', fetchedAt: p.fetchedAt, cached: p.cached || p.source === 'cache' }} />} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([['tot', 'Total OPR', Target], ['auto', 'Autonomous', Zap], ['dc', 'TeleOp', Gauge], ['eg', 'Endgame', Flag]] as const).map(([k, label, Icon]) => (
            <OprTile key={k} label={label} icon={Icon} stat={p.opr?.[k] ?? null} total={p.totalTeams} accent={k === 'tot'} onOpen={() => setOprOpen(k)} fetchedAt={p.fetchedAt} />
          ))}
        </div>
        {p.opr?.tot?.value == null && <p className="text-xs text-text-muted mt-2">No OPR data available from either source for this season (FIRST Events doesn't publish OPR; FTC Scout has none yet).</p>}
      </section>

      <TrendsSection trend={trend} season={season} onOpen={setTrendOpen} />

      <section aria-labelledby="events-h">
        <SectionTitle id="events-h" icon={CalendarDays} title={`Event history (${p.events.length})`} right={<SourceBadge f={p} />} />
        {p.events.length ? (
          <div className="space-y-3">
            {[...p.events].reverse().map((e) => (
              <EventCard key={`${season}:${e.code}`} e={e} team={p.number} season={season} actions={actions} onMatch={(m, ev) => setMatch({ m, ev })} />
            ))}
          </div>
        ) : <EmptyState title="No events found" body={`${p.name} has no events in ${seasonShort(season)} yet.`} />}
      </section>

      <PartnersSection p={p} season={season} actions={actions} onMatch={(m, ev) => setMatch({ m, ev })} />

      <OprSheet which={oprOpen} p={p} season={season} onClose={() => setOprOpen(null)} />
      <TrendSheet which={trendOpen} trend={trend} season={season} onClose={() => setTrendOpen(null)} />
      <MatchSheet sel={match} team={p.number} onClose={() => setMatch(null)} actions={actions} season={season} />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading team statistics">
      <div className="card-surface p-6 space-y-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72" /><Skeleton className="h-8 w-80" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
    </div>
  );
}

function SectionTitle({ id, icon: Icon, title, right }: { id: string; icon: typeof Target; title: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <h3 id={id} className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-text-base"><Icon className="w-4 h-4 text-accent" /> {title}</h3>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function TeamHeader({ p, season, seasons, onSeasonChange, actions, extra }: { p: FtcTeamProfile; season: number; seasons: number[]; onSeasonChange: (s: number) => void; actions: TeamActions; extra?: ReactNode }) {
  const [sponsorsOpen, setSponsorsOpen] = useState(false);
  const loc = [p.city, p.state, p.country].filter(Boolean).join(', ');
  const tone = SEASON_COLOR[season]?.hex || 'var(--color-accent)';
  return (
    <div className="card-surface relative overflow-hidden p-5 sm:p-7 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl opacity-20" style={{ background: tone }} aria-hidden="true" />
      <div className="relative flex flex-wrap items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shrink-0"><Trophy className="w-7 h-7 text-accent-ink" strokeWidth={2.5} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-display font-bold text-text-base tracking-tight">Team {p.number}</h2>
            <SeasonChip season={season} />
            <SourceBadge f={p} />
          </div>
          <p className="text-lg text-text-base/85 font-semibold mt-0.5 break-words">{p.name}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-text-muted">
            {p.school && <span className="flex items-center gap-1 min-w-0"><GraduationCap className="w-3.5 h-3.5 shrink-0" /><span className="truncate max-w-[16rem]">{p.school}</span></span>}
            {loc && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{loc}</span>}
            {p.rookieYear && <span>Rookie year {p.rookieYear}</span>}
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Updated {relTime(p.fetchedAt)}</span>
          </div>
          {p.sponsors.length > 0 && (
            <button className={cn(statButtonClass, 'mt-1.5 text-xs text-text-muted px-1 -mx-1 max-w-full')} onClick={() => setSponsorsOpen((v) => !v)} aria-expanded={sponsorsOpen}>
              <span className="font-bold uppercase tracking-wider text-[10px] text-text-base/70">Sponsors ({p.sponsors.length}):</span>{' '}
              {sponsorsOpen ? p.sponsors.join(' · ') : <span className="truncate inline-block align-bottom max-w-[60vw] sm:max-w-md">{p.sponsors.slice(0, 2).join(' · ')}{p.sponsors.length > 2 ? ' …' : ''}</span>}
            </button>
          )}
        </div>
        {extra}
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        <SeasonPicker seasons={seasons} value={season} onChange={onSeasonChange} small />
        {(actions.onAddShortlist || actions.onTogglePin) && (
          <div className="flex flex-wrap gap-1 sm:ml-auto">
            <TeamActionRow n={p.number} name={p.name} season={season} actions={{ ...actions, onViewTeam: undefined }} compact />
            {actions.onTogglePin && (
              <button
                onClick={() => actions.onTogglePin!(p.number, p.name)}
                aria-pressed={!!actions.pinned?.(p.number)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-text-base/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {actions.pinned?.(p.number) ? <><PinOff className="w-3.5 h-3.5" /> Unpin</> : <><Pin className="w-3.5 h-3.5" /> Pin team</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OPR tiles + breakdown sheet
// ---------------------------------------------------------------------------

function OprTile({ label, icon: Icon, stat, total, accent, onOpen, fetchedAt }: { label: string; icon: typeof Target; stat: { value: number | null; rank: number | null } | null; total: number | null; accent?: boolean; onOpen: () => void; fetchedAt: string }) {
  const pct = percentile(stat?.rank ?? null, total);
  return (
    <button onClick={onOpen} className="group p-4 card-surface flex flex-col gap-1 text-left transition-all hover:!border-accent/50 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" aria-label={`${label}: ${stat?.value ?? 'no data'}. Open breakdown`}>
      <span className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5', accent ? 'text-accent' : 'text-text-muted')} />
        <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 ml-auto -rotate-90 text-text-muted/60 group-hover:text-accent" />
      </span>
      <span className={cn('text-2xl font-display font-bold', accent ? 'text-accent' : 'text-text-base')}>{fmt(stat?.value ?? null)}</span>
      <span className="text-[11px] text-text-muted">
        {stat?.rank != null ? <span className="text-text-base/80 font-semibold">Rank #{stat.rank.toLocaleString()}</span> : 'Unranked'}
        {pct != null && <span> · {pct}th pct</span>}
      </span>
      <span className="text-[10px] text-text-muted/70">Season · FTC Scout · {relTime(fetchedAt)}</span>
    </button>
  );
}

const OPR_COMPONENT: Record<'tot' | 'auto' | 'dc' | 'eg', { label: string; key: keyof FtcPointSplit }> = {
  tot: { label: 'Total OPR (no penalties)', key: 'totalNp' },
  auto: { label: 'Autonomous OPR', key: 'auto' },
  dc: { label: 'TeleOp OPR', key: 'teleop' },
  eg: { label: 'Endgame OPR', key: 'endgame' },
};

function OprSheet({ which, p, season, onClose }: { which: 'tot' | 'auto' | 'dc' | 'eg' | null; p: FtcTeamProfile; season: number; onClose: () => void }) {
  const evs = p.events.filter((e) => e.stats);
  const { events, loading } = useEvents(season, evs.map((e) => e.code), which != null);
  if (!which) return null;
  const comp = OPR_COMPONENT[which];
  const stat = p.opr?.[which];
  const rows = evs.map((e) => {
    const v = e.stats?.opr?.[comp.key] ?? null;
    const ev = events[e.code];
    const avg = ev ? eventAverages(ev.field) : null;
    const avgV = avg ? (comp.key === 'totalNp' ? avg.opr.totalNp : comp.key === 'auto' ? avg.opr.auto : comp.key === 'teleop' ? avg.opr.teleop : avg.opr.endgame) : null;
    return { e, v, avgV, split: e.stats?.opr ?? null };
  });
  const vals = rows.map((r) => r.v);
  const dir = trendDirection(vals);
  return (
    <Sheet open onClose={onClose} title={comp.label} subtitle={<>Season value {fmt(stat?.value ?? null)}{stat?.rank != null ? ` · rank #${stat.rank.toLocaleString()}` : ''}{p.totalTeams ? ` of ${p.totalTeams.toLocaleString()}` : ''} · OPR via FTC Scout (FIRST Events doesn't publish OPR)</>}>
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2">Season trend {dir && <span className="normal-case tracking-normal font-semibold text-text-base/80">· {dir === 'up' ? 'improving' : dir === 'down' ? 'declining' : 'steady'}</span>}</p>
          <Sparkline values={vals} height={56} label={comp.label} />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2">Events contributing</p>
          {rows.length ? (
            <div className="space-y-2">
              {rows.map(({ e, v, avgV, split }) => (
                <div key={e.code} className="rounded-xl border border-text-base/10 p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-semibold text-sm text-text-base min-w-0 break-words flex-1">{e.name}</p>
                    <span className="text-lg font-display font-bold text-accent">{fmt(v)}</span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {e.date ?? '—'} · event avg {loading && avgV == null ? '…' : fmt(avgV)}
                    {v != null && avgV != null && <span className={cn('ml-1 font-bold', v >= avgV ? 'text-emerald-300' : 'text-rose-300')}>({v >= avgV ? '+' : ''}{fmt(v - avgV)})</span>}
                  </p>
                  {split && <p className="text-[11px] text-text-muted mt-1">Components: auto {fmt(split.auto)} · TeleOp {fmt(split.teleop)} · endgame {fmt(split.endgame)} · penalties given {fmt(split.penaltiesCommitted)}</p>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-text-muted">No events with OPR this season.</p>}
        </div>
        <p className="text-[11px] text-text-muted">Match-level contributions aren't published by either source — OPR is solved across all of an event's matches, so it's shown per event. {p.source === 'cache' && 'This is a cached copy.'}</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

type TrendKey = 'opr' | 'winRate' | 'avgScore' | 'avgPenalties' | 'auto' | 'teleop' | 'endgame' | 'rp';
const TRENDS: { key: TrendKey; label: string; suffix?: string; lowerIsBetter?: boolean }[] = [
  { key: 'opr', label: 'OPR by event' },
  { key: 'winRate', label: 'Win rate', suffix: '%' },
  { key: 'avgScore', label: 'Avg alliance score' },
  { key: 'avgPenalties', label: 'Avg penalties given', lowerIsBetter: true },
  { key: 'auto', label: 'Autonomous OPR' },
  { key: 'teleop', label: 'TeleOp OPR' },
  { key: 'endgame', label: 'Endgame OPR' },
  { key: 'rp', label: 'Ranking points' },
];

function TrendsSection({ trend, season, onOpen }: { trend: TrendPoint[]; season: number; onOpen: (k: TrendKey) => void }) {
  return (
    <section aria-labelledby="trends-h">
      <SectionTitle id="trends-h" icon={Gauge} title="Trends" />
      {trend.length ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TRENDS.map((t) => {
            const vals = trend.map((p) => p[t.key]);
            const last = [...vals].reverse().find((v) => v != null) ?? null;
            const dir = trendDirection(vals);
            const good = dir === 'flat' || dir == null ? null : (dir === 'up') !== !!t.lowerIsBetter;
            return (
              <button key={t.key} onClick={() => onOpen(t.key)} className="card-surface p-3 text-left hover:!border-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60" aria-label={`${t.label} trend — open details`}>
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">{t.label}</span>
                <span className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-display font-bold text-text-base">{fmt(last)}{last != null && t.suffix}</span>
                  {dir && <span className={cn('text-[10px] font-bold', good == null ? 'text-text-muted' : good ? 'text-emerald-300' : 'text-rose-300')}>{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}</span>}
                </span>
                <Sparkline values={vals} label={t.label} className="mt-1" />
              </button>
            );
          })}
        </div>
      ) : <EmptyState title="No trend data yet" body={`Trends appear after events in ${seasonShort(season)} have results.`} />}
    </section>
  );
}

function TrendSheet({ which, trend, season, onClose }: { which: TrendKey | null; trend: TrendPoint[]; season: number; onClose: () => void }) {
  if (!which) return null;
  const t = TRENDS.find((x) => x.key === which)!;
  const vals = trend.map((p) => p[which]);
  return (
    <Sheet open onClose={onClose} title={t.label} subtitle={`${seasonShort(season)} · event by event · FTC Scout per-event stats`}>
      <Sparkline values={vals} height={80} label={t.label} />
      <table className="w-full mt-4 text-sm">
        <thead><tr className="text-[10px] uppercase tracking-wider text-text-muted text-left"><th className="py-2 font-bold">Event</th><th className="py-2 font-bold">Date</th><th className="py-2 font-bold text-right">Value</th><th className="py-2 font-bold text-right">Rank</th></tr></thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.code} className="border-t border-text-base/10">
              <td className="py-2 pr-2 text-text-base break-words">{p.label}</td>
              <td className="py-2 pr-2 text-text-muted whitespace-nowrap">{p.date ?? '—'}</td>
              <td className="py-2 text-right font-bold text-text-base">{fmt(p[which])}{p[which] != null && t.suffix}</td>
              <td className="py-2 text-right text-text-muted">{p.rank != null ? `#${p.rank}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {vals.some((v) => v == null) && <p className="text-[11px] text-text-muted mt-3">Blank values: that event didn't report this stat (e.g. no OPR from FTC Scout, or no qualification matches).</p>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Event cards (expandable, lazy)
// ---------------------------------------------------------------------------

function EventCard({ e, team, season, actions, onMatch }: { e: FtcTeamEventSummary; team: number; season: number; actions: TeamActions; onMatch: (m: FtcMatchFull, ev: FtcEventFull) => void }) {
  const [open, setOpen] = useState(false);
  const [ev, setEv] = useState<FtcEventFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const s = e.stats;
  const load = useCallback((force?: boolean) => {
    setLoading(true);
    setErr(null);
    fetchScoutEvent(season, e.code, { force })
      .then(setEv)
      .catch((x) => setErr(x instanceof Error ? x.message : 'Could not load event'))
      .finally(() => setLoading(false));
  }, [season, e.code]);
  // Load once when first opened; after a failure the error stays up with a
  // Retry button instead of re-requesting in a loop.
  useEffect(() => { if (open && !ev && !loading && !err) load(); }, [open, ev, loading, err, load]);
  const panelId = `ev-${e.code}`;
  return (
    <div className={cn('card-surface overflow-hidden transition-colors', open && '!border-accent/30')}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId} className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-text-base/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-display font-bold text-lg', placementClass(s?.rank ?? null))} title={s?.rank != null ? `Qualification rank #${s.rank}` : 'No ranking'}>
          {s?.rank ?? '–'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-text-base break-words">{e.name}</p>
          <p className="text-xs text-text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{e.date ?? 'Date TBA'}</span>
            {(e.city || e.state) && <span>{[e.city, e.state].filter(Boolean).join(', ')}</span>}
            {e.type && <span className="uppercase tracking-wider">{e.type}</span>}
          </p>
          {s?.awards?.length ? (
            <div className="flex flex-wrap gap-1 mt-1.5">{s.awards.map((a) => <span key={a} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-accent/15 text-accent px-1.5 py-0.5 rounded-md"><Award className="w-3 h-3" />{a}</span>)}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-right sm:justify-end">
          <Stat label="W-L-T" value={s?.wins != null ? `${s.wins}-${s.losses}-${s.ties}` : '—'} />
          <Stat label="RP" value={fmt(s?.rp ?? null)} />
          <Stat label="Event OPR" value={fmt(s?.opr?.totalNp ?? null)} accent />
          <ChevronDown className={cn('w-5 h-5 text-text-muted transition-transform', open && 'rotate-180')} />
        </div>
      </button>
      {open && (
        <div id={panelId} className="border-t border-text-base/10 p-4 sm:p-5 space-y-5">
          {loading && !ev && <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
          {err && <ErrorState message={err} onRetry={() => load(true)} />}
          {ev && <EventDetail ev={ev} team={team} season={season} actions={actions} onMatch={(m) => onMatch(m, ev)} />}
          {!ev && !loading && !err && <p className="text-sm text-text-muted">No event data.</p>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      <span className={cn('font-bold', accent ? 'text-accent' : 'text-text-base')}>{value}</span>
    </span>
  );
}

function EventDetail({ ev, team, season, actions, onMatch }: { ev: FtcEventFull; team: number; season: number; actions: TeamActions; onMatch: (m: FtcMatchFull) => void }) {
  const ps = teamMatches(ev, team);
  const quals = ps.filter((p) => p.match.level === 'qual');
  const playoffs = ps.filter((p) => p.match.level === 'playoff');
  const avg = eventAverages(ev.field);
  const me = ev.field.find((t) => t.teamNumber === team) || null;
  const tags = strengthsWeaknesses(me, avg);
  const alliance = ev.alliances.find((a) => a.captain === team || a.picks.includes(team));
  const { partners, opponents } = partnersAndOpponents([ev], team);
  const [showAllRanks, setShowAllRanks] = useState(false);
  const ranked = ev.field.filter((t) => t.rank != null);
  const shownRanks = showAllRanks ? ranked : ranked.slice(0, 8);
  const meInList = shownRanks.some((t) => t.teamNumber === team);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><SourceBadge f={ev} />{ev.venue && <span className="text-xs text-text-muted flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{ev.venue}</span>}</div>

      {me && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['totalNp', 'auto', 'teleop', 'endgame'] as const).map((k) => {
            const v = me.opr?.[k] ?? null;
            const a = avg.opr[k];
            const pct = v != null && a != null && Math.max(v, a) > 0 ? Math.min(100, (v / Math.max(v, a, 1)) * 100) : 0;
            return (
              <QuickPop key={k} className="block" content={<><p className="font-bold">{POINT_LABELS[k]}</p><p>{team}: {fmt(v)} · event avg {fmt(a)} ({avg.teams} teams)</p></>}>
                <div tabIndex={0} className="w-full rounded-xl border border-text-base/10 p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{POINT_LABELS[k]}</p>
                  <p className="text-sm font-bold text-text-base">{fmt(v)} <span className="text-[11px] font-semibold text-text-muted">/ avg {fmt(a)}</span></p>
                  <div className="h-1.5 mt-1.5 rounded-full bg-text-base/10 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
                </div>
              </QuickPop>
            );
          })}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t.label} title={t.detail} className={cn('text-[11px] font-bold px-2 py-1 rounded-lg border', t.kind === 'strength' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30')}>{t.label}</span>)}
        </div>
      )}
      {me && missingFields(me).length > 0 && <p className="text-[11px] text-text-muted">Not available for this event: {missingFields(me).join(', ')}.</p>}

      <MatchList title={`Qualification matches (${quals.length})`} ps={quals} team={team} onMatch={onMatch} empty="No qualification matches for this team at this event." />
      <MatchList title={`Playoff matches (${playoffs.length})`} ps={playoffs} team={team} onMatch={onMatch} empty="Didn't play in the playoffs here." />

      {ranked.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2">Event rankings</p>
          <div className="rounded-xl border border-text-base/10 divide-y divide-text-base/10 overflow-hidden">
            {[...shownRanks, ...(!meInList && me ? [me] : [])].map((t) => (
              <button key={t.teamNumber} onClick={() => actions.onViewTeam?.(t.teamNumber, t.name)} disabled={!actions.onViewTeam || t.teamNumber === team}
                className={cn('w-full flex items-center gap-3 px-3 py-2 text-left text-sm enabled:hover:bg-text-base/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60', t.teamNumber === team && 'bg-accent/10')}>
                <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0', placementClass(t.rank))}>{t.rank}</span>
                <span className="flex-1 min-w-0 truncate"><span className="font-bold text-text-base">{t.teamNumber}</span> <span className="text-text-muted">{t.name}</span></span>
                <span className="text-xs text-text-muted whitespace-nowrap">{t.wins != null ? `${t.wins}-${t.losses}-${t.ties}` : ''}{t.rp != null ? ` · ${fmt(t.rp)} RP` : ''}</span>
              </button>
            ))}
          </div>
          {ranked.length > 8 && <button onClick={() => setShowAllRanks((v) => !v)} className="mt-2 text-xs font-bold text-accent hover:opacity-80">{showAllRanks ? 'Show top 8' : `Show all ${ranked.length}`}</button>}
        </div>
      )}

      {ev.alliances.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2">Alliance selection</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {ev.alliances.map((a) => (
              <div key={a.number} className={cn('rounded-xl border p-2.5 text-sm', alliance?.number === a.number ? 'border-accent/50 bg-accent/10' : 'border-text-base/10')}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{a.name || `Alliance ${a.number}`}</p>
                <p className="text-text-base">{[a.captain, ...a.picks].filter(Boolean).map((n, i) => <span key={n} className={cn(n === team && 'font-bold text-accent')}>{i ? ' · ' : ''}{n}{i === 0 ? ' (C)' : ''}</span>)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(partners.length > 0 || opponents.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <MiniPeople title="Teammates here" icon={Users} rows={partners.slice(0, 5)} season={season} actions={actions} />
          <MiniPeople title="Frequent opponents here" icon={Swords} rows={opponents.slice(0, 5)} season={season} actions={actions} />
        </div>
      )}
    </div>
  );
}

function MiniPeople({ title, icon: Icon, rows, season, actions }: { title: string; icon: typeof Users; rows: PartnerRow[]; season: number; actions: TeamActions }) {
  return (
    <div className="rounded-xl border border-text-base/10 p-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{title}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.number} className="text-sm">
            <QuickPop content={<><p className="font-bold">{r.number} {r.name}</p><p>{r.matches} matches · {r.wins}-{r.losses}-{r.ties} · avg score {fmt(r.avgScore)}</p></>}>
              <button onClick={() => (actions.onViewTeam ? actions.onViewTeam(r.number, r.name) : scoutWithBruno(r.number, r.name, season))} className={cn(statButtonClass, 'px-1 -mx-1')}>
                <span className="font-bold text-text-base">{r.number}</span> <span className="text-text-muted">{r.name}</span>
              </button>
            </QuickPop>
            <span className="text-xs text-text-muted"> · {r.matches}× · {r.wins}-{r.losses}-{r.ties}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchList({ title, ps, team, onMatch, empty }: { title: string; ps: MatchPerspective[]; team: number; onMatch: (m: FtcMatchFull) => void; empty: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2">{title}</p>
      {ps.length ? <div className="space-y-1.5">{ps.map((p) => <MatchRow key={p.match.key} p={p} team={team} onOpen={() => onMatch(p.match)} />)}</div> : <p className="text-sm text-text-muted">{empty}</p>}
    </div>
  );
}

function AllianceTeams({ side, team, teams }: { side: 'red' | 'blue'; team: number; teams: FtcMatchFull['red']['teams'] }) {
  const c = ALLIANCE[side];
  return (
    <span className="flex flex-wrap gap-1">
      {teams.map((t) => (
        <span key={t.number} title={t.name} className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-md border', c.edge, t.number === team ? c.chip : cn(c.text, 'bg-text-base/[0.03]'))}>
          {t.number}{t.surrogate ? '*' : ''}
        </span>
      ))}
    </span>
  );
}

export function MatchRow({ p, team, onOpen, eventName }: { p: MatchPerspective; team: number; onOpen: () => void; eventName?: string }) {
  const m = p.match;
  const c = ALLIANCE[p.alliance];
  return (
    <button onClick={onOpen} className={cn('w-full grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-left transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60', c.surface, c.edge)} aria-label={`${m.label}${eventName ? ` at ${eventName}` : ''}: ${p.result ?? 'unplayed'}, ${p.scoreFor ?? '—'} to ${p.scoreAgainst ?? '—'}. Open match details`}>
      <span className="flex flex-col items-start">
        <span className="text-xs font-black text-text-base">{m.label}</span>
        <span className={cn('text-[9px] font-bold uppercase tracking-wider', c.text)}>{c.label}</span>
      </span>
      <span className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
        <AllianceTeams side="red" team={team} teams={m.red.teams} />
        <span className="hidden sm:inline text-[10px] text-text-muted">vs</span>
        <AllianceTeams side="blue" team={team} teams={m.blue.teams} />
        {eventName && <span className="text-[10px] text-text-muted truncate">{eventName}</span>}
      </span>
      <span className="flex items-center gap-2 justify-self-end">
        <span className="text-sm font-display font-bold tabular-nums">
          <span className={ALLIANCE.red.text}>{m.red.score?.total ?? '—'}</span>
          <span className="text-text-muted mx-0.5">–</span>
          <span className={ALLIANCE.blue.text}>{m.blue.score?.total ?? '—'}</span>
        </span>
        <ResultPill result={p.result} />
      </span>
      {p.penaltiesCommitted != null && p.penaltiesCommitted > 0 && (
        <span className="col-start-2 col-span-2 text-[10px] text-amber-300">{p.penaltiesCommitted} penalty pts given by {c.label.toLowerCase()}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Match detail sheet (alliance scoring breakdown)
// ---------------------------------------------------------------------------

export function MatchSheet({ sel, team, onClose, actions, season }: { sel: { m: FtcMatchFull; ev: FtcEventFull } | null; team: number; onClose: () => void; actions: TeamActions; season: number }) {
  if (!sel) return null;
  const { m, ev } = sel;
  const p = perspective(m, team);
  const rows: { k: keyof FtcPointSplit; label: string }[] = [
    { k: 'auto', label: 'Autonomous' },
    { k: 'teleop', label: 'TeleOp' },
    { k: 'endgame', label: 'Endgame' },
    { k: 'penaltiesCommitted', label: 'Penalties committed' },
    { k: 'totalNp', label: 'Total (no penalties)' },
    { k: 'total', label: 'Final score' },
  ];
  const diff = m.red.score?.total != null && m.blue.score?.total != null ? m.red.score.total - m.blue.score.total : null;
  return (
    <Sheet open onClose={onClose} wide
      title={<span className="flex flex-wrap items-center gap-2">{m.label}{m.description && <span className="text-sm font-semibold text-text-muted">· {m.description}</span>}{p && <ResultPill result={p.result} />}</span>}
      subtitle={<span className="flex flex-wrap items-center gap-2">{ev.name}{m.time ? ` · ${new Date(m.time).toLocaleString()}` : ''}<SourceBadge f={{ source: m.breakdownSource ?? ev.source, fetchedAt: ev.fetchedAt, cached: ev.cached }} /></span>}>
      {!m.played ? <EmptyState title="Not played yet" body="Scores appear once the match result is posted." /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['red', 'blue'] as const).map((side) => {
              const a = m[side];
              const c = ALLIANCE[side];
              const won = diff != null && (side === 'red' ? diff > 0 : diff < 0);
              return (
                <div key={side} className={cn('rounded-2xl border p-3', c.surface, c.edge, won && 'ring-1 ring-inset ring-current')}>
                  <p className={cn('text-[10px] font-black uppercase tracking-widest', c.text)}>{c.label} alliance{won ? ' · winner' : ''}</p>
                  <p className="text-3xl font-display font-bold text-text-base tabular-nums mt-1">{a.score?.total ?? '—'}</p>
                  <ul className="mt-2 space-y-1">
                    {a.teams.map((t) => (
                      <li key={t.number} className={cn('text-xs flex items-center gap-1.5 min-w-0', t.number === team && 'font-bold')}>
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />
                        {actions.onViewTeam && t.number !== team ? (
                          <button onClick={() => { onClose(); actions.onViewTeam!(t.number, t.name); }} className={cn(statButtonClass, 'truncate px-0.5')}>{t.number} {t.name}</button>
                        ) : <span className="truncate text-text-base">{t.number} {t.name}</span>}
                        {t.surrogate && <span className="text-[9px] text-text-muted">(surrogate)</span>}
                        {t.dq && <span className="text-[9px] text-rose-300">DQ</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border border-text-base/10 overflow-hidden">
            {rows.map(({ k, label }) => {
              const r = m.red.score?.[k] ?? null;
              const b = m.blue.score?.[k] ?? null;
              const max = Math.max(Math.abs(r ?? 0), Math.abs(b ?? 0), 1);
              return (
                <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 border-b border-text-base/10 last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold tabular-nums text-red-300 shrink-0">{r == null ? 'n/a' : fmt(r)}</span>
                    <span className="flex-1 flex justify-end min-w-0"><span className="h-1.5 rounded-full bg-red-500/80" style={{ width: `${r == null ? 0 : (Math.abs(r) / max) * 100}%` }} /></span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-center w-20 sm:w-32">{label}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-1 flex min-w-0"><span className="h-1.5 rounded-full bg-blue-500/80" style={{ width: `${b == null ? 0 : (Math.abs(b) / max) * 100}%` }} /></span>
                    <span className="text-sm font-bold tabular-nums text-blue-300 shrink-0">{b == null ? 'n/a' : fmt(b)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-text-muted">
            Score difference: <span className="font-bold text-text-base">{diff == null ? '—' : `${Math.abs(diff)} (${diff > 0 ? 'Red' : diff < 0 ? 'Blue' : 'tie'})`}</span>.
            {' '}{m.breakdownSource === 'first-events' ? 'TeleOp/endgame splits aren’t available for this match (FTC Scout has no breakdown) — shown as n/a.' : 'Final score, auto and penalties from FIRST Events; TeleOp/endgame split from FTC Scout.'}
          </p>
          {p && <TeamActionRow n={team} name="" season={season} actions={{}} />}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Partners & opponents (season-wide, lazy)
// ---------------------------------------------------------------------------

function PartnersSection({ p, season, actions, onMatch }: { p: FtcTeamProfile; season: number; actions: TeamActions; onMatch: (m: FtcMatchFull, ev: FtcEventFull) => void }) {
  const [open, setOpen] = useState(false);
  const codes = p.events.filter((e) => e.stats?.wins != null || e.stats?.qualMatchesPlayed).map((e) => e.code);
  const { events, errors, loading } = useEvents(season, codes, open);
  const loaded = useMemo(() => codes.map((c) => events[c]).filter((e): e is FtcEventFull => !!e), [codes, events]);
  const { partners, opponents } = useMemo(() => partnersAndOpponents(loaded, p.number), [loaded, p.number]);
  const [matchesFor, setMatchesFor] = useState<{ row: PartnerRow; kind: 'partner' | 'opponent' } | null>(null);
  return (
    <section aria-labelledby="partners-h">
      <SectionTitle id="partners-h" icon={Users} title="Partners & opponents" />
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full card-surface p-4 text-left hover:!border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
          <p className="font-bold text-text-base">Load partner & opponent history</p>
          <p className="text-xs text-text-muted mt-0.5">Who {p.number} played with and against across {codes.length} event{codes.length === 1 ? '' : 's'} — records, average scores and penalties.</p>
        </button>
      ) : (
        <div className="space-y-3">
          {loading && loaded.length < codes.length && <div className="grid sm:grid-cols-2 gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-48" />)}</div>}
          {Object.keys(errors).length > 0 && <ErrorState message={`${Object.keys(errors).length} event${Object.keys(errors).length === 1 ? '' : 's'} couldn't load — history may be incomplete.`} />}
          {!loading && !partners.length && !opponents.length && <EmptyState title="No partner history available" body="No played matches found for this season yet." />}
          {(partners.length > 0 || opponents.length > 0) && (
            <div className="grid lg:grid-cols-2 gap-3">
              <PeopleTable title="Most frequent alliance partners" icon={Users} rows={partners.slice(0, 10)} season={season} actions={actions} kind="partner" onMatches={(row) => setMatchesFor({ row, kind: 'partner' })} />
              <PeopleTable title="Most frequent opponents" icon={Swords} rows={opponents.slice(0, 10)} season={season} actions={actions} kind="opponent" onMatches={(row) => setMatchesFor({ row, kind: 'opponent' })} />
            </div>
          )}
        </div>
      )}
      {matchesFor && (
        <Sheet open onClose={() => setMatchesFor(null)} title={`${matchesFor.kind === 'partner' ? 'With' : 'Against'} ${matchesFor.row.number} ${matchesFor.row.name}`} subtitle={`${matchesFor.row.matches} matches · ${matchesFor.row.wins}-${matchesFor.row.losses}-${matchesFor.row.ties} for ${p.number}`}>
          <div className="space-y-1.5">
            {loaded.flatMap((ev) => teamMatches(ev, p.number)
              .filter((x) => (matchesFor.kind === 'partner' ? x.partners : x.opponents).includes(matchesFor.row.number))
              .map((x) => <MatchRow key={`${ev.code}:${x.match.key}`} p={x} team={p.number} eventName={ev.name} onOpen={() => { setMatchesFor(null); onMatch(x.match, ev); }} />))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function PeopleTable({ title, icon: Icon, rows, season, actions, kind, onMatches }: { title: string; icon: typeof Users; rows: PartnerRow[]; season: number; actions: TeamActions; kind: 'partner' | 'opponent'; onMatches: (r: PartnerRow) => void }) {
  return (
    <div className="card-surface p-4 min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{title}</p>
      <ul className="divide-y divide-text-base/10">
        {rows.map((r) => (
          <li key={r.number} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-bold text-text-base">{r.number}</span>
              <span className="text-sm text-text-muted truncate max-w-[14rem]">{r.name}</span>
              <span className="ml-auto text-xs text-text-muted whitespace-nowrap">{r.matches}× · {kind === 'partner' ? 'with' : 'vs'}: <span className="font-bold text-text-base">{r.wins}-{r.losses}-{r.ties}</span>{r.winRate != null ? ` (${r.winRate}%)` : ''}</span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">Our avg score {fmt(r.avgScore)} · our avg penalties {fmt(r.avgPenalties)} · {r.events.length} shared event{r.events.length === 1 ? '' : 's'}</p>
            <div className="mt-1"><TeamActionRow n={r.number} name={r.name} season={season} actions={actions} onViewMatches={() => onMatches(r)} compact /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { recordOf, winRate };
