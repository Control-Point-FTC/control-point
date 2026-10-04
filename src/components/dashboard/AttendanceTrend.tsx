import { useMemo, memo } from 'react';
import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import '../../i18n';
import { useTheme } from '../../hooks/useTheme';
import { Card } from '../ui';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

interface AttendanceTrendProps {
  attendance: any[];
  onNavigate: (path: string) => void;
  hiddenDates?: string[];
}

/** The 14-day present-check-ins line chart, reusable outside the dashboard.
 *  `className` controls the wrapper sizing — pass `flex-1 min-h-44` to let
 *  the chart fill a stretched card instead of leaving empty space.
 *  When `hiddenDates` is provided, dates hidden via Manage Dates are skipped
 *  and the chart shows the last 14 *meeting* days instead of the last 14
 *  calendar days, so non-meeting days never drag the line to zero. */
export function AttendanceTrendChart({ attendance, className = 'h-44', hiddenDates }: { attendance: any[]; className?: string; hiddenDates?: string[] }) {
  const { theme } = useTheme();

  const chartData = useMemo(() => {
    const last14CalendarDays = () => Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return format(d, 'yyyy-MM-dd');
    });
    let dates: string[];
    if (hiddenDates) {
      const hidden = new Set(hiddenDates);
      const meetingDays: string[] = [];
      const d = new Date();
      for (let i = 0; i < 120 && meetingDays.length < 14; i++) {
        const ds = format(d, 'yyyy-MM-dd');
        if (!hidden.has(ds)) meetingDays.unshift(ds);
        d.setDate(d.getDate() - 1);
      }
      // Degenerate case (e.g. every weekday hidden): fall back to plain
      // calendar days so the chart still renders something.
      dates = meetingDays.length > 0 ? meetingDays : last14CalendarDays();
    } else {
      dates = last14CalendarDays();
    }
    return dates.map((date) => ({
      date: format(new Date(date + 'T12:00:00'), 'MMM dd'),
      count: attendance?.filter((r: any) => r.date === date && (r.status === 'P' || r.status === 'L')).length || 0,
    }));
  }, [attendance, hiddenDates, theme]);

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
function AttendanceTrend({ attendance, onNavigate, hiddenDates }: AttendanceTrendProps) {
  const { t } = useTranslation();
  const subtitle = hiddenDates && hiddenDates.length > 0
    ? t('dashboard.presentCheckinsMeetingDays')
    : t('dashboard.presentCheckinsDays');
  return (
    <Card
      title={t('dashboard.attendanceTrend')}
      subtitle={subtitle}
      icon={TrendingUp}
      className="md:col-span-2 xl:col-span-7 p-5 gap-3 cursor-pointer hover:border-accent/30 transition-colors"
      onClick={() => onNavigate('/attendance')}
    >
      <AttendanceTrendChart attendance={attendance} hiddenDates={hiddenDates} className="flex-1" />
    </Card>
  );
}

export default memo(AttendanceTrend);
