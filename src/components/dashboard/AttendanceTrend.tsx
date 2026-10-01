import { useMemo } from 'react';
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

/** The 14-day present-check-ins line chart, reusable outside the dashboard. */
export function AttendanceTrendChart({ attendance, height = 'h-44' }: { attendance: any[]; height?: string }) {
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

  const accentColor = cssVar('--color-accent', '#FFC700');
  const secondaryColor = cssVar('--color-secondary', '#1A1A1A');

  return (
    <div className={`${height} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} interval={2} />
          <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
          <Tooltip
            contentStyle={{ backgroundColor: secondaryColor, border: '1px solid #ffffff20', borderRadius: '12px' }}
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
export default function AttendanceTrend({ attendance, onNavigate }: AttendanceTrendProps) {
  return (
    <Card
      title="Attendance Trend"
      subtitle="Present check-ins · last 14 days"
      icon={TrendingUp}
      className="md:col-span-2 xl:col-span-7 p-5 gap-3 cursor-pointer hover:border-accent/30 transition-colors"
      onClick={() => onNavigate('/attendance')}
    >
      <AttendanceTrendChart attendance={attendance} />
    </Card>
  );
}
