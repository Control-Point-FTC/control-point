// Modern Predict tabs: Outlook (our odds), Alliance (pick / captain
// scenarios), Field (every team, searchable) and Matches (calls + results).
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Crown, Gauge, Search, Swords, Trophy, Users } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Badge, Input, Label, Skeleton, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { pct, preMatchCall, rankRange, usePartners } from '../../../components/predict/usePredictController';
import type { ForecastView } from '../../../services/predictApi';
import { EmptyState, Stat } from '../../ui/page';
import { Stagger, StaggerItem } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';

type FcProps = { fc: ForecastView; myTeam: number | null };
const ease = [0.2, 0.8, 0.2, 1] as const;

/** A bar that grows to its width (motion respects reduced motion via ModernShell). */
function GrowBar({ value, className, delay = 0 }: { value: number; className?: string; delay?: number }) {
  return (
    <motion.div
      className={cn('h-full rounded-full', className)}
      initial={{ width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      transition={{ duration: 0.6, ease, delay }}
    />
  );
}

// ---------------------------------------------------------------------------
// Outlook
// ---------------------------------------------------------------------------

export function OutlookTab({ fc, myTeam }: FcProps) {
  const me = myTeam ? fc.teams.find((t) => t.team === myTeam) : undefined;
  if (!me) return <EmptyState icon={Users} title={myTeam ? `Team ${myTeam} isn't at this event` : 'No team connected'} description="See the Field tab for every team's odds." />;
  const pre = fc.prequalified.includes(me.team);
  const p = me.points;
  const parts = [
    { k: 'Quals rank', v: p.quals, cls: 'bg-accent' },
    { k: 'Alliance selection', v: p.alliance, cls: 'bg-amber-500' },
    { k: 'Playoffs', v: p.playoffs, cls: 'bg-sky-500' },
    { k: 'Awards', v: p.awards ?? 0, cls: 'bg-fuchsia-500' },
  ];
  const sum = parts.reduce((s, x) => s + x.v, 0) || 1;
  const n = fc.teams.length;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6" aria-label="Chance to advance">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent/10 blur-3xl" />
          {pre ? (
            <>
              <Badge variant="success">Already qualified</Badge>
              <p className="mt-3 font-display text-2xl font-semibold text-foreground">Team {me.team} has already qualified for the next level.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Team {me.team}'s chance to advance</p>
              <p className="mt-1 font-display text-6xl font-semibold tabular-nums tracking-tight text-foreground sm:text-7xl">
                <AnimatedValue value={pct(me.pAdvance)} />
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><GrowBar value={me.pAdvance} className="bg-accent" /></div>
              {fc.matchesOnly && (
                <p className="mt-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{pct(fc.matchesOnly.pAdvance)}</span> from match results alone · <span className="font-medium text-foreground">{pct(me.pAdvance)}</span> with your award history
                </p>
              )}
            </>
          )}
        </section>
        <Stagger className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border border-border p-6">
          <StaggerItem><Stat icon={Crown} label="Captain" value={pct(me.pCaptain)} hint="top seed picks" /></StaggerItem>
          <StaggerItem><Stat icon={Users} label="Picked" value={pct(me.pPicked)} hint="chosen as partner" /></StaggerItem>
          <StaggerItem><Stat icon={Trophy} label="Win event" value={pct(me.pWin)} /></StaggerItem>
          <StaggerItem><Stat icon={Gauge} label="Finalist" value={pct(me.pFinalist)} /></StaggerItem>
        </Stagger>
      </div>

      <section aria-labelledby="rank-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h3 id="rank-h" className="text-base font-semibold text-foreground">Likely quals rank</h3>
          <span className="text-sm tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{rankRange(me.rank.p10, me.rank.p90)}</span>
            {me.rank.p10 !== me.rank.p90 && ` · avg ${me.rank.mean.toFixed(1)}`} of {n}
          </span>
        </div>
        {/* One cell per seed: the likely range is lit, the average is marked. */}
        <div className="flex gap-[3px]" role="img" aria-label={`Likely rank ${rankRange(me.rank.p10, me.rank.p90)} of ${n}`}>
          {Array.from({ length: n }, (_, i) => {
            const seed = i + 1;
            const inRange = seed >= Math.round(me.rank.p10) && seed <= Math.round(me.rank.p90);
            const avg = seed === Math.round(me.rank.mean);
            return (
              <motion.span
                key={seed}
                initial={{ opacity: 0, scaleY: 0.4 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ duration: 0.25, delay: Math.min(0.6, i * 0.012) }}
                className={cn('h-7 min-w-0 flex-1 rounded-[3px]', avg ? 'bg-accent' : inRange ? 'bg-accent/40' : 'bg-muted')}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground"><span>1st</span><span>{n}th</span></div>
      </section>

      <section aria-labelledby="pts-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h3 id="pts-h" className="text-base font-semibold text-foreground">Where your expected points come from{fc.season >= 2025 ? '' : ' (2025+ points system)'}</h3>
          <span className="text-sm text-muted-foreground">Total <span className="font-medium tabular-nums text-foreground">{p.total != null ? p.total.toFixed(1) : '—'}</span></span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {parts.map((x, i) => (
            <motion.div key={x.k} className={x.cls} title={`${x.k}: ${x.v.toFixed(1)}`}
              initial={{ width: 0 }} animate={{ width: `${(x.v / sum) * 100}%` }} transition={{ duration: 0.6, ease, delay: 0.1 + i * 0.08 }} />
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {parts.map((x) => (
            <div key={x.k} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-2 shrink-0 rounded-full', x.cls)} />{x.k}</dt>
              <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums text-foreground">{x.v.toFixed(1)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">Average over all simulations.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alliance
// ---------------------------------------------------------------------------

export function AllianceTab({ season, code, fc, nameOf, myTeam, refreshKey }: FcProps & { season: number; code: string; nameOf: (t: number) => string; refreshKey: number }) {
  const { data, err } = usePartners(season, code, refreshKey);
  if (!myTeam) return <EmptyState icon={Users} title="Connect your FTC team" description="Alliance scenarios are worked out for your team." />;
  if (err) return <EmptyState title="Couldn't load alliance options" description={err} />;
  if (!data) return (
    <div className="space-y-2" aria-busy="true">
      <p className="text-sm text-muted-foreground">Simulating the event once per possible partner…</p>
      {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  );
  if (data.role === 'none') {
    const mine = fc.teams.find((t) => t.team === myTeam);
    return <EmptyState icon={Users} title="Alliances are set" description={`Alliance selection has happened, so your partner is locked in. Your chance to advance from here: ${pct(mine?.pAdvance)}.`} />;
  }
  const best = data.options[0]?.pAdvance ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{data.role === 'captain' ? 'Who should we pick?' : 'Best captains for us'}</h3>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {data.role === 'captain'
              ? `You're likely a captain (${pct(data.baseline.pCaptain)}). Each option simulates the event with that partner on your alliance.`
              : `You're more likely to be picked than to captain. Each option simulates the event with that captain picking you.`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Right now</p>
          <p className="font-display text-2xl font-semibold tabular-nums text-foreground">{pct(data.baseline.pAdvance)}</p>
        </div>
      </div>
      <Stagger as="ol" className="grid gap-3 md:grid-cols-2">
        {data.options.map((o, i) => {
          const delta = o.pAdvance - data.baseline.pAdvance;
          return (
            <StaggerItem as="li" key={o.team} className={cn('rounded-xl border border-border bg-card p-4', i === 0 && 'border-accent/50 ring-1 ring-accent/20')}>
              <div className="flex items-start gap-3">
                <span className="font-display text-2xl font-semibold tabular-nums text-muted-foreground/70">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{o.team} <span className="text-muted-foreground">{nameOf(o.team)}</span></p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {i === 0 && <Badge variant="soft">Best fit</Badge>}
                    <Badge variant={delta >= 0 ? 'success' : 'destructive'}>{delta >= 0 ? '+' : ''}{Math.round(delta * 100)} pts</Badge>
                    <span className="text-xs text-muted-foreground">win {pct(o.pWin)}</span>
                  </div>
                </div>
                <span className="font-display text-xl font-semibold tabular-nums text-foreground">{pct(o.pAdvance)}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><GrowBar value={best ? o.pAdvance / best : 0} className="bg-accent" delay={i * 0.04} /></div>
            </StaggerItem>
          );
        })}
      </Stagger>
      <p className="text-xs text-muted-foreground">Odds include rank, alliance, playoff and award points. Scout and talk to teams too — the model can't see robot changes or how well two robots work together.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

export function FieldTab({ fc, nameOf, myTeam }: FcProps & { nameOf: (t: number) => string }) {
  const narrow = useIsNarrow();
  const [q, setQ] = useState('');
  const pre = new Set(fc.prequalified);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? fc.teams.filter((t) => String(t.team).includes(s) || nameOf(t.team).toLowerCase().includes(s)) : fc.teams;
  }, [fc.teams, q, nameOf]);
  const search = (
    <div className="relative mb-4 max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a team" aria-label="Find a team" className="pl-9 max-sm:h-11" />
    </div>
  );
  const odds = (t: ForecastView['teams'][number]) => pre.has(t.team)
    ? <Badge variant="success">Qualified</Badge>
    : <span className="font-medium tabular-nums text-foreground">{pct(t.pAdvance)}</span>;
  if (narrow) {
    return (
      <div>
        {search}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((t) => (
            <li key={t.team} className={cn('px-4 py-3', t.team === myTeam && 'bg-accent/[0.07]')}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{t.team} <span className="text-muted-foreground">{nameOf(t.team)}</span>{t.team === myTeam && <Badge variant="soft" className="ml-1.5">You</Badge>}</p>
                  <p className="text-xs text-muted-foreground">Rank {rankRange(t.rank.p10, t.rank.p90)} · captain {pct(t.pCaptain)} · picked {pct(t.pPicked)} · win {pct(t.pWin)}</p>
                </div>
                {odds(t)}
              </div>
              {!pre.has(t.team) && <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><GrowBar value={t.pAdvance} className="bg-accent" /></div>}
            </li>
          ))}
        </ul>
        {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No team matches “{q}”.</p>}
      </div>
    );
  }
  return (
    <div>
      {search}
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead><TableHead className="w-[32%]">Chance to advance</TableHead><TableHead>Likely rank</TableHead>
              <TableHead className="text-right">Captain</TableHead><TableHead className="text-right">Picked</TableHead><TableHead className="text-right">Win</TableHead>
              <TableHead className="text-right" title="Expected points from rank, alliance selection and playoffs">Match pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.team} className={cn(t.team === myTeam && 'bg-accent/[0.07] hover:bg-accent/10')}>
                <TableCell className="max-w-[18rem]">
                  <span className="font-medium text-foreground">{t.team}</span> <span className="truncate text-muted-foreground">{nameOf(t.team)}</span>
                  {t.team === myTeam && <Badge variant="soft" className="ml-1.5">You</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">{!pre.has(t.team) && <GrowBar value={t.pAdvance} className="bg-accent" />}</div>
                    <span className="w-20 text-right">{odds(t)}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{rankRange(t.rank.p10, t.rank.p90)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(t.pCaptain)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(t.pPicked)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(t.pWin)}</TableCell>
                <TableCell className="text-right tabular-nums">{t.points.matchPoints.toFixed(1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No team matches “{q}”.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

type MatchFilter = 'all' | 'upcoming' | 'played';

export function MatchesTab({ fc, myTeam }: FcProps) {
  const [mine, setMine] = useState(!!myTeam);
  const [filter, setFilter] = useState<MatchFilter>('all');
  const list = useMemo(() => (fc.matches ?? []).filter((m) =>
    (!mine || !myTeam || m.red.includes(myTeam) || m.blue.includes(myTeam))
    && (filter === 'all' || (filter === 'played') === !!m.played)), [fc.matches, mine, myTeam, filter]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <ToggleGroup type="single" aria-label="Show matches" value={filter} onValueChange={(v) => { if (v) setFilter(v as MatchFilter); }}>
          <ToggleGroupItem value="all" className="max-sm:h-11">All</ToggleGroupItem>
          <ToggleGroupItem value="upcoming" className="max-sm:h-11">Upcoming</ToggleGroupItem>
          <ToggleGroupItem value="played" className="max-sm:h-11">Played</ToggleGroupItem>
        </ToggleGroup>
        {myTeam && (
          <div className="flex items-center gap-2">
            <Switch id="predict-mine" checked={mine} onCheckedChange={setMine} />
            <Label htmlFor="predict-mine" className="cursor-pointer">Only team {myTeam}'s matches</Label>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Upcoming matches show predicted scores and win odds; played ones show the result and whether the pre-match call held.</p>
      {!list.length ? <EmptyState icon={Swords} title="No matches yet" description="The match schedule appears here once it's published." /> : (
        <Stagger as="ul" className="divide-y divide-border rounded-xl border border-border">
          {list.map((m) => <MatchRow key={m.key} m={m} myTeam={myTeam} />)}
        </Stagger>
      )}
    </div>
  );
}

function MatchRow({ m, myTeam }: { m: NonNullable<ForecastView['matches']>[number]; myTeam: number | null }) {
  const p = m.pRedWin;
  const favRed = p != null && p >= 0.5;
  const won = m.played ? (m.played.red === m.played.blue ? 'Tie' : m.played.red > m.played.blue ? 'Red won' : 'Blue won') : null;
  return (
    <StaggerItem as="li" className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,9rem)_minmax(0,1fr)_8rem]">
      <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
      <Alliance color="red" teams={m.red} myTeam={myTeam} score={m.played?.red ?? null} mean={m.redMean} />
      <div className="col-span-2 sm:col-span-1 sm:col-start-3">
        {p != null ? (
          <div className="flex h-2 overflow-hidden rounded-full" title={`Red ${pct(p)} · Blue ${pct(1 - p)}`}>
            <GrowBar value={p} className="rounded-none bg-red-500" /><div className="flex-1 bg-blue-500" />
          </div>
        ) : <div className="h-2 rounded-full bg-muted" />}
      </div>
      <Alliance color="blue" teams={m.blue} myTeam={myTeam} score={m.played?.blue ?? null} mean={m.blueMean} className="col-start-2 sm:col-start-4" />
      <div className="col-start-2 text-xs sm:col-start-5 sm:text-right">
        {won ? (
          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <span className={cn('font-medium', won === 'Red won' ? 'text-red-500' : won === 'Blue won' ? 'text-blue-500' : 'text-muted-foreground')}>{won}</span>
            <CallBadge pre={m.pre ?? null} played={m.played!} />
          </div>
        ) : p != null ? (
          <span className={cn('font-medium', favRed ? 'text-red-500' : 'text-blue-500')}>{favRed ? 'Red' : 'Blue'} {pct(favRed ? p : 1 - p)}</span>
        ) : <span className="text-muted-foreground" title="Which two robots will play isn't known yet">No prediction</span>}
      </div>
    </StaggerItem>
  );
}

function CallBadge({ pre, played }: { pre: number | null; played: { red: number; blue: number } }) {
  const c = preMatchCall(pre, played);
  if (c.kind === 'none') return <Badge variant="outline" title="No forecast was recorded before this match">No pre-match call</Badge>;
  if (c.kind === 'even') return null;
  return c.kind === 'called'
    ? <Badge variant="success" title={`Before the match: ${c.fav} ${pct(c.favP)}`}>Called it · {pct(c.favP)}</Badge>
    : <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-500" variant="outline" title={`Before the match the winner had ${pct(1 - c.favP)}`}>Upset · {pct(1 - c.favP)}</Badge>;
}

function Alliance({ color, teams, myTeam, score, mean, className }: { color: 'red' | 'blue'; teams: number[]; myTeam: number | null; score: number | null; mean: number | null; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-xs', color === 'blue' && 'sm:flex-row-reverse', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', color === 'red' ? 'bg-red-500' : 'bg-blue-500')} aria-label={color === 'red' ? 'Red alliance' : 'Blue alliance'} />
      {teams.map((t) => (
        <span key={t} className={cn('rounded-md px-1.5 py-0.5 font-medium tabular-nums', t === myTeam ? 'bg-accent text-accent-ink' : 'bg-muted text-foreground')}>{t}</span>
      ))}
      <span className={cn('tabular-nums text-muted-foreground', color === 'blue' ? 'ml-auto sm:ml-0 sm:mr-auto' : 'ml-auto')}>
        {score != null ? <span className="font-display text-sm font-semibold text-foreground">{score}</span> : mean != null ? `~${Math.round(mean)}` : null}
      </span>
    </div>
  );
}
