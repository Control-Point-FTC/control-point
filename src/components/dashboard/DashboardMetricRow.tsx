import { memo } from 'react';
import { CalendarCheck, CheckSquare, Calendar, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../i18n';
import { cn } from '../ui';

function KpiCard({ icon: Icon, label, value, sub, onClick, tone = 'default' }: any) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl border border-text-base/10 bg-text-base/[0.04] hover:bg-text-base/[0.07] hover:border-accent/40 active:scale-[0.98] transition-all p-3 sm:p-4 group cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-4 h-4 text-accent shrink-0" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted group-hover:text-text-base transition-colors truncate">
          {label}
        </p>
      </div>
      <p className={cn(
        "text-xl sm:text-2xl font-display font-bold tracking-tight truncate",
        tone === 'warn' ? 'text-rose-400' : tone === 'ok' ? 'text-emerald-400' : 'text-text-base'
      )}>
        {value}
      </p>
      <p className="text-[11px] text-text-muted mt-0.5 truncate">{sub}</p>
    </button>
  );
}

interface DashboardMetricRowProps {
  presentCount: number;
  memberCount: number;
  hasSessionToday: boolean;
  activeTaskCount: number;
  overdueCount: number;
  nextEvent: any;
  totalBudget: number;
  onNavigate: (path: string) => void;
}

/**
 * The four top-line numbers: today's attendance, open tasks, what's up next,
 * and the budget balance. Every card navigates somewhere useful.
 */
function DashboardMetricRow({
  presentCount,
  memberCount,
  hasSessionToday,
  activeTaskCount,
  overdueCount,
  nextEvent,
  totalBudget,
  onNavigate,
}: DashboardMetricRowProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
      <KpiCard
        icon={CalendarCheck}
        label={t('dashboard.todayAttendance')}
        value={hasSessionToday ? `${presentCount} / ${memberCount}` : `${memberCount} ${memberCount === 1 ? t('dashboard.member') : t('dashboard.members')}`}
        sub={hasSessionToday ? t('dashboard.checkedInSoFar') : t('dashboard.noSessionToday')}
        onClick={() => onNavigate('/attendance')}
      />
      <KpiCard
        icon={CheckSquare}
        label={t('dashboard.openTasks')}
        value={activeTaskCount}
        sub={overdueCount > 0 ? t('dashboard.overdue', { count: overdueCount }) : t('dashboard.everythingOnTrack')}
        tone={overdueCount > 0 ? 'warn' : 'default'}
        onClick={() => onNavigate('/tasks')}
      />
      <KpiCard
        icon={Calendar}
        label={t('dashboard.upNext')}
        value={nextEvent ? nextEvent.title : t('dashboard.nothing')}
        sub={nextEvent ? nextEvent.dateLabel : t('dashboard.noEventsScheduled')}
        onClick={() => onNavigate('/calendar')}
      />
      <KpiCard
        icon={Wallet}
        label={t('nav.budget')}
        value={`$${totalBudget.toLocaleString()}`}
        sub={t('dashboard.netBalance')}
        tone={totalBudget < 0 ? 'warn' : 'ok'}
        onClick={() => onNavigate('/budget')}
      />
    </div>
  );
}

export default memo(DashboardMetricRow);
