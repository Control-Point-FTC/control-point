// Team Stats → Analyze: event scouting & alliance-planning workspace.
// Individual team scouting, event context and partner-fit help — there is
// intentionally NO compare mode, comparison table or compare action here.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, X, CalendarDays, Users, Star, Bookmark, Eye, List as ListIcon, Trash2, Bot, Pin, ChevronLeft, ChevronRight, ArrowUpDown, Filter, Sparkles, History } from 'lucide-react';
import { cn } from '../ui';
import type { FtcEventFull, FtcTeamEventStats, FtcTeamSearchHit, ShortlistEntry, ShortlistPriority } from '../../types/ftcScout';
import {
  fetchScoutEvent, fetchScoutTeam, fetchShortlist, saveShortlistEntry, removeShortlistEntry, searchScoutTeams, upsertLocal,
  readRecentTeams, pushRecentTeam, type RecentTeam,
} from '../../services/ftcScoutApi';
import { setScoutingContext, openBruno, ANALYZE_GREETING } from '../../services/brunoContext';
import { useDebounced } from '../../hooks/useDebounced';
import { eventAverages, partnerFit, scoutingPriorities, strengthsWeaknesses, teamMatches, winRate } from '../../utils/ftcAnalysis';
import { TeamScoutView, MatchRow, scoutWithBruno, type TeamActions } from './CompeteView';
import { ALL_SEASONS, EmptyState, ErrorState, QuickPop, SeasonChip, SeasonPicker, Sheet, Skeleton, SourceBadge, fmt, placementClass, relTime, useIsNarrow } from './ScoutUi';

type View = 'team' | 'field' | 'shortlist';
type SortKey = 'rank' | 'opr' | 'auto' | 'teleop' | 'endgame' | 'rp' | 'avgScore' | 'avgPen' | 'number';

const PIN_KEY = 'controlpoint-scout-pins';
function readPins(): RecentTeam[] {
  try { const v = JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); return Array.isArray(v) ? v.filter((t) => t && Number.isInteger(t.number)) : []; } catch { return []; }
}
function writePins(p: RecentTeam[]) { try { localStorage.setItem(PIN_KEY, JSON.stringify(p.slice(0, 12))); } catch { /* storage unavailable */ } }

export function AnalyzeView({ season, onSeasonChange, myTeam, initialTeam = null }: { season: number; onSeasonChange: (s: number) => void; myTeam: number | null; initialTeam?: { number: number; name: string } | null }) {
  const [view, setView] = useState<View>(initialTeam ? 'team' : 'field');
  const [selected, setSelected] = useState<{ number: number; name: string } | null>(initialTeam);
  const [panelTeam, setPanelTeam] = useState<{ number: number; name: string } | null>(null);
  const [eventCode, setEventCode] = useState<string | null>(null);
  const [eventOptions, setEventOptions] = useState<{ code: string; name: string; date: string | null }[]>([]);
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  const [shortlistErr, setShortlistErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentTeam[]>(readRecentTeams);
  const [pins, setPins] = useState<RecentTeam[]>(readPins);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Tell Bruno what we're looking at, and open it with the scouting greeting.
  useEffect(() => {
    setScoutingContext({ mode: 'analyze', season, eventCode, selectedTeam: selected?.number ?? null });
  }, [season, eventCode, selected]);
  useEffect(() => {
    openBruno({ greeting: ANALYZE_GREETING });
    return () => setScoutingContext(null);
  }, []);

  // Event picker defaults to the reference team's most recent/upcoming event.
  const refTeam = selected?.number ?? myTeam;
  useEffect(() => {
    let alive = true;
    if (!refTeam) { setEventOptions([]); return; }
    fetchScoutTeam(season, refTeam === myTeam ? null : refTeam)
      .then((p) => {
        if (!alive) return;
        const opts = p.events.map((e) => ({ code: e.code, name: e.name, date: e.date }));
        setEventOptions(opts);
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = opts.filter((o) => o.date && o.date >= today).sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
        const recentPlayed = [...p.events].reverse().find((e) => e.stats?.rank != null);
        setEventCode((cur) => (cur && opts.some((o) => o.code === cur) ? cur : upcoming?.code ?? recentPlayed?.code ?? opts[opts.length - 1]?.code ?? null));
      })
      .catch(() => { if (alive) setEventOptions([]); });
    return () => { alive = false; };
  }, [season, refTeam, myTeam]);

  useEffect(() => {
    let alive = true;
    setShortlistErr(null);
    fetchShortlist(season).then((s) => { if (alive) setShortlist(s); }).catch((e) => { if (alive) setShortlistErr(e instanceof Error ? e.message : 'Could not load the shortlist'); });
    return () => { alive = false; };
  }, [season]);

  const openTeam = useCallback((number: number, name = `Team ${number}`) => {
    setSelected({ number, name });
    setRecent(pushRecentTeam({ number, name }));
    setView('team');
    setPanelTeam(null);
  }, []);
  const peekTeam = useCallback((number: number, name = `Team ${number}`) => {
    setPanelTeam({ number, name });
    setRecent(pushRecentTeam({ number, name }));
  }, []);

  const listed = useCallback((n: number) => shortlist.some((s) => s.teamNumber === n), [shortlist]);
  const addToShortlist = useCallback(async (n: number, name: string) => {
    if (listed(n)) { setView('shortlist'); return; }
    const entry: ShortlistEntry = { teamNumber: n, teamName: name || `Team ${n}`, season, eventCode, notes: '', priority: 'medium', scoutNext: false, strengths: [], weaknesses: [], updatedAt: new Date().toISOString() };
    setShortlist((s) => upsertLocal(s, entry));
    try { setShortlist(await saveShortlistEntry(entry)); } catch (e) { setShortlistErr(e instanceof Error ? e.message : 'Could not save'); }
  }, [listed, season, eventCode]);
  const pinned = useCallback((n: number) => pins.some((p) => p.number === n), [pins]);
  const togglePin = useCallback((n: number, name: string) => {
    setPins((cur) => { const next = cur.some((p) => p.number === n) ? cur.filter((p) => p.number !== n) : [{ number: n, name }, ...cur]; writePins(next); return next; });
  }, []);

  const actions: TeamActions = { onViewTeam: (n, name) => peekTeam(n, name), onAddShortlist: addToShortlist, shortlisted: listed, onTogglePin: togglePin, pinned };

  const left = (
    <LeftPanel
      season={season} onSeasonChange={onSeasonChange}
      eventCode={eventCode} eventOptions={eventOptions} onEvent={(c) => { setEventCode(c); setView('field'); }}
      onPickTeam={openTeam} recent={recent} pins={pins} shortlist={shortlist}
      open={filtersOpen} onToggle={() => setFiltersOpen((v) => !v)}
    />
  );

  return (
    // Container queries: the page narrows when Bruno's sidebar is open, so
    // the layout follows this view's width rather than the viewport's.
    <div className="@container min-w-0">
    <div className="grid @4xl:grid-cols-[264px_minmax(0,1fr)] gap-4 items-start min-w-0">
      <aside className="min-w-0 @4xl:sticky @4xl:top-2">{left}</aside>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Analyze views">
          {([['field', 'Event field', CalendarDays], ['team', 'Team detail', Users], ['shortlist', `Scouting shortlist${shortlist.length ? ` (${shortlist.length})` : ''}`, Bookmark]] as const).map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={cn('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60', view === k ? 'bg-accent text-accent-ink' : 'card-surface text-text-muted hover:text-text-base')}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
          <button onClick={() => openBruno({ greeting: ANALYZE_GREETING })} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold border border-accent/40 text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            <Bot className="w-4 h-4" /> Ask Bruno
          </button>
        </div>

        {view === 'field' && <EventField season={season} code={eventCode} myTeam={myTeam} shortlist={shortlist} actions={actions} onOpenTeam={peekTeam} />}
        {view === 'team' && (selected
          ? <TeamScoutView number={selected.number} season={season} onSeasonChange={onSeasonChange} actions={actions} />
          : <EmptyState title="Search for a team" body="Use the search on the left (team number or name) to open a full team scouting profile." />)}
        {view === 'shortlist' && <ShortlistView season={season} entries={shortlist} setEntries={setShortlist} error={shortlistErr} eventCode={eventCode} myTeam={myTeam} onOpenTeam={peekTeam} />}
      </div>

      <Sheet open={!!panelTeam} onClose={() => setPanelTeam(null)} wide title={panelTeam ? `${panelTeam.number} ${panelTeam.name}` : ''} subtitle="Team scouting profile">
        {panelTeam && (
          <div className="space-y-3">
            <button onClick={() => openTeam(panelTeam.number, panelTeam.name)} className="text-xs font-bold text-accent hover:opacity-80">Open in Team detail →</button>
            <TeamScoutView number={panelTeam.number} season={season} onSeasonChange={onSeasonChange} actions={{ ...actions, onViewTeam: (n, name) => peekTeam(n, name) }} />
          </div>
        )}
      </Sheet>
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel: search, pickers, recent, saved
// ---------------------------------------------------------------------------

function LeftPanel({ season, onSeasonChange, eventCode, eventOptions, onEvent, onPickTeam, recent, pins, shortlist, open, onToggle }: {
  season: number; onSeasonChange: (s: number) => void;
  eventCode: string | null; eventOptions: { code: string; name: string; date: string | null }[]; onEvent: (c: string) => void;
  onPickTeam: (n: number, name?: string) => void; recent: RecentTeam[]; pins: RecentTeam[]; shortlist: ShortlistEntry[];
  open: boolean; onToggle: () => void;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [hits, setHits] = useState<FtcTeamSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  useEffect(() => {
    const term = dq.trim();
    if (term.length < 2 && !/^\d+$/.test(term)) { setHits([]); setSearchErr(null); return; }
    const ctrl = new AbortController();
    setSearching(true);
    setSearchErr(null);
    searchScoutTeams(term, season)
      .then((r) => { if (!ctrl.signal.aborted) setHits(r); })
      .catch((e) => { if (!ctrl.signal.aborted) setSearchErr(e instanceof Error ? e.message : 'Search failed'); })
      .finally(() => { if (!ctrl.signal.aborted) setSearching(false); });
    return () => ctrl.abort();
  }, [dq, season]);

  const list = (title: string, icon: ReactNode, items: { number: number; name: string }[], empty: string) => (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5 flex items-center gap-1.5">{icon}{title}</p>
      {items.length ? (
        <ul className="space-y-0.5">
          {items.map((t) => (
            <li key={t.number}><button onClick={() => onPickTeam(t.number, t.name)} className="w-full text-left text-sm rounded-lg px-2 py-1.5 hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 truncate"><span className="font-bold text-text-base">{t.number}</span> <span className="text-text-muted">{t.name}</span></button></li>
          ))}
        </ul>
      ) : <p className="text-xs text-text-muted/80 px-2">{empty}</p>}
    </div>
  );

  return (
    <div className="card-surface p-4 space-y-4">
      <div>
        <label htmlFor="scout-search" className="sr-only">Search teams by number or name</label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input id="scout-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team number or name" autoComplete="off"
            className="w-full rounded-xl bg-text-base/[0.04] border border-text-base/10 pl-9 pr-8 py-2.5 text-sm text-text-base placeholder:text-text-muted/70 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-base"><X className="w-4 h-4" /></button>}
        </div>
        {(searching || hits.length > 0 || searchErr || (dq.trim().length >= 2 && !searching)) && q.trim() && (
          <div className="mt-2 rounded-xl border border-text-base/10 max-h-64 overflow-y-auto custom-scrollbar" role="listbox" aria-label="Search results">
            {searching && <div className="p-2 space-y-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-7" />)}</div>}
            {searchErr && <p className="p-3 text-xs text-rose-300">{searchErr}</p>}
            {!searching && !searchErr && hits.length === 0 && <p className="p-3 text-xs text-text-muted">No teams match “{dq.trim()}”.</p>}
            {!searching && hits.map((h) => (
              <button key={h.number} role="option" aria-selected="false" onClick={() => { onPickTeam(h.number, h.name); setQ(''); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:bg-text-base/[0.08] border-b border-text-base/[0.06] last:border-b-0">
                <span className="font-bold text-text-base">{h.number}</span> <span className="text-text-base/80">{h.name}</span>
                {(h.city || h.state) && <span className="block text-[11px] text-text-muted">{[h.city, h.state].filter(Boolean).join(', ')}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Season</p>
          <SeasonPicker seasons={ALL_SEASONS} value={season} onChange={onSeasonChange} small />
        </div>
        <div>
          <label htmlFor="scout-event" className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5 block">Event</label>
          <select id="scout-event" value={eventCode ?? ''} onChange={(e) => e.target.value && onEvent(e.target.value)}
            className="w-full rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2.5 text-sm text-text-base focus:outline-none focus:border-accent/60">
            {!eventOptions.length && <option value="">No events this season</option>}
            {eventOptions.map((o) => <option key={o.code} value={o.code}>{o.name}{o.date ? ` · ${o.date}` : ''}</option>)}
          </select>
          <p className="text-[11px] text-text-muted mt-1">Events of the searched team (or yours). Defaults to the most recent or upcoming one.</p>
        </div>
      </div>
      <button onClick={onToggle} aria-expanded={open} className="@4xl:hidden w-full inline-flex items-center justify-between text-xs font-bold uppercase tracking-widest text-text-muted"><span className="inline-flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" />Pinned, shortlist & recent teams</span><ChevronRight className={cn('w-4 h-4 transition-transform', open && 'rotate-90')} /></button>
      <div className={cn('space-y-4', !open && 'hidden @4xl:block')}>
        {list('Pinned teams', <Pin className="w-3.5 h-3.5" />, pins, 'Pin a team from its profile.')}
        {list('Scouting shortlist', <Bookmark className="w-3.5 h-3.5" />, shortlist.map((s) => ({ number: s.teamNumber, name: s.teamName })), 'No shortlist teams yet.')}
        {list('Recently viewed', <History className="w-3.5 h-3.5" />, recent, 'Teams you open appear here.')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event field: every team at the event (sortable, filterable, paginated)
// ---------------------------------------------------------------------------

const PAGE = 20;

function EventField({ season, code, myTeam, shortlist, actions, onOpenTeam }: { season: number; code: string | null; myTeam: number | null; shortlist: ShortlistEntry[]; actions: TeamActions; onOpenTeam: (n: number, name: string) => void }) {
  const narrow = useIsNarrow();
  const [ev, setEv] = useState<FtcEventFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 });
  const [filter, setFilter] = useState('');
  const [round, setRound] = useState<'all' | 'qual' | 'playoff'>('all');
  const [color, setColor] = useState<'all' | 'red' | 'blue'>('all');
  const [page, setPage] = useState(0);
  const [matchesOf, setMatchesOf] = useState<FtcTeamEventStats | null>(null);

  const load = useCallback((force?: boolean) => {
    if (!code) return;
    setLoading(true); setErr(null);
    fetchScoutEvent(season, code, { force }).then(setEv).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the event')).finally(() => setLoading(false));
  }, [season, code]);
  useEffect(() => { setEv(null); setPage(0); load(); }, [load]);

  const avg = useMemo(() => (ev ? eventAverages(ev.field) : null), [ev]);
  const rows = useMemo(() => {
    if (!ev) return [];
    const term = filter.trim().toLowerCase();
    // Round / alliance-color filters keep teams that played matching matches.
    const plays = (t: FtcTeamEventStats) => {
      if (round === 'all' && color === 'all') return true;
      return teamMatches(ev, t.teamNumber).some((p) => (round === 'all' || p.match.level === round) && (color === 'all' || p.alliance === color));
    };
    const val = (t: FtcTeamEventStats): number | null => {
      switch (sort.key) {
        case 'rank': return t.rank;
        case 'opr': return t.opr?.totalNp ?? null;
        case 'auto': return t.opr?.auto ?? null;
        case 'teleop': return t.opr?.teleop ?? null;
        case 'endgame': return t.opr?.endgame ?? null;
        case 'rp': return t.rp;
        case 'avgScore': return t.avg?.total ?? null;
        case 'avgPen': return t.avg?.penaltiesCommitted ?? null;
        case 'number': return t.teamNumber;
      }
    };
    return ev.field
      .filter((t) => !term || String(t.teamNumber).includes(term) || t.name.toLowerCase().includes(term))
      .filter(plays)
      .sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return a.teamNumber - b.teamNumber;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va - vb) * sort.dir;
      });
  }, [ev, filter, round, color, sort]);
  useEffect(() => setPage(0), [filter, round, color, sort]);

  if (!code) return <EmptyState title="No event selected" body="Pick an event on the left (it lists the events of the searched team, or your own team's events)." />;
  if (loading && !ev) return <div className="space-y-2" aria-busy="true" aria-label="Loading event field"><Skeleton className="h-16" />{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>;
  if (err && !ev) return <ErrorState message={err} onRetry={() => load(true)} note="Both data sources failed and there's no cached copy of this event yet." />;
  if (!ev) return null;

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const head = (key: SortKey, label: string, title?: string) => (
    <th scope="col" className="py-2 px-2 font-bold whitespace-nowrap">
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'rank' || key === 'number' || key === 'avgPen' ? 1 : -1 }))} title={title}
        className={cn('inline-flex items-center gap-1 hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded', sort.key === key && 'text-accent')}
        aria-label={`Sort by ${label}`}>
        {label}<ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  );
  const listed = (n: number) => shortlist.some((s) => s.teamNumber === n);
  const pop = (t: FtcTeamEventStats) => (
    <div className="space-y-0.5">
      <p className="font-bold">{t.teamNumber} {t.name}</p>
      <p>Rank {t.rank ?? '—'} · {t.wins != null ? `${t.wins}-${t.losses}-${t.ties}` : 'no record'} · {fmt(t.rp)} RP</p>
      <p>OPR {fmt(t.opr?.totalNp ?? null)} (auto {fmt(t.opr?.auto ?? null)}, TeleOp {fmt(t.opr?.teleop ?? null)}, endgame {fmt(t.opr?.endgame ?? null)})</p>
      {avg && <p className="text-text-muted">{strengthsWeaknesses(t, avg).map((x) => x.label).join(' · ') || 'Close to the event average'}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="card-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display font-bold text-lg text-text-base break-words min-w-0">{ev.name}</h3>
          <SeasonChip season={season} />
          <SourceBadge f={ev} />
        </div>
        <p className="text-xs text-text-muted mt-1">{[ev.start, [ev.city, ev.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')} · {ev.field.length} teams · {ev.matches.filter((m) => m.played).length} matches played</p>
        {avg && <p className="text-xs text-text-muted mt-1">Event average OPR {fmt(avg.opr.totalNp)} (auto {fmt(avg.opr.auto)}, TeleOp {fmt(avg.opr.teleop)}, endgame {fmt(avg.opr.endgame)}) · avg score {fmt(avg.avgScore)} · avg penalties {fmt(avg.avgPenaltiesCommitted)}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by number or name" aria-label="Filter teams"
            className="w-full rounded-xl bg-text-base/[0.04] border border-text-base/10 pl-9 pr-3 py-2 text-sm text-text-base placeholder:text-text-muted/70 focus:outline-none focus:border-accent/60" />
        </div>
        <select value={round} onChange={(e) => setRound(e.target.value as typeof round)} aria-label="Round filter" className="rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base">
          <option value="all">All rounds</option><option value="qual">Quals</option><option value="playoff">Playoffs</option>
        </select>
        <select value={color} onChange={(e) => setColor(e.target.value as typeof color)} aria-label="Alliance color filter" className="rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base">
          <option value="all">Any alliance</option><option value="red">Played red</option><option value="blue">Played blue</option>
        </select>
        {narrow && (
          <select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }); }} aria-label="Sort" className="rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base">
            <option value="rank:1">Rank</option><option value="opr:-1">OPR</option><option value="auto:-1">Auto OPR</option><option value="teleop:-1">TeleOp OPR</option><option value="endgame:-1">Endgame OPR</option><option value="rp:-1">Ranking points</option><option value="avgPen:1">Fewest penalties</option>
          </select>
        )}
      </div>

      {rows.length === 0 ? <EmptyState title="No teams match" body="Try a different filter." /> : narrow ? (
        <div className="space-y-2">
          {pageRows.map((t) => (
            <div key={t.teamNumber} className={cn('card-surface p-3', t.teamNumber === myTeam && '!border-accent/50')}>
              <button onClick={() => onOpenTeam(t.teamNumber, t.name)} className="w-full text-left flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg">
                <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0', placementClass(t.rank))}>{t.rank ?? '–'}</span>
                <span className="flex-1 min-w-0"><span className="font-bold text-text-base">{t.teamNumber}</span> <span className="text-sm text-text-muted break-words">{t.name}</span></span>
                <span className="text-right"><span className="block text-accent font-bold">{fmt(t.opr?.totalNp ?? null)}</span><span className="text-[10px] text-text-muted">OPR</span></span>
              </button>
              <div className="grid grid-cols-4 gap-1 mt-2 text-center text-[11px]">
                {[['Auto', t.opr?.auto], ['TeleOp', t.opr?.teleop], ['End', t.opr?.endgame], ['Pen', t.avg?.penaltiesCommitted]].map(([l, v]) => <div key={l as string} className="rounded-lg bg-text-base/[0.04] py-1"><div className="text-text-muted">{l}</div><div className="font-bold text-text-base">{fmt((v as number | null | undefined) ?? null)}</div></div>)}
              </div>
              <p className="text-[11px] text-text-muted mt-1.5">{t.wins != null ? `${t.wins}-${t.losses}-${t.ties} (${winRate(t.wins, t.losses, t.ties) ?? '—'}%)` : 'No record'} · {fmt(t.rp)} RP · avg score {fmt(t.avg?.total ?? null)}</p>
              <FieldActions t={t} season={season} listed={listed(t.teamNumber)} actions={actions} onMatches={() => setMatchesOf(t)} onOpen={() => onOpenTeam(t.teamNumber, t.name)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-text-muted text-left border-b border-text-base/10">
                {head('rank', 'Rank')}{head('number', 'Team')}{head('opr', 'OPR')}{head('auto', 'Auto')}{head('teleop', 'TeleOp')}{head('endgame', 'Endgame')}
                <th scope="col" className="py-2 px-2 font-bold">W-L-T</th>{head('rp', 'RP')}{head('avgScore', 'Avg score')}{head('avgPen', 'Avg pen.', 'Average penalty points given per match')}
                <th scope="col" className="py-2 px-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t) => (
                <tr key={t.teamNumber} className={cn('border-b border-text-base/[0.06] hover:bg-text-base/[0.04] cursor-pointer', t.teamNumber === myTeam && 'bg-accent/[0.08]')} onClick={() => onOpenTeam(t.teamNumber, t.name)}>
                  <td className="py-2 px-2"><span className={cn('inline-flex w-7 h-7 rounded-lg items-center justify-center text-xs font-bold', placementClass(t.rank))}>{t.rank ?? '–'}</span></td>
                  <td className="py-2 px-2 max-w-[16rem]">
                    <QuickPop content={pop(t)}>
                      <button onClick={(e) => { e.stopPropagation(); onOpenTeam(t.teamNumber, t.name); }} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded">
                        <span className="font-bold text-text-base">{t.teamNumber}</span> <span className="text-text-muted truncate inline-block max-w-[11rem] align-bottom">{t.name}</span>
                      </button>
                    </QuickPop>
                  </td>
                  <td className="py-2 px-2 font-bold text-accent tabular-nums">{fmt(t.opr?.totalNp ?? null)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmt(t.opr?.auto ?? null)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmt(t.opr?.teleop ?? null)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmt(t.opr?.endgame ?? null)}</td>
                  <td className="py-2 px-2 whitespace-nowrap">{t.wins != null ? `${t.wins}-${t.losses}-${t.ties}` : '—'}</td>
                  <td className="py-2 px-2 tabular-nums">{fmt(t.rp)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmt(t.avg?.total ?? null)}</td>
                  <td className="py-2 px-2 tabular-nums">{fmt(t.avg?.penaltiesCommitted ?? null)}</td>
                  <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}><FieldActions t={t} season={season} listed={listed(t.teamNumber)} actions={actions} onMatches={() => setMatchesOf(t)} onOpen={() => onOpenTeam(t.teamNumber, t.name)} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm" role="navigation" aria-label="Pagination">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="p-2 rounded-lg disabled:opacity-40 enabled:hover:bg-text-base/10" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-text-muted">Page {page + 1} of {pages} · {rows.length} teams</span>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg disabled:opacity-40 enabled:hover:bg-text-base/10" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
      <p className="text-[11px] text-text-muted">Data freshness: {relTime(ev.fetchedAt)}{ev.partial ? ' · some requests failed, figures may be incomplete' : ''}. OPR via FTC Scout; ranks, records and matches via {ev.source === 'cache' ? 'cache' : ev.source === 'first-events' ? 'FIRST Events' : 'FTC Scout'}.</p>

      <Sheet open={!!matchesOf} onClose={() => setMatchesOf(null)} title={matchesOf ? `${matchesOf.teamNumber} ${matchesOf.name} · matches` : ''} subtitle={ev.name}>
        {matchesOf && (() => {
          const ps = teamMatches(ev, matchesOf.teamNumber);
          return ps.length ? <div className="space-y-1.5">{ps.map((p) => <MatchRow key={p.match.key} p={p} team={matchesOf.teamNumber} onOpen={() => { setMatchesOf(null); onOpenTeam(matchesOf.teamNumber, matchesOf.name); }} />)}</div> : <EmptyState title="No matches found" />;
        })()}
      </Sheet>
    </div>
  );
}

function FieldActions({ t, season, listed, actions, onMatches, onOpen, compact }: { t: FtcTeamEventStats; season: number; listed: boolean; actions: TeamActions; onMatches: () => void; onOpen: () => void; compact?: boolean }) {
  const b = cn('inline-flex items-center gap-1 rounded-lg text-[11px] font-bold text-text-muted hover:text-text-base hover:bg-text-base/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 whitespace-nowrap', compact ? 'p-1.5' : 'px-1.5 py-1');
  const items = [
    { label: 'View team', icon: Eye, onClick: onOpen },
    { label: 'View matches', icon: ListIcon, onClick: onMatches },
    { label: 'Scout with Bruno', icon: Bot, onClick: () => scoutWithBruno(t.teamNumber, t.name, season) },
    { label: listed ? 'On shortlist' : 'Add to scouting list', icon: Bookmark, onClick: () => actions.onAddShortlist?.(t.teamNumber, t.name), on: listed },
  ];
  return (
    <div className={cn('flex gap-0.5', compact ? 'flex-nowrap' : 'flex-wrap mt-1')}>
      {items.map(({ label, icon: Icon, onClick, on }) => (
        <button key={label} className={cn(b, on && 'text-accent')} onClick={onClick} title={label} aria-label={compact ? `${label}: ${t.teamNumber}` : undefined} aria-pressed={on === undefined ? undefined : on}>
          <Icon className={cn('w-3.5 h-3.5', on && 'fill-current')} />{!compact && label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scouting shortlist (notes, priority, scout-next, tags — no comparisons)
// ---------------------------------------------------------------------------

function ShortlistView({ season, entries, setEntries, error, eventCode, myTeam, onOpenTeam }: {
  season: number; entries: ShortlistEntry[]; setEntries: (e: ShortlistEntry[]) => void; error: string | null; eventCode: string | null; myTeam: number | null; onOpenTeam: (n: number, name: string) => void;
}) {
  const [ev, setEv] = useState<FtcEventFull | null>(null);
  useEffect(() => { if (eventCode) fetchScoutEvent(season, eventCode).then(setEv).catch(() => setEv(null)); }, [season, eventCode]);
  const save = async (e: ShortlistEntry) => {
    setEntries(upsertLocal(entries, e));
    try { setEntries(await saveShortlistEntry(e)); } catch { /* optimistic; next load reconciles */ }
  };
  const remove = async (n: number) => {
    setEntries(entries.filter((x) => x.teamNumber !== n));
    try { setEntries(await removeShortlistEntry(season, n)); } catch { /* reconciled on next load */ }
  };
  const priorities = ev ? scoutingPriorities(ev.field, entries, myTeam, 5) : [];
  const fit = ev && myTeam ? partnerFit(ev.field, myTeam, 3) : [];
  if (error && !entries.length) return <ErrorState message={error} />;
  return (
    <div className="space-y-3">
      {(priorities.length > 0 || fit.length > 0) && (
        <div className="card-surface p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-accent" />Bruno recommendations{ev ? ` · ${ev.name}` : ''}</p>
          {priorities.length > 0 && <p className="text-sm text-text-base/90"><span className="font-bold">Scout next:</span> {priorities.map((p) => `${p.teamNumber} (${p.why})`).join('; ')}.</p>}
          {fit.length > 0 && <p className="text-sm text-text-base/90"><span className="font-bold">Possible partner fits for {myTeam}:</span> {fit.map((f) => `${f.teamNumber} ${f.name}${f.reasons[0] ? ` — ${f.reasons[0].text}` : ''}`).join('; ')}.</p>}
          <p className="text-[11px] text-text-muted">Suggestions from event averages, not guarantees — watch matches before deciding. <button className="text-accent font-bold" onClick={() => openBruno({ prompt: 'Using our scouting shortlist and the selected event, who should we scout next and why?' })}>Ask Bruno to explain</button></p>
        </div>
      )}
      {!entries.length ? <EmptyState title="No scouting shortlist teams" body="Add teams from the event field, a team profile, or partner history. Your whole workspace shares this list." /> : (
        <div className="grid xl:grid-cols-2 gap-3">
          {entries.map((e) => <ShortlistCard key={e.teamNumber} e={e} ev={ev} onSave={save} onRemove={() => remove(e.teamNumber)} onOpen={() => onOpenTeam(e.teamNumber, e.teamName)} season={season} />)}
        </div>
      )}
    </div>
  );
}

function ShortlistCard({ e, ev, onSave, onRemove, onOpen, season }: { e: ShortlistEntry; ev: FtcEventFull | null; onSave: (e: ShortlistEntry) => void; onRemove: () => void; onOpen: () => void; season: number }) {
  const [notes, setNotes] = useState(e.notes);
  const [tagDraft, setTagDraft] = useState('');
  useEffect(() => setNotes(e.notes), [e.notes]);
  const stats = ev?.field.find((t) => t.teamNumber === e.teamNumber) || null;
  const avg = ev ? eventAverages(ev.field) : null;
  const suggested = stats && avg ? strengthsWeaknesses(stats, avg) : [];
  const upcoming = ev ? teamMatches(ev, e.teamNumber).filter((p) => !p.match.played).slice(0, 3) : [];
  const addTag = (kind: 'strengths' | 'weaknesses', tag: string) => {
    const t = tag.trim().slice(0, 40);
    if (!t || e[kind].includes(t)) return;
    onSave({ ...e, [kind]: [...e[kind], t].slice(0, 10) });
  };
  const prioClass: Record<ShortlistPriority, string> = { high: 'bg-rose-500/15 text-rose-300 border-rose-500/40', medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40', low: 'bg-text-base/10 text-text-muted border-text-base/20' };
  return (
    <div className={cn('card-surface p-4 space-y-3', e.scoutNext && '!border-accent/50')}>
      <div className="flex items-start gap-2">
        <button onClick={onOpen} className="text-left flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded">
          <p className="font-bold text-text-base break-words">{e.teamNumber} <span className="text-text-muted font-semibold">{e.teamName}</span></p>
          <p className="text-[11px] text-text-muted">{stats ? `Rank ${stats.rank ?? '—'} · OPR ${fmt(stats.opr?.totalNp ?? null)} · ${stats.wins != null ? `${stats.wins}-${stats.losses}-${stats.ties}` : 'no record'}` : 'Not at the selected event'} · updated {relTime(e.updatedAt)}</p>
        </button>
        <button onClick={onRemove} aria-label={`Remove ${e.teamNumber} from shortlist`} className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Scouting priority" className="flex gap-1">
          {(['high', 'medium', 'low'] as const).map((p) => (
            <button key={p} role="radio" aria-checked={e.priority === p} onClick={() => onSave({ ...e, priority: p })} className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border', e.priority === p ? prioClass[p] : 'border-text-base/10 text-text-muted hover:text-text-base')}>{p}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-text-base cursor-pointer">
          <input type="checkbox" checked={e.scoutNext} onChange={(x) => onSave({ ...e, scoutNext: x.target.checked })} className="accent-[var(--color-accent)]" /> <Star className="w-3.5 h-3.5 text-accent" /> Scout next
        </label>
        <button onClick={() => scoutWithBruno(e.teamNumber, e.teamName, season)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:opacity-80"><Bot className="w-3.5 h-3.5" />Scout with Bruno</button>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted" htmlFor={`notes-${e.teamNumber}`}>Notes</label>
        <textarea id={`notes-${e.teamNumber}`} value={notes} onChange={(x) => setNotes(x.target.value)} onBlur={() => notes !== e.notes && onSave({ ...e, notes })} rows={2} maxLength={2000} placeholder="What did you see? Intake, auto routine, driver, reliability…"
          className="mt-1 w-full rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base placeholder:text-text-muted/70 focus:outline-none focus:border-accent/60 resize-y" />
      </div>
      {(['strengths', 'weaknesses'] as const).map((kind) => (
        <div key={kind}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">{kind}</p>
          <div className="flex flex-wrap gap-1">
            {e[kind].map((t) => (
              <button key={t} onClick={() => onSave({ ...e, [kind]: e[kind].filter((x) => x !== t) })} title="Remove tag" className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md border', kind === 'strengths' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30')}>{t} ×</button>
            ))}
            {suggested.filter((s) => (kind === 'strengths' ? s.kind === 'strength' : s.kind === 'weakness') && !e[kind].includes(s.label)).map((s) => (
              <button key={s.label} onClick={() => addTag(kind, s.label)} title={`Suggested from data: ${s.detail}`} className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-dashed border-text-base/20 text-text-muted hover:text-text-base">+ {s.label}</button>
            ))}
          </div>
        </div>
      ))}
      <form onSubmit={(x) => { x.preventDefault(); addTag('strengths', tagDraft); setTagDraft(''); }} className="flex gap-2">
        <input value={tagDraft} onChange={(x) => setTagDraft(x.target.value)} placeholder="Custom tag" aria-label="Custom tag" maxLength={40} className="flex-1 min-w-0 rounded-lg bg-text-base/[0.04] border border-text-base/10 px-2 py-1.5 text-xs text-text-base" />
        <button type="submit" className="text-[11px] font-bold text-emerald-300 px-2">+ Strength</button>
        <button type="button" onClick={() => { addTag('weaknesses', tagDraft); setTagDraft(''); }} className="text-[11px] font-bold text-rose-300 px-2">+ Weakness</button>
      </form>
      {upcoming.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Upcoming at {ev?.name}</p>
          <p className="text-xs text-text-base/85">{upcoming.map((p) => `${p.match.label} (${p.alliance})${p.match.time ? ` ${new Date(p.match.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`).join(' · ')}</p>
        </div>
      )}
    </div>
  );
}

