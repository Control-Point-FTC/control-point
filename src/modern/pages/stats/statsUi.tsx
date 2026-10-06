// Shared pieces for Modern Team Stats: data-source line, rank medal, season
// toggle, the per-team actions menu, match rows and the match detail sheet.
import { Bot, BookmarkCheck, BookmarkPlus, Eye, ListOrdered, MoreHorizontal, Pin, PinOff } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Sheet, SheetContent,
  SheetDescription, SheetHeader, SheetTitle, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { SEASON_NAMES, fmt, relTime, seasonShort, useIsNarrow } from '../../../components/scout/ScoutUi';
import { scoutWithBruno, type TeamActions } from '../../../components/scout/CompeteView';
import { perspective, type MatchPerspective } from '../../../utils/ftcAnalysis';
import type { FtcEventFull, FtcFreshness, FtcMatchFull, FtcPointSplit } from '../../../types/ftcScout';
import { EmptyState } from '../../ui/page';

/** "FIRST Events · cached · 3 min ago" with stale / partial warnings. */
export function SourceLine({ f, className }: { f: FtcFreshness | null | undefined; className?: string }) {
  if (!f) return null;
  const origin = f.source === 'cache' ? f.origin : f.source;
  const parts = [origin === 'first-events' ? 'FIRST Events' : 'FTC Scout', (f.cached || f.source === 'cache') && 'cached', f.stale && 'stale', f.partial && 'partial', relTime(f.fetchedAt)].filter(Boolean);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)} title={`Fetched ${f.fetchedAt ? new Date(f.fetchedAt).toLocaleString() : 'unknown'}`}>
      <span className={cn('size-1.5 rounded-full', f.stale ? 'bg-destructive' : f.partial ? 'bg-amber-500' : origin === 'first-events' ? 'bg-success' : 'bg-muted-foreground')} />
      {parts.join(' · ')}
    </span>
  );
}

/** Rank medal: gold / silver / bronze for the top three. */
export function RankMedal({ rank, className }: { rank: number | null; className?: string }) {
  const tone = rank === 1 ? 'bg-amber-400 text-black' : rank === 2 ? 'bg-slate-300 text-black' : rank === 3 ? 'bg-orange-400 text-black' : 'bg-muted text-foreground';
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold tabular-nums', tone, className)} title={rank != null ? `Qualification rank #${rank}` : 'No ranking'}>
      {rank ?? '–'}
    </span>
  );
}

export function SeasonToggle({ seasons, value, onChange }: { seasons: number[]; value: number; onChange: (s: number) => void }) {
  return (
    <ToggleGroup type="single" aria-label="Season" value={String(value)} onValueChange={(v) => { if (v) onChange(Number(v)); }} className="max-w-full overflow-x-auto">
      {seasons.map((s) => (
        <ToggleGroupItem key={s} value={String(s)} size="lg" className="max-sm:h-11" title={SEASON_NAMES[s] ? `${seasonShort(s)} · ${SEASON_NAMES[s]}` : undefined}>
          {seasonShort(s)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Everything a host screen offers on a team, in one menu (never "compare"). */
export function TeamMenu({ n, name, season, actions, onViewMatches, label }: { n: number; name: string; season: number; actions: TeamActions; onViewMatches?: () => void; label?: string }) {
  const listed = actions.shortlisted?.(n);
  const pinned = actions.pinned?.(n);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label ?? `Actions for team ${n}`} className="max-sm:size-11"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.onViewTeam && <DropdownMenuItem onSelect={() => actions.onViewTeam!(n, name)}><Eye /> View team</DropdownMenuItem>}
        {onViewMatches && <DropdownMenuItem onSelect={onViewMatches}><ListOrdered /> View matches</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => scoutWithBruno(n, name, season)}><Bot /> Scout with Bruno</DropdownMenuItem>
        {actions.onAddShortlist && (
          <DropdownMenuItem onSelect={() => actions.onAddShortlist!(n, name)}>{listed ? <BookmarkCheck /> : <BookmarkPlus />} {listed ? 'On shortlist' : 'Add to shortlist'}</DropdownMenuItem>
        )}
        {actions.onTogglePin && (
          <DropdownMenuItem onSelect={() => actions.onTogglePin!(n, name)}>{pinned ? <PinOff /> : <Pin />} {pinned ? 'Unpin' : 'Pin team'}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const RESULT = {
  win: { label: 'W', cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  loss: { label: 'L', cls: 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  tie: { label: 'T', cls: 'border-border bg-muted text-foreground' },
} as const;

export function ResultBadge({ result }: { result: 'win' | 'loss' | 'tie' | null }) {
  if (!result) return <Badge variant="outline">Unplayed</Badge>;
  return <Badge variant="outline" className={cn('w-6 justify-center', RESULT[result].cls)}>{RESULT[result].label}</Badge>;
}

function TeamChips({ side, team, teams }: { side: 'red' | 'blue'; team: number; teams: FtcMatchFull['red']['teams'] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {teams.map((t) => (
        <span key={t.number} title={t.name} className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
          t.number === team ? (side === 'red' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white') : side === 'red' ? 'bg-red-500/10 text-red-600 dark:text-red-300' : 'bg-blue-500/10 text-blue-600 dark:text-blue-300')}>
          {t.number}{t.surrogate ? '*' : ''}
        </span>
      ))}
    </span>
  );
}

/** One match from a team's point of view, as a list row that opens details. */
export function MatchLine({ p, team, onOpen, eventName }: { p: MatchPerspective; team: number; onOpen: () => void; eventName?: string }) {
  const m = p.match;
  return (
    <li>
      <button
        onClick={onOpen}
        className="grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        aria-label={`${m.label}${eventName ? ` at ${eventName}` : ''}: ${p.result ?? 'unplayed'}, ${p.scoreFor ?? '—'} to ${p.scoreAgainst ?? '—'}. Open match details`}
      >
        <span className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{m.label}</span>
          <span className={cn('text-[11px]', p.alliance === 'red' ? 'text-red-500' : 'text-blue-500')}>{p.alliance === 'red' ? 'Red' : 'Blue'}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <TeamChips side="red" team={team} teams={m.red.teams} />
          <span className="hidden text-xs text-muted-foreground sm:inline">vs</span>
          <TeamChips side="blue" team={team} teams={m.blue.teams} />
          {eventName && <span className="truncate text-xs text-muted-foreground">{eventName}</span>}
          {p.penaltiesCommitted != null && p.penaltiesCommitted > 0 && <span className="text-xs text-amber-600 dark:text-amber-400">{p.penaltiesCommitted} penalty pts given</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-display text-sm font-semibold tabular-nums">
            <span className="text-red-500">{m.red.score?.total ?? '—'}</span>
            <span className="mx-0.5 text-muted-foreground">–</span>
            <span className="text-blue-500">{m.blue.score?.total ?? '—'}</span>
          </span>
          <ResultBadge result={p.result} />
        </span>
      </button>
    </li>
  );
}

const BREAKDOWN: { k: keyof FtcPointSplit; label: string }[] = [
  { k: 'auto', label: 'Autonomous' },
  { k: 'teleop', label: 'TeleOp' },
  { k: 'endgame', label: 'Endgame' },
  { k: 'penaltiesCommitted', label: 'Penalties committed' },
  { k: 'totalNp', label: 'Total (no penalties)' },
  { k: 'total', label: 'Final score' },
];

/** A match's alliance-by-alliance scoring, mirrored red | blue. */
export function MatchDetailSheet({ sel, team, onClose, actions }: { sel: { m: FtcMatchFull; ev: FtcEventFull } | null; team: number; onClose: () => void; actions: TeamActions }) {
  const narrow = useIsNarrow();
  const m = sel?.m, ev = sel?.ev;
  const p = m ? perspective(m, team) : null;
  const diff = m && m.red.score?.total != null && m.blue.score?.total != null ? m.red.score.total - m.blue.score.total : null;
  return (
    <Sheet open={!!sel} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-xl')}>
        {m && ev && (
          <>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <SheetTitle className="flex flex-wrap items-center gap-2">{m.label}{m.description && <span className="text-sm font-normal text-muted-foreground">· {m.description}</span>}{p && <ResultBadge result={p.result} />}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-2">
                <span>{ev.name}{m.time ? ` · ${new Date(m.time).toLocaleString()}` : ''}</span>
                <SourceLine f={{ source: m.breakdownSource ?? ev.source, fetchedAt: ev.fetchedAt, cached: ev.cached }} />
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {!m.played ? <EmptyState title="Not played yet" description="Scores appear once the match result is posted." /> : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {(['red', 'blue'] as const).map((side) => {
                      const a = m[side];
                      const won = diff != null && (side === 'red' ? diff > 0 : diff < 0);
                      return (
                        <div key={side} className={cn('rounded-xl border p-4', side === 'red' ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-blue-500/30 bg-blue-500/[0.06]', won && 'ring-1 ring-inset', won && (side === 'red' ? 'ring-red-500/50' : 'ring-blue-500/50'))}>
                          <p className={cn('text-xs font-medium', side === 'red' ? 'text-red-500' : 'text-blue-500')}>{side === 'red' ? 'Red' : 'Blue'} alliance{won ? ' · winner' : ''}</p>
                          <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-foreground">{a.score?.total ?? '—'}</p>
                          <ul className="mt-3 space-y-1">
                            {a.teams.map((t) => (
                              <li key={t.number} className={cn('flex min-w-0 items-center gap-1.5 text-sm', t.number === team && 'font-medium')}>
                                {actions.onViewTeam && t.number !== team ? (
                                  <button onClick={() => { onClose(); actions.onViewTeam!(t.number, t.name); }} className="min-h-8 truncate rounded text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">{t.number} {t.name}</button>
                                ) : <span className="truncate">{t.number} {t.name}</span>}
                                {t.surrogate && <span className="text-[11px] text-muted-foreground">(surrogate)</span>}
                                {t.dq && <Badge variant="destructive">DQ</Badge>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {BREAKDOWN.map(({ k, label }) => {
                      const r = m.red.score?.[k] ?? null;
                      const b = m.blue.score?.[k] ?? null;
                      const max = Math.max(Math.abs(r ?? 0), Math.abs(b ?? 0), 1);
                      return (
                        <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-2.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="w-10 shrink-0 text-sm font-medium tabular-nums text-red-500">{r == null ? 'n/a' : fmt(r)}</span>
                            <span className="flex min-w-0 flex-1 justify-end"><span className="h-1.5 rounded-full bg-red-500/80 transition-[width] duration-500" style={{ width: `${r == null ? 0 : (Math.abs(r) / max) * 100}%` }} /></span>
                          </span>
                          <span className="w-24 text-center text-xs text-muted-foreground sm:w-32">{label}</span>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex min-w-0 flex-1"><span className="h-1.5 rounded-full bg-blue-500/80 transition-[width] duration-500" style={{ width: `${b == null ? 0 : (Math.abs(b) / max) * 100}%` }} /></span>
                            <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-blue-500">{b == null ? 'n/a' : fmt(b)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Score difference: <span className="font-medium text-foreground">{diff == null ? '—' : `${Math.abs(diff)} (${diff > 0 ? 'Red' : diff < 0 ? 'Blue' : 'tie'})`}</span>.
                    {' '}{m.breakdownSource === 'first-events' ? 'TeleOp/endgame splits aren’t available for this match (FTC Scout has no breakdown) — shown as n/a.' : 'Final score, auto and penalties from FIRST Events; TeleOp/endgame split from FTC Scout.'}
                  </p>
                  {p && (
                    <Button variant="outline" onClick={() => scoutWithBruno(team, '', ev.season)} className="max-sm:h-11"><Bot /> Scout {team} with Bruno</Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
