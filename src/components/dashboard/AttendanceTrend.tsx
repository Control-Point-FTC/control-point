import { useMemo, memo } from 'react';
import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../hooks/useTheme';
import { Card } from '../ui';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

interface AttendanceTrendProps {
  attendance: any[];
  onNavigate: (path: string) => void;
}

/** The 14-day present-check-ins line chart, reusable outside the dashboard.
 *  `className` controls the wrapper sizing — pass `flex-1 min-h-44` to let
 *  the chart fill a stretched card instead of leaving empty space. */
export function AttendanceTrendChart({ attendance, className = 'h-44' }: { attendance: any[]; className?: string }) {
  const { theme } = useTheme();

  const chartData = useMemo(() => {
    const last14Days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return format(d, 'yyyy-MM-dd');
    });
    return last14Days.map((date) => ({
      date: format(new Date(date + 'T12:00:00'), 'MMM dd'),
      count: attendance?.filter((r: any) => r.date === date && (r.status === 'P' || r.status === 'L')).length || 0,
    }));
  }, [attendance, theme]);

  const dataMax = useMemo(() => Math.max(0, ...chartData.map((d) => d.count)), [chartData]);
  const accentColor = cssVar('--color-accent', '#FFC700');
  const secondaryColor = cssVar('--color-secondary', '#1A1A1A');
  const gridColor = theme === 'light' ? '#09090b14' : '#ffffff10';
  const axisColor = theme === 'light' ? '#71717a' : '#94a3b8';
  const tooltipBorder = theme === 'light' ? '#09090b20' : '#ffffff20';

  return (
    <div className={`${className} w-full min-h-44`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="date" stroke={axisColor} fontSize={10} axisLine={false} tickLine={false} interval={2} />
          <YAxis stroke={axisColor} fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} width={28}
            domain={[0, Math.max(2, dataMax + 1)]} />
          <Tooltip
            contentStyle={{ backgroundColor: secondaryColor, border: `1px solid ${tooltipBorder}`, borderRadius: '12px' }}
            itemStyle={{ color: accentColor }}
          />
          <Line type="monotone" dataKey="count" stroke={accentColor} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Present check-ins per day over the last 14 days. The whole card is
 * clickable into the Attendance view. Re-renders on theme toggle so the
 * line follows the current accent color.
 */
function AttendanceTrend({ attendance, onNavigate }: AttendanceTrendProps) {
  return (
    <Card
      title="Attendance Trend"
      subtitle="Present check-ins · last 14 days"
      icon={TrendingUp}
      className="md:col-span-2 xl:col-span-7 p-5 gap-3 cursor-pointer hover:border-accent/30 transition-colors"
      onClick={() => onNavigate('/attendance')}
    >
      <AttendanceTrendChart attendance={attendance} className="flex-1" />
    </Card>
  );
}

export default memo(AttendanceTrend);
