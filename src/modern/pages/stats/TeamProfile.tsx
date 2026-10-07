// Modern team profile (Team Stats → Compete, and any team opened from
// Analyze). Same data and rules as Legacy TeamScoutView (useScoutProfile's
// empty-season handling, lazy event loads, never a side-by-side compare):
// a hero, OPR with percentiles, one interactive trend chart, an event
// timeline and season-wide partners & opponents.
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Bot, BookmarkCheck, BookmarkPlus, CalendarDays, ChevronDown, Clock, Flag, Gauge, GraduationCap, MapPin, Pin, PinOff, RefreshCw, Settings as SettingsIcon, Swords, Target, TrendingDown, TrendingUp, Users, Zap } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, ChartContainer, ChartTooltip, ChartTooltipContent, Collapsible, CollapsibleContent, CollapsibleTrigger,
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { ALL_SEASONS, SEASON_COLOR, SEASON_NAMES, fmt, relTime, seasonShort, useIsNarrow } from '../../../components/scout/ScoutUi';
import { OPR_COMPONENT, TRENDS, scoutWithBruno, useEvents, useScoutProfile, type TeamActions, type TrendKey } from '../../../components/scout/CompeteView';
import { eventAverages, partnersAndOpponents, percentile, seasonTrend, teamMatches, trendDirection, type PartnerRow, type TrendPoint } from '../../../utils/ftcAnalysis';
import type { FtcEventFull, FtcMatchFull, FtcTeamProfile } from '../../../types/ftcScout';
import { EmptyState, Section } from '../../ui/page';
import { Reveal, Stagger, StaggerItem } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';
import { EventHistory } from './EventHistory';
import { MatchDetailSheet, MatchLine, OfficialSourceLinks, SeasonToggle, SourceLine, TeamMenu, officialTeamLinks } from './statsUi';

type OprKey = 'tot' | 'auto' | 'dc' | 'eg';

export function TeamProfile({ number, season, onSeasonChange, actions = {}, autoSeason, headerExtra }: {
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
  const [oprOpen, setOprOpen] = useState<OprKey | null>(null);
  const [match, setMatch] = useState<{ m: FtcMatchFull; ev: FtcEventFull } | null>(null);
  const seasons = profile?.seasons?.length ? [...new Set([...profile.seasons, 2026])].sort((a, b) => b - a) : ALL_SEASONS;

  if (loading && !profile) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading team statistics">
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (notConnected) {
    return (
      <EmptyState
        icon={SettingsIcon}
        title="No FTC team connected yet"
        description="Connect your FTC team number in Settings to see live stats, OPR rankings and event history."
        action={<Button onClick={() => navigate('/settings?section=workspace')}><SettingsIcon /> Go to Settings</Button>}
      />
    );
  }
  if (error && !profile) {
    return (
      <div className="space-y-4">
        <SeasonToggle seasons={seasons} value={season} onChange={onSeasonChange} />
        <EmptyState
          title="Couldn't load team data"
          description={<>{error}<br />FIRST Events and FTC Scout were both unreachable and there's no saved copy yet.{number ? <><br /><OfficialSourceLinks className="mt-2" prefix="Meanwhile, check it on" links={officialTeamLinks(number, season)} /></> : null}</>}
          action={<Button variant="outline" onClick={reload}><RefreshCw /> Retry</Button>}
        />
      </div>
    );
  }
  if (noSeasonData || !profile) {
    return (
      <div className="space-y-4">
        <SeasonToggle seasons={seasons} value={season} onChange={onSeasonChange} />
        <EmptyState
          icon={CalendarDays}
          title={`No ${seasonShort(season)}${SEASON_NAMES[season] ? ` · ${SEASON_NAMES[season]}` : ''} data yet`}
          description={<>Season not started or no data is available yet. Pick another season to see past results.{number ? <><br /><OfficialSourceLinks className="mt-2" links={officialTeamLinks(number, season)} /></> : null}</>}
        />
      </div>
    );
  }

  const p = profile;
  return (
    <div className="min-w-0">
      <Hero p={p} season={season} seasons={seasons} onSeasonChange={onSeasonChange} actions={actions} extra={headerExtra} />
      {error && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">Couldn't refresh: {error}. Showing the last loaded data.</span>
          <Button size="sm" variant="outline" onClick={reload} className="max-sm:h-11"><RefreshCw /> Retry</Button>
        </div>
      )}

      <Section title="Offensive power rating" description="Season OPR and where it ranks worldwide. Open one for its event-by-event build-up." action={<SourceLine f={{ source: 'ftc-scout', fetchedAt: p.fetchedAt, cached: p.cached || p.source === 'cache' }} />}>
        <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([['tot', 'Total OPR', Target], ['auto', 'Autonomous', Zap], ['dc', 'TeleOp', Gauge], ['eg', 'Endgame', Flag]] as const).map(([k, label, Icon]) => {
            const stat = p.opr?.[k] ?? null;
            const pc = percentile(stat?.rank ?? null, p.totalTeams);
            return (
              <StaggerItem key={k}>
                <button
                  onClick={() => setOprOpen(k)}
                  aria-label={`${label}: ${stat?.value ?? 'no data'}. Open breakdown`}
                  className={cn('group w-full rounded-xl border p-4 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:hover:translate-y-0', k === 'tot' ? 'border-accent/30 bg-accent/[0.05]' : 'border-border bg-card')}
                >
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon className={cn('size-4', k === 'tot' && 'text-accent')} />{label}</span>
                  <span className="mt-1 block font-display text-3xl font-semibold tabular-nums text-foreground"><AnimatedValue value={fmt(stat?.value ?? null)} /></span>
                  <span className="mt-1 block text-xs text-muted-foreground">{stat?.rank != null ? `Rank #${stat.rank.toLocaleString()}` : 'Unranked'}{pc != null && ` · top ${Math.max(1, 100 - pc)}%`}</span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pc ?? 0}%` }} /></span>
                </button>
              </StaggerItem>
            );
          })}
        </Stagger>
        {p.opr?.tot?.value == null && <p className="mt-3 text-xs text-muted-foreground">No OPR data available from either source for this season (FIRST Events doesn't publish OPR; FTC Scout has none yet).</p>}
      </Section>

      <TrendChart trend={seasonTrend(p.events)} season={season} />

      <Section title={`Event history (${p.events.length})`} action={<SourceLine f={p} />}>
        {p.events.length
          ? <EventHistory events={p.events} team={p.number} season={season} actions={actions} onMatch={(m, ev) => setMatch({ m, ev })} />
          : <EmptyState icon={CalendarDays} title="No events found" description={`${p.name} has no events in ${seasonShort(season)} yet.`} />}
      </Section>

      <PartnersSection p={p} season={season} actions={actions} onMatch={(m, ev) => setMatch({ m, ev })} />

      <OprSheet which={oprOpen} p={p} season={season} onClose={() => setOprOpen(null)} />
      <MatchDetailSheet sel={match} team={p.number} onClose={() => setMatch(null)} actions={actions} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ p, season, seasons, onSeasonChange, actions, extra }: { p: FtcTeamProfile; season: number; seasons: number[]; onSeasonChange: (s: number) => void; actions: TeamActions; extra?: ReactNode }) {
  const loc = [p.city, p.state, p.country].filter(Boolean).join(', ');
  const tone = SEASON_COLOR[season]?.hex || 'var(--color-accent)';
  const listed = actions.shortlisted?.(p.number);
  const pinned = actions.pinned?.(p.number);
  return (
    <Reveal className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full opacity-25 blur-3xl" style={{ background: tone }} />
      <div className="relative flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{seasonShort(season)}{SEASON_NAMES[season] ? ` · ${SEASON_NAMES[season]}` : ''}</p>
          <h2 className="mt-1 font-display text-5xl font-semibold leading-none tracking-tight text-foreground sm:text-6xl">{p.number}</h2>
          <p className="mt-2 break-words text-xl text-foreground/90">{p.name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {p.school && <span className="flex min-w-0 items-center gap-1.5"><GraduationCap className="size-4 shrink-0" /><span className="truncate sm:max-w-[18rem]">{p.school}</span></span>}
            {loc && <span className="flex items-center gap-1.5"><MapPin className="size-4" />{loc}</span>}
            {p.rookieYear && <span>Rookie year {p.rookieYear}</span>}
            <span className="flex items-center gap-1.5"><Clock className="size-4" />Updated {relTime(p.fetchedAt)}</span>
            <OfficialSourceLinks links={officialTeamLinks(p.number, season)} />
          </div>
          {p.sponsors.length > 0 && (
            <Collapsible className="mt-3">
              <CollapsibleTrigger className="group inline-flex min-h-8 max-w-full items-center gap-1.5 rounded text-left text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-sm:min-h-11">
                <span className="font-medium text-foreground">Sponsors ({p.sponsors.length})</span>
                <span className="truncate group-data-[state=open]:hidden">{p.sponsors.slice(0, 2).join(' · ')}{p.sponsors.length > 2 ? ' …' : ''}</span>
                <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 text-sm text-muted-foreground">{p.sponsors.join(' · ')}</CollapsibleContent>
            </Collapsible>
          )}
        </div>
        {extra}
      </div>
      <div className="relative mt-6 flex flex-wrap items-center gap-3">
        <SeasonToggle seasons={seasons} value={season} onChange={onSeasonChange} />
        {(actions.onAddShortlist || actions.onTogglePin) && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="outline" size="sm" onClick={() => scoutWithBruno(p.number, p.name, season)} className="max-sm:h-11"><Bot /> Scout with Bruno</Button>
            {actions.onAddShortlist && (
              <Button variant={listed ? 'secondary' : 'outline'} size="sm" aria-pressed={!!listed} onClick={() => actions.onAddShortlist!(p.number, p.name)} className="max-sm:h-11">
                {listed ? <BookmarkCheck /> : <BookmarkPlus />} {listed ? 'On shortlist' : 'Add to shortlist'}
              </Button>
            )}
            {actions.onTogglePin && (
              <Button variant="outline" size="sm" aria-pressed={!!pinned} onClick={() => actions.onTogglePin!(p.number, p.name)} className="max-sm:h-11">
                {pinned ? <><PinOff /> Unpin</> : <><Pin /> Pin team</>}
              </Button>
            )}
          </div>
        )}
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Trends: one chart, any metric
// ---------------------------------------------------------------------------

function TrendChart({ trend, season }: { trend: TrendPoint[]; season: number }) {
  const [key, setKey] = useState<TrendKey>('opr');
  const t = TRENDS.find((x) => x.key === key)!;
  const vals = trend.map((pt) => pt[key]);
  const dir = trendDirection(vals);
  const good = dir === 'flat' || dir == null ? null : (dir === 'up') !== !!t.lowerIsBetter;
  const last = [...vals].reverse().find((v) => v != null) ?? null;
  const data = trend.map((pt, i) => ({ i, name: pt.label, value: pt[key] }));
  return (
    <Section title="Trends" description={`${seasonShort(season)}, event by event`}>
      {!trend.length ? <EmptyState icon={TrendingUp} title="No trend data yet" description={`Trends appear after events in ${seasonShort(season)} have results.`} /> : (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <ToggleGroup type="single" aria-label="Trend metric" value={key} onValueChange={(v) => { if (v) setKey(v as TrendKey); }} className="mb-4 flex w-full justify-start overflow-x-auto">
            {TRENDS.map((x) => <ToggleGroupItem key={x.key} value={x.key} className="shrink-0">{x.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <div className="mb-2 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-3xl font-semibold tabular-nums text-foreground">{fmt(last)}{last != null && t.suffix}</span>
            <span className="text-sm text-muted-foreground">latest</span>
            {dir && (
              <Badge variant={good == null ? 'secondary' : good ? 'success' : 'destructive'}>
                {dir === 'up' ? <TrendingUp /> : dir === 'down' ? <TrendingDown /> : null}
                {dir === 'up' ? 'Rising' : dir === 'down' ? 'Falling' : 'Steady'}
              </Badge>
            )}
          </div>
          <ChartContainer config={{ value: { label: t.label, color: 'var(--color-chart-1)' } }} className="h-56 w-full">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="i" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(i: number) => `E${i + 1}`} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(i: number) => data[i]?.name ?? ''} />} />
              <Line dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--color-value)' }} activeDot={{ r: 6 }} connectNulls animationDuration={700} />
            </LineChart>
          </ChartContainer>
          <Collapsible className="mt-3">
            <CollapsibleTrigger className="group inline-flex min-h-9 items-center gap-1.5 rounded text-sm font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-sm:min-h-11">
              Event by event <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Event</TableHead><TableHead>Date</TableHead><TableHead className="text-right">{t.label}</TableHead><TableHead className="text-right">Rank</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {trend.map((pt, i) => (
                      <TableRow key={pt.code}>
                        <TableCell className="text-muted-foreground">E{i + 1}</TableCell>
                        <TableCell className="min-w-[10rem] whitespace-normal">{pt.label}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{pt.date ?? '—'}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmt(pt[key])}{pt[key] != null && t.suffix}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{pt.rank != null ? `#${pt.rank}` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {vals.some((v) => v == null) && <p className="mt-2 text-xs text-muted-foreground">Blank values: that event didn't report this stat (e.g. no OPR from FTC Scout, or no qualification matches).</p>}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// OPR breakdown sheet
// ---------------------------------------------------------------------------

function OprSheet({ which, p, season, onClose }: { which: OprKey | null; p: FtcTeamProfile; season: number; onClose: () => void }) {
  const narrow = useIsNarrow();
  const evs = p.events.filter((e) => e.stats);
  const { events, loading } = useEvents(season, evs.map((e) => e.code), which != null);
  const comp = which ? OPR_COMPONENT[which] : null;
  const stat = which ? p.opr?.[which] : null;
  const rows = comp ? evs.map((e) => {
    const v = e.stats?.opr?.[comp.key] ?? null;
    const ev = events[e.code];
    const avg = ev ? eventAverages(ev.field) : null;
    const avgV = avg ? (comp.key === 'totalNp' ? avg.opr.totalNp : comp.key === 'auto' ? avg.opr.auto : comp.key === 'teleop' ? avg.opr.teleop : avg.opr.endgame) : null;
    return { e, v, avgV, split: e.stats?.opr ?? null };
  }) : [];
  const dir = trendDirection(rows.map((r) => r.v));
  return (
    <Sheet open={!!which} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        {comp && (
          <>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <SheetTitle>{comp.label}</SheetTitle>
              <SheetDescription>
                Season value {fmt(stat?.value ?? null)}{stat?.rank != null ? ` · rank #${stat.rank.toLocaleString()}` : ''}{p.totalTeams ? ` of ${p.totalTeams.toLocaleString()}` : ''} · OPR via FTC Scout (FIRST Events doesn't publish OPR)
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <p className="text-sm text-muted-foreground">Events contributing{dir && <> · <span className="text-foreground">{dir === 'up' ? 'improving' : dir === 'down' ? 'declining' : 'steady'}</span></>}</p>
              {rows.length ? (
                <ul className="space-y-2">
                  {rows.map(({ e, v, avgV, split }) => (
                    <li key={e.code} className="rounded-xl border border-border p-3">
                      <div className="flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 break-words text-sm font-medium">{e.name}</p>
                        <span className="font-display text-xl font-semibold tabular-nums text-accent">{fmt(v)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.date ?? '—'} · event avg {loading && avgV == null ? '…' : fmt(avgV)}
                        {v != null && avgV != null && <Badge variant={v >= avgV ? 'success' : 'destructive'} className="ml-1.5">{v >= avgV ? '+' : ''}{fmt(v - avgV)}</Badge>}
                      </p>
                      {split && <p className="mt-1 text-xs text-muted-foreground">Components: auto {fmt(split.auto)} · TeleOp {fmt(split.teleop)} · endgame {fmt(split.endgame)} · penalties given {fmt(split.penaltiesCommitted)}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">No events with OPR this season.</p>}
              <p className="text-xs text-muted-foreground">Match-level contributions aren't published by either source — OPR is solved across all of an event's matches, so it's shown per event. {p.source === 'cache' && 'This is a cached copy.'}</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Partners & opponents (season-wide, loaded on demand)
// ---------------------------------------------------------------------------

function PartnersSection({ p, season, actions, onMatch }: { p: FtcTeamProfile; season: number; actions: TeamActions; onMatch: (m: FtcMatchFull, ev: FtcEventFull) => void }) {
  const narrow = useIsNarrow();
  const [open, setOpen] = useState(false);
  const codes = p.events.filter((e) => e.stats?.wins != null || e.stats?.qualMatchesPlayed).map((e) => e.code);
  const { events, errors, loading } = useEvents(season, codes, open);
  const loaded = useMemo(() => codes.map((c) => events[c]).filter((e): e is FtcEventFull => !!e), [codes, events]);
  const { partners, opponents } = useMemo(() => partnersAndOpponents(loaded, p.number), [loaded, p.number]);
  const [matchesFor, setMatchesFor] = useState<{ row: PartnerRow; kind: 'partner' | 'opponent' } | null>(null);
  const failed = Object.keys(errors).length;
  const list = (rows: PartnerRow[], kind: 'partner' | 'opponent') => (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {rows.map((r) => (
        <li key={r.number} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm"><span className="font-medium">{r.number}</span> <span className="text-muted-foreground">{r.name}</span></p>
            <p className="mt-0.5 text-xs text-muted-foreground">Our avg score {fmt(r.avgScore)} · our avg penalties {fmt(r.avgPenalties)} · {r.events.length} shared event{r.events.length === 1 ? '' : 's'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium tabular-nums">{r.wins}-{r.losses}-{r.ties}</p>
            <p className="text-xs text-muted-foreground">{r.matches}× {kind === 'partner' ? 'with' : 'vs'}{r.winRate != null ? ` · ${r.winRate}%` : ''}</p>
          </div>
          <TeamMenu n={r.number} name={r.name} season={season} actions={actions} onViewMatches={() => setMatchesFor({ row: r, kind })} />
        </li>
      ))}
    </ul>
  );
  return (
    <Section title="Partners & opponents" description={`Who ${p.number} played with and against this season.`}>
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-4 rounded-xl border border-dashed border-border p-5 text-left transition-colors hover:border-accent/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><Users className="size-5 text-muted-foreground" /></span>
          <span className="min-w-0">
            <span className="block font-medium text-foreground">Load partner & opponent history</span>
            <span className="block text-sm text-muted-foreground">Records, average scores and penalties across {codes.length} event{codes.length === 1 ? '' : 's'}.</span>
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          {loading && loaded.length < codes.length && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
          {failed > 0 && <p className="text-sm text-destructive">{failed} event{failed === 1 ? '' : 's'} couldn't load — history may be incomplete.</p>}
          {!loading && !partners.length && !opponents.length && <EmptyState title="No partner history available" description="No played matches found for this season yet." />}
          {(partners.length > 0 || opponents.length > 0) && (
            <Tabs defaultValue="partners">
              <TabsList className="mb-3">
                <TabsTrigger value="partners" className="max-sm:h-11"><Users /> Partners ({Math.min(10, partners.length)})</TabsTrigger>
                <TabsTrigger value="opponents" className="max-sm:h-11"><Swords /> Opponents ({Math.min(10, opponents.length)})</TabsTrigger>
              </TabsList>
              <TabsContent value="partners">{list(partners.slice(0, 10), 'partner')}</TabsContent>
              <TabsContent value="opponents">{list(opponents.slice(0, 10), 'opponent')}</TabsContent>
            </Tabs>
          )}
        </div>
      )}
      <Sheet open={!!matchesFor} onOpenChange={(o) => { if (!o) setMatchesFor(null); }}>
        <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-xl')}>
          {matchesFor && (
            <>
              <SheetHeader className="border-b border-border px-6 py-5 pr-12">
                <SheetTitle>{matchesFor.kind === 'partner' ? 'With' : 'Against'} {matchesFor.row.number} {matchesFor.row.name}</SheetTitle>
                <SheetDescription>{matchesFor.row.matches} matches · {matchesFor.row.wins}-{matchesFor.row.losses}-{matchesFor.row.ties} for {p.number}</SheetDescription>
              </SheetHeader>
              <ul className="flex-1 divide-y divide-border overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                {loaded.flatMap((ev) => teamMatches(ev, p.number)
                  .filter((x) => (matchesFor.kind === 'partner' ? x.partners : x.opponents).includes(matchesFor.row.number))
                  .map((x) => <MatchLine key={`${ev.code}:${x.match.key}`} p={x} team={p.number} eventName={ev.name} onOpen={() => { setMatchesFor(null); onMatch(x.match, ev); }} />))}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Section>
  );
}
