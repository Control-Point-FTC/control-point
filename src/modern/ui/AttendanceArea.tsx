// Check-ins per meeting day as a shadcn area chart: gradient fill, a softly
// pulsing dot on the latest day, and the next meeting marked. Shared by Home
// and Attendance.
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { cn } from '../../components/cn';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../components/ui-kit';
import { buildAttendanceSeries } from '../../components/dashboard/AttendanceTrend';

export function AttendanceArea({ attendance, hiddenDates, events, id, className }: {
  attendance: any[]; hiddenDates?: string[]; events: any[]; id: string; className?: string;
}) {
  const data = useMemo(() => buildAttendanceSeries(attendance, hiddenDates, events), [attendance, hiddenDates, events]);
  const max = Math.max(2, ...data.map((d) => d.count ?? 0)) + 1;
  const lastIdx = data.reduce((acc, d, i) => (d.count != null ? i : acc), -1);
  const next = data.find((d) => d.next)?.date;
  return (
    <ChartContainer config={{ count: { label: 'Checked in', color: 'var(--color-chart-1)' } }} className={cn('h-48', className)}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis allowDecimals={false} domain={[0, max]} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        {next && <ReferenceLine x={next} strokeDasharray="3 4" className="stroke-muted-foreground" label={{ value: 'Next meet', position: 'insideTopRight', fontSize: 12, className: 'fill-muted-foreground' }} />}
        <Area
          dataKey="count" type="monotone" stroke="var(--color-count)" strokeWidth={2} fill={`url(#${id})`} connectNulls={false}
          animationDuration={900}
          dot={(p: any) => p.index === lastIdx
            ? <g key={`e${p.index}`}><circle cx={p.cx} cy={p.cy} r={9} fill="var(--color-count)" className="cp-pulse-dot" /><circle cx={p.cx} cy={p.cy} r={4} fill="var(--color-background)" stroke="var(--color-count)" strokeWidth={2} /></g>
            : <g key={`d${p.index}`} />}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
