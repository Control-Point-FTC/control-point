// Bonus ranking point odds for one unplayed qualification match (shared engine:
// ForecastMatch.bonus, the same numbers Control Scout shows). Collapsed to the
// expected ranking points under the win bar; open for each bonus's chance per
// alliance. Always with its confidence tier, never a flat 0% or 100%.
import { ChevronDown } from 'lucide-react';
import type { MatchBonusSummary } from '@control-scout/predict-engine';
import { cn } from '../../../components/cn';
import { Badge } from '../../../components/ui-kit';

/** Each season's names for its three bonus RPs, in the engine's slot order. */
export function bonusLabels(season: number): [string, string, string] | null {
  if (season === 2025) return ['Movement', 'Goal', 'Pattern'];
  if (season === 2026) return ['Swarm', 'Pollinator 1', 'Pollinator 2'];
  return null;
}

/** A call, not a result: kept off a flat 0% or 100%. */
export const callPct = (p: number) => (p < 0.015 ? '1%' : p > 0.985 ? '99%' : `${Math.round(p * 100)}%`);

const TIER: Record<MatchBonusSummary['tier'], { label: string; cls: string }> = {
  provisional: { label: 'Provisional', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-500' },
  moderate: { label: 'Moderate', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-500' },
  confident: { label: 'Confident', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' },
};

export function BonusOdds({ season, bonus, className }: { season: number; bonus: MatchBonusSummary; className?: string }) {
  const labels = bonusLabels(season);
  if (!labels) return null;
  const tier = TIER[bonus.tier];
  return (
    <details className={cn('group rounded-lg border border-border bg-muted/30', className)} data-testid="bonus-odds">
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-foreground">Bonus RPs</span>
        {/* Phones: the short label, so the line never wraps. */}
        <span className="text-muted-foreground"><span className="hidden sm:inline">Expected RP</span><span className="sm:hidden" aria-label="Expected RP">exp. RP</span></span>
        <span className="font-display font-semibold tabular-nums text-red-500">{bonus.expectedRpRed.toFixed(1)}</span>
        <span className="text-muted-foreground">–</span>
        <span className="font-display font-semibold tabular-nums text-blue-500">{bonus.expectedRpBlue.toFixed(1)}</span>
        <Badge variant="outline" className={cn('ml-auto h-5 px-1.5 text-[10px]', tier.cls)} title={bonus.reason}>{tier.label}</Badge>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="space-y-1.5 px-3 pb-2.5 pt-1">
        {labels.map((label, i) => (
          <li key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(0,1fr)] items-center gap-2">
            <Side red p={bonus.red[i]} />
            <span className="text-center text-[11px] text-muted-foreground">{label}</span>
            <Side p={bonus.blue[i]} />
          </li>
        ))}
      </ul>
      <p className="px-3 pb-2.5 text-[11px] leading-snug text-muted-foreground">Expected RP is 3 for a win and 1 for a tie, weighted by their chances (a tie is about 1% in an even match), plus each bonus chance, from each alliance's likely score. Qualification matches only. {bonus.reason}</p>
    </details>
  );
}

function Side({ red, p }: { red?: boolean; p: number }) {
  const v = callPct(p);
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', !red && 'flex-row-reverse')}>
      <span className={cn('w-9 shrink-0 text-xs font-semibold tabular-nums', red ? 'text-right text-red-500' : 'text-blue-500')}>{v}</span>
      <span className={cn('flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted', red ? 'justify-end' : 'justify-start')} role="img" aria-label={`${red ? 'Red' : 'Blue'} ${v}`}>
        <span className={cn('h-full rounded-full', red ? 'bg-red-500' : 'bg-blue-500')} style={{ width: `${Math.max(3, Math.min(97, p * 100))}%` }} />
      </span>
    </span>
  );
}
