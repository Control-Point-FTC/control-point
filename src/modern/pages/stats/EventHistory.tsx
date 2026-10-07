// Modern Team Stats event history: a timeline of the season's events. Each
// opens (lazily loading the event) into how the team measured up against the
// field, its matches, the rankings, alliance selection and who it played
// with / against there.
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Award, ChevronDown, MapPin, RefreshCw, Swords, Users } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Badge, Button, Skeleton } from '../../../components/ui-kit';
import { fmt } from '../../../components/scout/ScoutUi';
import { scoutWithBruno, type TeamActions } from '../../../components/scout/CompeteView';
import { fetchScoutEvent } from '../../../services/ftcScoutApi';
import {
  eventAverages, missingFields, partnersAndOpponents, POINT_LABELS, strengthsWeaknesses, teamMatches, type PartnerRow,
} from '../../../utils/ftcAnalysis';
import type { FtcEventFull, FtcMatchFull, FtcTeamEventSummary } from '../../../types/ftcScout';
import { EmptyState } from '../../ui/page';
import { MatchLine, OfficialSourceLinks, RankMedal, SourceLine, officialEventLinks } from './statsUi';

type OnMatch = (m: FtcMatchFull, ev: FtcEventFull) => void;

export function EventHistory({ events, team, season, actions, onMatch }: { events: FtcTeamEventSummary[]; team: number; season: number; actions: TeamActions; onMatch: OnMatch }) {
  return (
    <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-border">
      {[...events].reverse().map((e) => (
        <EventItem key={`${season}:${e.code}`} e={e} team={team} season={season} actions={actions} onMatch={onMatch} />
      ))}
    </ol>
  );
}

function EventItem({ e, team, season, actions, onMatch }: { e: FtcTeamEventSummary; team: number; season: number; actions: TeamActions; onMatch: OnMatch }) {
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
  // Try again button instead of re-requesting in a loop.
  useEffect(() => { if (open && !ev && !loading && !err) load(); }, [open, ev, loading, err, load]);
  const panelId = `mev-${e.code}`;
  return (
    <li className="relative pl-14">
      <RankMedal rank={s?.rank ?? null} className="absolute left-0 top-3 ring-4 ring-background" />
      <div className={cn('rounded-xl border bg-card transition-colors', open ? 'border-accent/40' : 'border-border')}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full flex-col gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{e.name}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{e.date ?? 'Date TBA'}</span>
              {(e.city || e.state) && <span>{[e.city, e.state].filter(Boolean).join(', ')}</span>}
              {e.type && <span>{e.type}</span>}
            </p>
            {s?.awards?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">{s.awards.map((a) => <Badge key={a} variant="soft"><Award />{a}</Badge>)}</div>
            ) : null}
          </div>
          <dl className="flex items-center gap-5 text-sm">
            <div><dt className="text-xs text-muted-foreground">Record</dt><dd className="font-medium tabular-nums">{s?.wins != null ? `${s.wins}-${s.losses}-${s.ties}` : '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">RP</dt><dd className="font-medium tabular-nums">{fmt(s?.rp ?? null)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Event OPR</dt><dd className="font-medium tabular-nums text-accent">{fmt(s?.opr?.totalNp ?? null)}</dd></div>
            <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </dl>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="space-y-6 border-t border-border p-4 sm:p-5">
                {loading && !ev && <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
                {err && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 text-destructive">{err}</span>
                    <Button size="sm" variant="outline" onClick={() => load(true)} className="max-sm:h-11"><RefreshCw /> Try again</Button>
                  </div>
                )}
                {ev && <EventDetail ev={ev} team={team} season={season} actions={actions} onMatch={(m) => onMatch(m, ev)} />}
                {!ev && !loading && !err && <p className="text-sm text-muted-foreground">No event data.</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-sm font-medium text-foreground">{children}</h4>;
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
  const missing = missingFields(me);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <SourceLine f={ev} />
        <OfficialSourceLinks links={officialEventLinks(ev.code, ev.season)} />
        {ev.venue && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{ev.venue}</span>}
      </div>

      {me && (
        <div>
          <Label>Against the field</Label>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {(['totalNp', 'auto', 'teleop', 'endgame'] as const).map((k, i) => {
              const v = me.opr?.[k] ?? null;
              const a = avg.opr[k];
              const top = Math.max(v ?? 0, a ?? 0, 1);
              return (
                <div key={k} title={`${team}: ${fmt(v)} · event avg ${fmt(a)} (${avg.teams} teams)`}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{POINT_LABELS[k]}</span>
                    <span><span className="font-medium tabular-nums text-foreground">{fmt(v)}</span> <span className="text-muted-foreground">avg {fmt(a)}</span></span>
                  </div>
                  <div className="relative mt-1.5 h-2 rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${((v ?? 0) / top) * 100}%` }} transition={{ duration: 0.5, delay: i * 0.05 }} />
                    {a != null && <span className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60" style={{ left: `${(a / top) * 100}%` }} aria-hidden />}
                  </div>
                </div>
              );
            })}
          </div>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t) => <Badge key={t.label} title={t.detail} variant={t.kind === 'strength' ? 'success' : 'destructive'}>{t.label}</Badge>)}
            </div>
          )}
          {missing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Not available for this event: {missing.join(', ')}.</p>}
        </div>
      )}

      <div className="space-y-5">
        <div className="min-w-0">
          <Label>Qualification matches ({quals.length})</Label>
          {quals.length ? <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">{quals.map((p) => <MatchLine key={p.match.key} p={p} team={team} onOpen={() => onMatch(p.match)} />)}</ul>
            : <p className="text-sm text-muted-foreground">No qualification matches for this team at this event.</p>}
        </div>
        <div className="min-w-0">
          <Label>Playoff matches ({playoffs.length})</Label>
          {playoffs.length ? <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">{playoffs.map((p) => <MatchLine key={p.match.key} p={p} team={team} onOpen={() => onMatch(p.match)} />)}</ul>
            : <p className="text-sm text-muted-foreground">Didn't play in the playoffs here.</p>}
        </div>
      </div>

      {ranked.length > 0 && (
        <div>
          <Label>Event rankings</Label>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {[...shownRanks, ...(!meInList && me ? [me] : [])].map((t) => (
              <li key={t.teamNumber}>
                <button
                  onClick={() => actions.onViewTeam?.(t.teamNumber, t.name)}
                  disabled={!actions.onViewTeam || t.teamNumber === team}
                  className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm enabled:hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60', t.teamNumber === team && 'bg-accent/[0.08]')}
                >
                  <RankMedal rank={t.rank} className="size-7 text-xs" />
                  <span className="min-w-0 flex-1 truncate"><span className="font-medium">{t.teamNumber}</span> <span className="text-muted-foreground">{t.name}</span></span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{t.wins != null ? `${t.wins}-${t.losses}-${t.ties}` : ''}{t.rp != null ? ` · ${fmt(t.rp)} RP` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {ranked.length > 8 && <Button variant="link" size="sm" className="mt-1 px-0 max-sm:h-11" onClick={() => setShowAllRanks((v) => !v)}>{showAllRanks ? 'Show top 8' : `Show all ${ranked.length}`}</Button>}
        </div>
      )}

      {ev.alliances.length > 0 && (
        <div>
          <Label>Alliance selection</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ev.alliances.map((a) => (
              <div key={a.number} className={cn('rounded-lg border p-3 text-sm', alliance?.number === a.number ? 'border-accent/50 bg-accent/[0.08]' : 'border-border')}>
                <p className="text-xs text-muted-foreground">{a.name || `Alliance ${a.number}`}</p>
                <p className="mt-0.5">{[a.captain, ...a.picks].filter(Boolean).map((n, i) => <span key={n} className={cn('tabular-nums', n === team && 'font-semibold text-accent')}>{i ? ' · ' : ''}{n}{i === 0 ? ' (C)' : ''}</span>)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(partners.length > 0 || opponents.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          <People title="Teammates here" icon={Users} rows={partners.slice(0, 5)} season={season} actions={actions} />
          <People title="Frequent opponents here" icon={Swords} rows={opponents.slice(0, 5)} season={season} actions={actions} />
        </div>
      )}
    </>
  );
}

function People({ title, icon: Icon, rows, season, actions }: { title: string; icon: typeof Users; rows: PartnerRow[]; season: number; actions: TeamActions }) {
  return (
    <div className="min-w-0">
      <Label><span className="flex items-center gap-1.5"><Icon className="size-4 text-muted-foreground" />{title}</span></Label>
      {rows.length ? (
        <ul className="space-y-0.5">
          {rows.map((r) => (
            <li key={r.number}>
              <button
                onClick={() => (actions.onViewTeam ? actions.onViewTeam(r.number, r.name) : scoutWithBruno(r.number, r.name, season))}
                title={`${r.matches} matches · ${r.wins}-${r.losses}-${r.ties} · avg score ${fmt(r.avgScore)}`}
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-sm:min-h-11"
              >
                <span className="min-w-0 flex-1 truncate"><span className="font-medium">{r.number}</span> <span className="text-muted-foreground">{r.name}</span></span>
                <span className="text-xs tabular-nums text-muted-foreground">{r.matches}× · {r.wins}-{r.losses}-{r.ties}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Nobody yet" className="py-4" />}
    </div>
  );
}
