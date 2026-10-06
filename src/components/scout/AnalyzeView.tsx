// Team Stats → Analyze: event scouting & alliance-planning workspace.
// Individual team scouting, event context and partner-fit help — there is
// intentionally NO compare mode, comparison table or compare action here.
import { useEffect, useState, type ReactNode } from 'react';
import { Search, X, CalendarDays, Users, Star, Bookmark, Eye, List as ListIcon, Trash2, Bot, Pin, ChevronLeft, ChevronRight, ArrowUpDown, Filter, Sparkles, History } from 'lucide-react';
import { cn } from '../ui';
import type { FtcEventFull, FtcMatchFull, FtcTeamEventStats, ShortlistEntry, ShortlistPriority } from '../../types/ftcScout';
import { fetchScoutEvent, type RecentTeam } from '../../services/ftcScoutApi';
import { openBruno, ANALYZE_GREETING } from '../../services/brunoContext';
import type { ShortlistPatch } from '../../utils/shortlist';
import { useAnalyzeController, useEventField, useShortlistNotes, useTeamSearch, type FieldSortKey } from './useAnalyze';
import { eventAverages, partnerFit, scoutingPriorities, strengthsWeaknesses, teamMatches, winRate } from '../../utils/ftcAnalysis';
import { TeamScoutView, MatchRow, MatchSheet, scoutWithBruno, type TeamActions } from './CompeteView';
import { ALL_SEASONS, EmptyState, ErrorState, QuickPop, SeasonChip, SeasonPicker, Sheet, Skeleton, SourceBadge, fmt, placementClass, relTime, useIsNarrow } from './ScoutUi';
import { Select as ThemedSelect } from '../Select';

type SortKey = FieldSortKey;

export function AnalyzeView({ season, onSeasonChange, myTeam, initialTeam = null }: { season: number; onSeasonChange: (s: number) => void; myTeam: number | null; initialTeam?: { number: number; name: string } | null }) {
  const {
    view, setView, selected, panelTeam, setPanelTeam, eventCode, eventOptions, chooseEvent,
    shortlist, shortlistConfirmed, shortlistErr, patchShortlist, removeFromShortlist, recent, pins, openTeam, peekTeam, actions,
  } = useAnalyzeController({ season, myTeam, initialTeam });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const left = (
    <LeftPanel
      season={season} onSeasonChange={onSeasonChange}
      eventCode={eventCode} eventOptions={eventOptions} onEvent={chooseEvent}
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

        {shortlistErr && view !== 'shortlist' && <p role="alert" className="text-xs text-rose-300">Scouting shortlist: {shortlistErr}</p>}
        {view === 'field' && <EventField season={season} code={eventCode} myTeam={myTeam} shortlist={shortlist} actions={actions} onOpenTeam={peekTeam} />}
        {view === 'team' && (selected
          ? <TeamScoutView number={selected.number} season={season} onSeasonChange={onSeasonChange} actions={actions} />
          : <EmptyState title="Search for a team" body="Use the search on the left (team number or name) to open a full team scouting profile." />)}
        {view === 'shortlist' && <ShortlistView season={season} entries={shortlist} confirmed={shortlistConfirmed} onPatch={patchShortlist} onRemove={removeFromShortlist} error={shortlistErr} eventCode={eventCode} myTeam={myTeam} onOpenTeam={peekTeam} />}
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
  const { q, setQ, dq, hits, searching, searchErr } = useTeamSearch(season);

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
          <ThemedSelect id="scout-event" value={eventCode ?? ''} onChange={(e) => e.target.value && onEvent(e.target.value)}
            className="w-full rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2.5 text-sm text-text-base focus:outline-none focus:border-accent/60">
            {!eventOptions.length && <option value="">No events this season</option>}
            {eventOptions.map((o) => <option key={o.code} value={o.code}>{o.name}{o.date ? ` · ${o.date}` : ''}</option>)}
          </ThemedSelect>
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
  const { ev, err, loading, load, avg, rows, pageRows, page, pages, setPage, sort, setSort, sortBy, filter, setFilter, round, setRound, color, setColor } = useEventField(season, code, PAGE);
  const [matchesOf, setMatchesOf] = useState<FtcTeamEventStats | null>(null);
  const [match, setMatch] = useState<{ m: FtcMatchFull; team: number } | null>(null);

  if (!code) return <EmptyState title="No event selected" body="Pick an event on the left (it lists the events of the searched team, or your own team's events)." />;
  if (loading && !ev) return <div className="space-y-2" aria-busy="true" aria-label="Loading event field"><Skeleton className="h-16" />{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>;
  if (err && !ev) return <ErrorState message={err} onRetry={() => load(true)} note="Both data sources failed and there's no cached copy of this event yet." />;
  if (!ev) return null;

  const head = (key: SortKey, label: string, title?: string) => (
    <th scope="col" className="py-2 px-2 font-bold whitespace-nowrap">
      <button onClick={() => sortBy(key)} title={title}
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
        <ThemedSelect value={round} onChange={(e) => setRound(e.target.value as typeof round)} aria-label="Round filter" className="rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base">
          <option value="all">All rounds</option><option value="qual">Quals</option><option value="playoff">Playoffs</option>
        </ThemedSelect>
        <ThemedSelect value={color} onChange={(e) => setColor(e.target.value as typeof color)} aria-label="Alliance color filter" className="rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base">
          <option value="all">Any alliance</option><option value="red">Played red</option><option value="blue">Played blue</option>
        </ThemedSelect>
        {narrow && (
          <ThemedSelect value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }); }} aria-label="Sort" className="rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base">
            <option value="rank:1">Rank</option><option value="opr:-1">OPR</option><option value="auto:-1">Auto OPR</option><option value="teleop:-1">TeleOp OPR</option><option value="endgame:-1">Endgame OPR</option><option value="rp:-1">Ranking points</option><option value="avgPen:1">Fewest penalties</option>
          </ThemedSelect>
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
          return ps.length ? <div className="space-y-1.5">{ps.map((p) => <MatchRow key={p.match.key} p={p} team={matchesOf.teamNumber} onOpen={() => setMatch({ m: p.match, team: matchesOf.teamNumber })} />)}</div> : <EmptyState title="No matches found" />;
        })()}
      </Sheet>
      <MatchSheet sel={match ? { m: match.m, ev } : null} team={match?.team ?? 0} onClose={() => setMatch(null)} actions={actions} season={season} />
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

function ShortlistView({ season, entries, confirmed, onPatch, onRemove, error, eventCode, myTeam, onOpenTeam }: {
  season: number; entries: ShortlistEntry[]; confirmed: ShortlistEntry[]; onPatch: (p: Omit<ShortlistPatch, 'season'>) => void; onRemove: (n: number) => void; error: string | null; eventCode: string | null; myTeam: number | null; onOpenTeam: (n: number, name: string) => void;
}) {
  const [ev, setEv] = useState<FtcEventFull | null>(null);
  useEffect(() => {
    let alive = true;
    setEv(null);
    if (eventCode) fetchScoutEvent(season, eventCode).then((r) => { if (alive) setEv(r); }).catch(() => { if (alive) setEv(null); });
    return () => { alive = false; };
  }, [season, eventCode]);
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
          {error && entries.length > 0 && <p className="text-xs text-rose-300">{error}</p>}
          {entries.map((e) => <ShortlistCard key={e.teamNumber} e={e} ev={ev} confirmedNotes={confirmed.find((c) => c.teamNumber === e.teamNumber)?.notes ?? null} onPatch={(p) => onPatch({ ...p, teamNumber: e.teamNumber })} onRemove={() => onRemove(e.teamNumber)} onOpen={() => onOpenTeam(e.teamNumber, e.teamName)} season={season} />)}
        </div>
      )}
    </div>
  );
}

function ShortlistCard({ e, ev, confirmedNotes, onPatch, onRemove, onOpen, season }: { e: ShortlistEntry; ev: FtcEventFull | null; confirmedNotes: string | null; onPatch: (p: Omit<ShortlistPatch, 'season' | 'teamNumber'>) => void; onRemove: () => void; onOpen: () => void; season: number }) {
  const { notes, setNotes, save: saveNotes } = useShortlistNotes(season, e, onPatch, confirmedNotes);
  const [tagDraft, setTagDraft] = useState('');
  const stats = ev?.field.find((t) => t.teamNumber === e.teamNumber) || null;
  const avg = ev ? eventAverages(ev.field) : null;
  const suggested = stats && avg ? strengthsWeaknesses(stats, avg) : [];
  const upcoming = ev ? teamMatches(ev, e.teamNumber).filter((p) => !p.match.played).slice(0, 3) : [];
  const addTag = (kind: 'strengths' | 'weaknesses', tag: string) => {
    const t = tag.trim().slice(0, 40);
    if (!t || e[kind].includes(t)) return;
    onPatch(kind === 'strengths' ? { addStrengths: [t] } : { addWeaknesses: [t] });
  };
  const removeTag = (kind: 'strengths' | 'weaknesses', t: string) => onPatch(kind === 'strengths' ? { removeStrengths: [t] } : { removeWeaknesses: [t] });
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
            <button key={p} role="radio" aria-checked={e.priority === p} onClick={() => onPatch({ priority: p })} className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border', e.priority === p ? prioClass[p] : 'border-text-base/10 text-text-muted hover:text-text-base')}>{p}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-text-base cursor-pointer">
          <input type="checkbox" checked={e.scoutNext} onChange={(x) => onPatch({ scoutNext: x.target.checked })} className="accent-[var(--color-accent)]" /> <Star className="w-3.5 h-3.5 text-accent" /> Scout next
        </label>
        <button onClick={() => scoutWithBruno(e.teamNumber, e.teamName, season)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:opacity-80"><Bot className="w-3.5 h-3.5" />Scout with Bruno</button>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted" htmlFor={`notes-${e.teamNumber}`}>Notes</label>
        <textarea id={`notes-${e.teamNumber}`} value={notes} onChange={(x) => setNotes(x.target.value)} onBlur={saveNotes} rows={2} maxLength={2000} placeholder="What did you see? Intake, auto routine, driver, reliability…"
          className="mt-1 w-full rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2 text-sm text-text-base placeholder:text-text-muted/70 focus:outline-none focus:border-accent/60 resize-y" />
      </div>
      {(['strengths', 'weaknesses'] as const).map((kind) => (
        <div key={kind}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">{kind}</p>
          <div className="flex flex-wrap gap-1">
            {e[kind].map((t) => (
              <button key={t} onClick={() => removeTag(kind, t)} title="Remove tag" className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md border', kind === 'strengths' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30')}>{t} ×</button>
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

