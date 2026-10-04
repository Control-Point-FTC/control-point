import { memo } from 'react';
import { format } from 'date-fns';
import { Activity, CheckSquare, UserPlus, Calendar, CalendarCheck, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../i18n';
import { Card } from '../ui';

const icons: Record<string, any> = {
  task: CheckSquare,
  event: Calendar,
  attendance: CalendarCheck,
  member: UserPlus,
  budget: Wallet,
};

/** Where each activity kind leads when clicked. */
const kindRoutes: Record<ActivityItem['kind'], string> = {
  task: '/tasks',
  event: '/calendar',
  attendance: '/attendance',
  member: '/teams',
  budget: '/budget',
};

/** Nav label key per activity kind, for the "Open …" row tooltip. */
const kindNavKeys: Record<ActivityItem['kind'], string> = {
  task: 'nav.tasks',
  event: 'nav.calendar',
  attendance: 'nav.attendance',
  member: 'nav.teamsMembers',
  budget: 'nav.budget',
};

export interface ActivityItem {
  kind: 'task' | 'event' | 'attendance' | 'member' | 'budget';
  title: string;
  detail?: string;
  /** Full timestamp for "Today · 2:14 PM" style labels. */
  ts?: string;
  /** YYYY-MM-DD fallback when no time is available (day label only). */
  dateOnly?: string;
}

/** "Today · 2:14 PM", "Yesterday · 6:20 PM", "Sep 28 · 3:00 PM" — or just the day when there's no time. */
export function activityWhen(item: ActivityItem, t?: (key: string) => string): string {
  const todayLabel = t ? t('dashboard.today') : 'Today';
  const yesterdayLabel = t ? t('dashboard.yesterday') : 'Yesterday';
  const dayLabel = (dateStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yesterdayStr = format(new Date(Date.now() - 864e5), 'yyyy-MM-dd');
    if (dateStr === todayStr) return todayLabel;
    if (dateStr === yesterdayStr) return yesterdayLabel;
    return format(new Date(dateStr + 'T12:00:00'), 'MMM d');
  };
  if (item.ts) {
    const d = new Date(item.ts);
    if (isNaN(d.getTime())) return '';
    return `${dayLabel(format(d, 'yyyy-MM-dd'))} · ${format(d, 'h:mm a')}`;
  }
  if (item.dateOnly) return dayLabel(item.dateOnly);
  return '';
}

/**
 * The team's pulse: task completions, new events, recorded attendance,
 * new members, and budget transactions — each with a human timestamp.
 * Every row is clickable and leads to the relevant section.
 */
function TeamActivity({ items, onNavigate }: { items: ActivityItem[]; onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  return (
    <Card
      title={t('dashboard.teamActivity')}
      subtitle={items.length === 0 ? t('dashboard.quietWeek') : t('dashboard.teamUpTo')}
      icon={Activity}
      className="xl:col-span-7 p-5 gap-3"
    >
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">
          {t('dashboard.noActivity')}
        </p>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto custom-scrollbar pr-1 space-y-1">
          {items.map((a, i) => {
            const Icon = icons[a.kind] || Activity;
            const when = activityWhen(a, t);
            return (
              <div
                key={`${a.kind}-${i}`}
                onClick={() => onNavigate(kindRoutes[a.kind])}
                className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-text-base/[0.04] hover:border-accent/20 border border-transparent transition-all cursor-pointer"
                title={t('dashboard.openIn', { section: t(kindNavKeys[a.kind]) })}
              >
                <div className="w-7 h-7 rounded-lg bg-text-base/5 border border-text-base/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-text-base leading-snug">{a.title}</p>
                  {a.detail && <p className="text-xs text-text-muted leading-snug mt-0.5">{a.detail}</p>}
                  {when && <p className="text-[11px] text-text-muted/70 mt-1">{when}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default memo(TeamActivity);
