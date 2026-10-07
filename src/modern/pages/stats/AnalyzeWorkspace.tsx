// Modern Team Stats → Analyze (phase 7c): event scouting & alliance planning
// over the shared useAnalyzeController / useEventField / useTeamSearch. A
// search + quick-picks bar, season and event chips, then Event field (a
// sortable table or cards), Team detail (the Modern TeamProfile) and the
// workspace's scouting shortlist. Teams peek in a side sheet. Deliberately no
// compare mode, comparison table or compare action.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Bookmark, Bot, CalendarDays, ChevronLeft, ChevronRight, History, Pin, Search, Users, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
  Input, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader,
  TableRow, Tabs, TabsContent, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { ALL_SEASONS, fmt, relTime, useIsNarrow } from '../../../components/scout/ScoutUi';
import { useAnalyzeController, useEventField, useTeamSearch, type AnalyzeTab, type FieldSortKey, type TeamRef } from '../../../components/scout/useAnalyze';
import type { TeamActions } from '../../../components/scout/CompeteView';
import { ANALYZE_GREETING, openBruno } from '../../../services/brunoContext';
import { strengthsWeaknesses, teamMatches, winRate } from '../../../utils/ftcAnalysis';
import type { FtcMatchFull, FtcTeamEventStats } from '../../../types/ftcScout';
import { EmptyState } from '../../ui/page';
import { Stagger, StaggerItem } from '../../ui/motion';
import { TeamProfile } from './TeamProfile';
import { MatchDetailSheet, MatchLine, OfficialSourceLinks, RankMedal, SeasonToggle, SourceLine, TeamMenu, officialEventLinks } from './statsUi';
import { ShortlistBoard } from './ShortlistBoard';

type Ctl = ReturnType<typeof useAnalyzeController>;

export function AnalyzeWorkspace({ season, onSeasonChange, myTeam, initialTeam = null }: { season: number; onSeasonChange: (s: number) => void; myTeam: number | null; initialTeam?: TeamRef | null }) {
  const ctl = useAnalyzeController({ season, myTeam, initialTeam });
  const narrow = useIsNarrow();
  return (
    <div className="min-w-0">
      <FinderBar ctl={ctl} season={season} onSeasonChange={onSeasonChange} />
      <Tabs value={ctl.view} onValueChange={(v) => ctl.setView(v as AnalyzeTab)} className="mt-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <TabsList aria-label="Analyze views">
            <TabsTrigger value="field" className="max-sm:h-11"><CalendarDays /> Event field</TabsTrigger>
            <TabsTrigger value="team" className="max-sm:h-11"><Users /> Team detail</TabsTrigger>
            <TabsTrigger value="shortlist" className="max-sm:h-11"><Bookmark /> Shortlist{ctl.shortlist.length ? ` (${ctl.shortlist.length})` : ''}</TabsTrigger>
          </TabsList>
          <Button variant="outline" onClick={() => openBruno({ greeting: ANALYZE_GREETING })} className="ml-auto max-sm:h-11"><Bot /> Ask Bruno</Button>
        </div>
        {ctl.shortlistErr && ctl.view !== 'shortlist' && <p role="alert" className="mb-3 text-sm text-destructive">Scouting shortlist: {ctl.shortlistErr}</p>}
        <TabsContent value="field"><EventFieldView season={season} code={ctl.eventCode} myTeam={myTeam} ctl={ctl} /></TabsContent>
        <TabsContent value="team">
          {ctl.selected
            ? <TeamProfile number={ctl.selected.number} season={season} onSeasonChange={onSeasonChange} actions={ctl.actions} />
            : <EmptyState icon={Search} title="Search for a team" description="Use the search above (team number or name) to open a full team scouting profile." />}
        </TabsContent>
        <TabsContent value="shortlist">
          <ShortlistBoard season={season} entries={ctl.shortlist} confirmed={ctl.shortlistConfirmed} onPatch={ctl.patchShortlist} onRemove={ctl.removeFromShortlist} error={ctl.shortlistErr} eventCode={ctl.eventCode} myTeam={myTeam} onOpenTeam={ctl.peekTeam} />
        </TabsContent>
      </Tabs>

      <Sheet open={!!ctl.panelTeam} onOpenChange={(o) => { if (!o) ctl.setPanelTeam(null); }}>
        <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-3xl')}>
          {ctl.panelTeam && (
            <>
              <SheetHeader className="flex-row flex-wrap items-center gap-3 border-b border-border px-6 py-4 pr-12">
                <div className="min-w-0 flex-1">
                  <SheetTitle>{ctl.panelTeam.number} {ctl.panelTeam.name}</SheetTitle>
                  <SheetDescription>Team scouting profile</SheetDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => ctl.openTeam(ctl.panelTeam!.number, ctl.panelTeam!.name)} className="max-sm:h-11">Open in Team detail</Button>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <TeamProfile number={ctl.panelTeam.number} season={season} onSeasonChange={onSeasonChange} actions={{ ...ctl.actions, onViewTeam: (n, name) => ctl.peekTeam(n, name) }} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finder: search, quick picks (pinned / shortlist / recent), season, event
// ---------------------------------------------------------------------------

function FinderBar({ ctl, season, onSeasonChange }: { ctl: Ctl; season: number; onSeasonChange: (s: number) => void }) {
  const { q, setQ, dq, hits, searching, searchErr } = useTeamSearch(season);
  const showResults = !!q.trim() && (searching || hits.length > 0 || !!searchErr || dq.trim().length >= 2);
  const quick: { key: string; icon: typeof Pin; label: string; items: TeamRef[] }[] = [
    { key: 'pins', icon: Pin, label: 'Pinned', items: ctl.pins },
    { key: 'short', icon: Bookmark, label: 'Shortlist', items: ctl.shortlist.map((s) => ({ number: s.teamNumber, name: s.teamName })) },
    { key: 'recent', icon: History, label: 'Recent', items: ctl.recent },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find any team by number or name"
          aria-label="Search teams by number or name"
          autoComplete="off"
          className="h-12 pl-11 pr-11 text-base"
        />
        {q && <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 max-sm:size-11"><X /></Button>}
        {showResults && (
          <div role="listbox" aria-label="Search results" className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
            {searching && <div className="space-y-1.5 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>}
            {searchErr && <p className="p-3 text-sm text-destructive">{searchErr}</p>}
            {!searching && !searchErr && hits.length === 0 && <p className="p-3 text-sm text-muted-foreground">No teams match “{dq.trim()}”.</p>}
            {!searching && hits.map((h) => (
              <button key={h.number} role="option" aria-selected="false" onClick={() => { ctl.openTeam(h.number, h.name); setQ(''); }}
                className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none max-sm:min-h-11">
                <span className="text-sm"><span className="font-medium">{h.number}</span> {h.name}</span>
                {(h.city || h.state) && <span className="text-xs text-muted-foreground">{[h.city, h.state].filter(Boolean).join(', ')}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {quick.map(({ key, icon: Icon, label, items }) => (
          <div key={key} className="flex min-w-0 max-w-full items-center gap-2">
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</span>
            {items.length ? (
              <div className="flex min-w-0 gap-1 overflow-x-auto">
                {items.slice(0, 6).map((t) => (
                  <Button key={t.number} size="sm" variant="secondary" title={t.name} onClick={() => ctl.openTeam(t.number, t.name)} className="h-7 shrink-0 px-2 tabular-nums max-sm:h-11">{t.number}</Button>
                ))}
              </div>
            ) : <span className="text-xs text-muted-foreground/70">none yet</span>}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 border-t border-border pt-4">
        <SeasonToggle seasons={ALL_SEASONS} value={season} onChange={onSeasonChange} />
        {ctl.eventOptions.length ? (
          <ToggleGroup type="single" aria-label="Event" value={ctl.eventCode ?? ''} onValueChange={(v) => { if (v) ctl.chooseEvent(v); }} className="-mx-1 flex w-[calc(100%+0.5rem)] justify-start gap-2 overflow-x-auto bg-transparent px-1 pb-1">
            {ctl.eventOptions.map((o) => (
              <ToggleGroupItem key={o.code} value={o.code} className="h-auto min-h-12 shrink-0 flex-col items-start gap-0.5 rounded-xl border border-border bg-background px-3 py-2 text-left data-[state=on]:border-accent/60 data-[state=on]:bg-accent/10 data-[state=on]:shadow-none">
                <span className="max-w-[14rem] truncate text-sm font-medium text-foreground">{o.name}</span>
                <span className="text-xs text-muted-foreground">{o.date ?? 'Date TBA'}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : <p className="text-sm text-muted-foreground">No events this season for the searched team (or yours).</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event field
// ---------------------------------------------------------------------------

const SORTS: { key: FieldSortKey; label: string; dir: 1 | -1 }[] = [
  { key: 'rank', label: 'Rank', dir: 1 }, { key: 'opr', label: 'OPR', dir: -1 }, { key: 'auto', label: 'Auto OPR', dir: -1 },
  { key: 'teleop', label: 'TeleOp OPR', dir: -1 }, { key: 'endgame', label: 'Endgame OPR', dir: -1 }, { key: 'rp', label: 'Ranking points', dir: -1 },
  { key: 'avgPen', label: 'Fewest penalties', dir: 1 },
];

function EventFieldView({ season, code, myTeam, ctl }: { season: number; code: string | null; myTeam: number | null; ctl: Ctl }) {
  const narrow = useIsNarrow();
  const f = useEventField(season, code);
  const [matchesOf, setMatchesOf] = useState<FtcTeamEventStats | null>(null);
  const [match, setMatch] = useState<{ m: FtcMatchFull; team: number } | null>(null);
  const { ev } = f;

  if (!code) return <EmptyState icon={CalendarDays} title="No event selected" description="Pick an event above (it lists the events of the searched team, or your own team's events)." />;
  if (f.loading && !ev) return <div className="space-y-2" aria-busy="true" aria-label="Loading event field"><Skeleton className="h-20" />{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (f.err && !ev) {
    return <EmptyState title="Couldn't load the event" description={<>{f.err}<br />Both data sources failed and there's no cached copy of this event yet.</>} action={<Button variant="outline" onClick={() => f.load(true)}>Retry</Button>} />;
  }
  if (!ev) return null;

  const listed = (n: number) => ctl.shortlist.some((s) => s.teamNumber === n);
  const actionsFor = (t: FtcTeamEventStats) => <TeamMenu n={t.teamNumber} name={t.name} season={season} actions={ctl.actions} onViewMatches={() => setMatchesOf(t)} />;
  const sortHead = (key: FieldSortKey, label: string, title?: string, right = true) => {
    const on = f.sort.key === key;
    return (
      <TableHead className={cn(right && 'text-right')} aria-sort={on ? (f.sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
        <button onClick={() => f.sortBy(key)} title={title} aria-label={`Sort by ${label}`} className={cn('inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60', on && 'text-accent')}>
          {label}{on && (f.sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      </TableHead>
    );
  };
  const played = ev.matches.filter((m) => m.played).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-border pb-4">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-display text-2xl font-semibold tracking-tight">{ev.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{[ev.start, [ev.city, ev.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">Teams</dt><dd className="font-display text-xl font-semibold tabular-nums">{ev.field.length}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Matches played</dt><dd className="font-display text-xl font-semibold tabular-nums">{played}</dd></div>
          {f.avg && <div><dt className="text-xs text-muted-foreground">Avg OPR</dt><dd className="font-display text-xl font-semibold tabular-nums">{fmt(f.avg.opr.totalNp)}</dd></div>}
          {f.avg && <div><dt className="text-xs text-muted-foreground">Avg score</dt><dd className="font-display text-xl font-semibold tabular-nums">{fmt(f.avg.avgScore)}</dd></div>}
        </dl>
      </div>
      {f.avg && <p className="text-xs text-muted-foreground">Event average OPR {fmt(f.avg.opr.totalNp)} (auto {fmt(f.avg.opr.auto)}, TeleOp {fmt(f.avg.opr.teleop)}, endgame {fmt(f.avg.opr.endgame)}) · avg penalties {fmt(f.avg.avgPenaltiesCommitted)}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={f.filter} onChange={(e) => f.setFilter(e.target.value)} placeholder="Filter by number or name" aria-label="Filter teams" className="pl-9 max-sm:h-11" />
        </div>
        <ToggleGroup type="single" aria-label="Round filter" value={f.round} onValueChange={(v) => { if (v) f.setRound(v as typeof f.round); }}>
          <ToggleGroupItem value="all" className="max-sm:h-11">All rounds</ToggleGroupItem>
          <ToggleGroupItem value="qual" className="max-sm:h-11">Quals</ToggleGroupItem>
          <ToggleGroupItem value="playoff" className="max-sm:h-11">Playoffs</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" aria-label="Alliance color filter" value={f.color} onValueChange={(v) => { if (v) f.setColor(v as typeof f.color); }}>
          <ToggleGroupItem value="all" className="max-sm:h-11">Any</ToggleGroupItem>
          <ToggleGroupItem value="red" className="max-sm:h-11"><span className="size-2 rounded-full bg-red-500" /> Red</ToggleGroupItem>
          <ToggleGroupItem value="blue" className="max-sm:h-11"><span className="size-2 rounded-full bg-blue-500" /> Blue</ToggleGroupItem>
        </ToggleGroup>
        {narrow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="max-sm:h-11">Sort: {SORTS.find((s) => s.key === f.sort.key)?.label ?? 'Rank'}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={f.sort.key} onValueChange={(k) => { const s = SORTS.find((x) => x.key === k); if (s) f.setSort({ key: s.key, dir: s.dir }); }}>
                {SORTS.map((s) => <DropdownMenuRadioItem key={s.key} value={s.key}>{s.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {f.rows.length === 0 ? <EmptyState title="No teams match" description="Try a different filter." /> : narrow ? (
        <Stagger as="ul" className="space-y-2">
          {f.pageRows.map((t) => (
            <StaggerItem as="li" key={t.teamNumber} className={cn('rounded-xl border bg-card p-3', t.teamNumber === myTeam ? 'border-accent/50' : 'border-border')}>
              <div className="flex items-center gap-3">
                <button onClick={() => ctl.peekTeam(t.teamNumber, t.name)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                  <RankMedal rank={t.rank} className="size-9" />
                  <span className="min-w-0 flex-1"><span className="font-medium">{t.teamNumber}</span> <span className="break-words text-sm text-muted-foreground">{t.name}</span></span>
                  <span className="text-right"><span className="block font-display font-semibold text-accent">{fmt(t.opr?.totalNp ?? null)}</span><span className="text-[11px] text-muted-foreground">OPR</span></span>
                </button>
                {actionsFor(t)}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
                {([['Auto', t.opr?.auto], ['TeleOp', t.opr?.teleop], ['End', t.opr?.endgame], ['Pen', t.avg?.penaltiesCommitted]] as const).map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-muted/60 py-1"><div className="text-muted-foreground">{l}</div><div className="font-medium tabular-nums">{fmt(v ?? null)}</div></div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t.wins != null ? `${t.wins}-${t.losses}-${t.ties} (${winRate(t.wins, t.losses, t.ties) ?? '—'}%)` : 'No record'} · {fmt(t.rp)} RP · avg score {fmt(t.avg?.total ?? null)}{listed(t.teamNumber) ? ' · on shortlist' : ''}</p>
            </StaggerItem>
          ))}
        </Stagger>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {sortHead('rank', 'Rank', undefined, false)}{sortHead('number', 'Team', undefined, false)}{sortHead('opr', 'OPR')}{sortHead('auto', 'Auto')}{sortHead('teleop', 'TeleOp')}{sortHead('endgame', 'Endgame')}
                <TableHead className="text-right">W-L-T</TableHead>{sortHead('rp', 'RP')}{sortHead('avgScore', 'Avg score')}{sortHead('avgPen', 'Avg pen.', 'Average penalty points given per match')}
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.pageRows.map((t) => {
                const tags = f.avg ? strengthsWeaknesses(t, f.avg) : [];
                return (
                  <TableRow key={t.teamNumber} className={cn('cursor-pointer', t.teamNumber === myTeam && 'bg-accent/[0.07] hover:bg-accent/10')} onClick={() => ctl.peekTeam(t.teamNumber, t.name)}>
                    <TableCell><RankMedal rank={t.rank} className="size-8 text-xs" /></TableCell>
                    <TableCell className="max-w-[18rem]">
                      <button onClick={(e) => { e.stopPropagation(); ctl.peekTeam(t.teamNumber, t.name); }} className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" title={tags.map((x) => x.label).join(' · ') || 'Close to the event average'}>
                        <span className="font-medium">{t.teamNumber}</span> <span className="inline-block max-w-[11rem] truncate align-bottom text-muted-foreground">{t.name}</span>
                      </button>
                      {listed(t.teamNumber) && <Bookmark className="ml-1 inline size-3.5 fill-current align-[-2px] text-accent" aria-label="On shortlist" />}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-accent">{fmt(t.opr?.totalNp ?? null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(t.opr?.auto ?? null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(t.opr?.teleop ?? null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(t.opr?.endgame ?? null)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{t.wins != null ? `${t.wins}-${t.losses}-${t.ties}` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(t.rp)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(t.avg?.total ?? null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(t.avg?.penaltiesCommitted ?? null)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>{actionsFor(t)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {f.pages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          <Button variant="ghost" size="icon" disabled={f.page === 0} onClick={() => f.setPage((p) => p - 1)} aria-label="Previous page" className="max-sm:size-11"><ChevronLeft /></Button>
          <span className="text-muted-foreground">Page {f.page + 1} of {f.pages} · {f.rows.length} teams</span>
          <Button variant="ghost" size="icon" disabled={f.page >= f.pages - 1} onClick={() => f.setPage((p) => p + 1)} aria-label="Next page" className="max-sm:size-11"><ChevronRight /></Button>
        </nav>
      )}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <SourceLine f={ev} />
        <OfficialSourceLinks links={officialEventLinks(ev.code, ev.season)} />
        <span>Data freshness: {relTime(ev.fetchedAt)}{ev.partial ? ' · some requests failed, figures may be incomplete' : ''}. OPR via FTC Scout; ranks, records and matches via {ev.source === 'cache' ? 'cache' : ev.source === 'first-events' ? 'FIRST Events' : 'FTC Scout'}.</span>
      </p>

      <FieldMatchesSheet ev={ev} team={matchesOf} onClose={() => setMatchesOf(null)} onOpen={(m, team) => setMatch({ m, team })} />
      <MatchDetailSheet sel={match ? { m: match.m, ev } : null} team={match?.team ?? 0} onClose={() => setMatch(null)} actions={ctl.actions as TeamActions} />
    </div>
  );
}

function FieldMatchesSheet({ ev, team, onClose, onOpen }: { ev: NonNullable<ReturnType<typeof useEventField>['ev']>; team: FtcTeamEventStats | null; onClose: () => void; onOpen: (m: FtcMatchFull, team: number) => void }) {
  const narrow = useIsNarrow();
  const ps = team ? teamMatches(ev, team.teamNumber) : [];
  return (
    <Sheet open={!!team} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-xl')}>
        {team && (
          <>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <SheetTitle>{team.teamNumber} {team.name} · matches</SheetTitle>
              <SheetDescription>{ev.name}{team.wins != null && <> · <Badge variant="secondary">{team.wins}-{team.losses}-{team.ties}</Badge></>}</SheetDescription>
            </SheetHeader>
            {ps.length
              ? <ul className="flex-1 divide-y divide-border overflow-y-auto pb-[env(safe-area-inset-bottom)]">{ps.map((p) => <MatchLine key={p.match.key} p={p} team={team.teamNumber} onOpen={() => onOpen(p.match, team.teamNumber)} />)}</ul>
              : <div className="p-6"><EmptyState title="No matches found" /></div>}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
