// "How accurate is this?" for Modern Predict: live scores of forecasts written
// down before the results were known, then the back-test (replaying a past
// season) with a calibration chart.
import { motion } from 'motion/react';
import { Activity, BarChart3, Swords, Users } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton } from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import type { LiveAccuracy, PredictAccuracy } from '../../../services/predictApi';

const STAGE_LABEL: Record<string, string> = { pre: 'before the event', quals: 'after quals', selected: 'after alliance selection' };
const pc1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function Heading({ icon: Icon, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="size-4 text-accent" />{children}</h3>;
}

export function AccuracySheet({ open, onOpenChange, accuracy: a, live }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accuracy: PredictAccuracy | null;
  live: LiveAccuracy | null;
}) {
  const narrow = useIsNarrow();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>How accurate is this?</SheetTitle>
          <SheetDescription>Back-tested on past events, and tracked live this season.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm">
          {!a ? <Skeleton className="h-40" /> : <Report a={a} live={live} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Report({ a, live }: { a: PredictAccuracy; live: LiveAccuracy | null }) {
  const backBrier: Record<string, number> = { pre: a.advancement.pre.brier, quals: a.advancement.quals.brier, selected: a.advancement.selected.brier };
  const stages = (['pre', 'quals', 'selected'] as const);
  const hasLive = !!live && (live.matches.n > 0 || stages.some((s) => live.advancement[s].n > 0));
  return (
    <>
      <section>
        <Heading icon={Activity}>Live this season</Heading>
        {hasLive && live ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Only predictions written down <em>before</em> the results were known, scored against what happened.</p>
            {live.matches.n > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Match winners called" value={pc1(live.matches.accuracy)} note={`${live.matches.n.toLocaleString()} matches · ${live.matches.upsets.toLocaleString()} upsets · back-test ${pc1(a.matches.liveAccuracy)}`} />
                <Metric label="Match odds score" value={live.matches.brier.toFixed(3)} note={`Brier, lower is better · back-test ${a.matches.liveBrier.toFixed(3)}`} />
              </div>
            ) : <p className="text-xs text-muted-foreground">No recorded match calls have been played yet.</p>}
            {stages.some((s) => live.advancement[s].n > 0) && (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {stages.filter((s) => live.advancement[s].n > 0).map((s) => (
                  <li key={s} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                    <span className="text-foreground">Advancement odds {STAGE_LABEL[s]}</span>
                    <span className="text-right">
                      <span className="font-medium tabular-nums text-foreground">{live.advancement[s].brier.toFixed(3)}</span>
                      <span className="block text-xs text-muted-foreground">{live.advancement[s].events} events · back-test {backBrier[s].toFixed(3)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Collecting. Every forecast is written down before its matches are played; live scores appear here once those matches finish.</p>
        )}
      </section>

      <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">Everything below comes from replaying the {a.testSeason} season event by event, using only data that existed at the time. Settings were tuned on the season before.</p>

      <section>
        <Heading icon={Swords}>Match winners ({a.matches.count.toLocaleString()} matches)</Heading>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Called correctly (live)" value={pc1(a.matches.liveAccuracy)} note={`vs ${pc1(a.matches.oprAccuracy)} for plain OPR`} />
          <Metric label="Before the event" value={pc1(a.matches.preEventAccuracy)} />
          <Metric label="Score range accuracy" value={`${(a.matches.scoreRange80Coverage * 100).toFixed(0)}%`} note='of scores land inside the "80%" range' />
        </div>
      </section>

      <section>
        <Heading icon={BarChart3}>Advancement odds ({a.advancement.events} events)</Heading>
        <p className="mb-3 text-xs text-muted-foreground">When it says X%, teams advanced about X% of the time. Dots on the diagonal are perfectly calibrated.</p>
        <Calibration bins={a.advancement.calibrationPre} />
        <p className="mt-3 text-xs text-muted-foreground">Calibration error before the event, after quals and after alliance selection: {a.advancement.pre.calibrationError.toFixed(3)}, {a.advancement.quals.calibrationError.toFixed(3)} and {a.advancement.selected.calibrationError.toFixed(3)}.</p>
      </section>

      {a.partners && (
        <section>
          <Heading icon={Users}>Alliance scenarios</Heading>
          <p className="text-xs text-muted-foreground">Knowing the real partner predicted who wins the event better than the general odds (score {a.partners.allianceWin.brier.toFixed(3)} vs {a.partners.allianceWinGeneral.brier.toFixed(3)}, lower is better, {a.partners.allianceWin.n.toLocaleString()} alliances). The real first pick was in the model's top three {Math.round(a.pickTop3 * 100)}% of the time.</p>
        </section>
      )}

      <section className="text-xs text-muted-foreground">
        <h3 className="mb-2 text-sm font-semibold text-foreground">What it can't see</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Robot rebuilds and new mechanisms until the team plays again.</li>
          <li>How well two robots work together, or teams declining picks.</li>
          <li>Judged awards are estimated from each team's award history.</li>
        </ul>
      </section>
    </>
  );
}

/** Predicted (x) vs actual (y) as dots against the perfect-calibration diagonal. */
function Calibration({ bins }: { bins: PredictAccuracy['advancement']['calibrationPre'] }) {
  if (!bins.length) return <p className="text-xs text-muted-foreground">Not enough events yet.</p>;
  const S = 200, pad = 24;
  const x = (v: number) => pad + v * (S - pad * 1.5);
  const y = (v: number) => S - pad - v * (S - pad * 1.5);
  return (
    <figure className="mx-auto max-w-xs">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full" role="img" aria-label="Calibration: predicted versus actual advancement rate">
        {[0, 0.5, 1].map((t) => (
          <g key={t} className="text-muted-foreground">
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.15} />
            <text x={pad - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="currentColor">{t * 100}%</text>
            <text x={x(t)} y={S - pad + 12} textAnchor="middle" fontSize="8" fill="currentColor">{t * 100}%</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="text-muted-foreground" stroke="currentColor" strokeDasharray="3 3" strokeOpacity={0.6} />
        {bins.map((b, i) => (
          <motion.circle key={b.predicted} cx={x(b.predicted)} cy={y(b.actual)} r={4} className="fill-accent"
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.05 }}>
            <title>{`Said ${Math.round(b.predicted * 100)}% · actually ${Math.round(b.actual * 100)}%`}</title>
          </motion.circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>↑ actually advanced</span><span>predicted →</span></figcaption>
    </figure>
  );
}
