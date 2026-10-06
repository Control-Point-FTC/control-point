// shadcn/ui Chart pattern for recharts: a container that exposes series
// colours as CSS variables (--color-<key>) and one tooltip component.
import * as React from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '../cn';

export type ChartConfig = Record<string, { label: string; color: string }>;

const ChartContext = React.createContext<ChartConfig>({});

export function ChartContainer({ config, className, children, ...props }: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof ResponsiveContainer>['children'];
}) {
  const style = Object.fromEntries(Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color])) as React.CSSProperties;
  return (
    <ChartContext.Provider value={config}>
      <div
        data-slot="chart"
        style={style}
        className={cn(
          'w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border',
          '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-surface]:outline-none',
          className,
        )}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = Tooltip;

/** shadcn-style tooltip body: label on top, one row per series with its swatch. */
export function ChartTooltipContent({ active, payload, label, labelFormatter, hideLabel }: {
  active?: boolean;
  payload?: any[];
  label?: any;
  labelFormatter?: (l: any) => React.ReactNode;
  hideLabel?: boolean;
}) {
  const config = React.useContext(ChartContext);
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[8rem] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-xl">
      {!hideLabel && <div className="mb-1 font-medium">{labelFormatter ? labelFormatter(label) : label}</div>}
      <div className="grid gap-1">
        {payload.filter((p) => p.value != null).map((p) => {
          const key = String(p.dataKey);
          const c = config[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: c?.color ?? p.color }} />
              <span className="text-muted-foreground">{c?.label ?? p.name}</span>
              <span className="ml-auto font-mono font-medium tabular-nums text-foreground">{p.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
