import { format } from 'date-fns';
import { Activity, CheckSquare, UserPlus, Calendar, CalendarCheck, Wallet } from 'lucide-react';
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
export function activityWhen(item: ActivityItem): string {
  const dayLabel = (dateStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yesterdayStr = format(new Date(Date.now() - 864e5), 'yyyy-MM-dd');
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
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
export default function TeamActivity({ items, onNavigate }: { items: ActivityItem[]; onNavigate: (path: string) => void }) {
  return (
    <Card
      title="Team Activity"
      subtitle={items.length === 0 ? 'Quiet week so far' : 'What the team has been up to'}
      icon={Activity}
      className="xl:col-span-7 p-4 gap-2 xl:min-h-0 xl:overflow-hidden"
    >
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">
          Nothing logged in the last 7 days. Once tasks move and events get added, they'll show up here.
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-1">
          {items.map((a, i) => {
            const Icon = icons[a.kind] || Activity;
            const when = activityWhen(a);
            return (
              <div
                key={`${a.kind}-${i}`}
                onClick={() => onNavigate(kindRoutes[a.kind])}
                className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-white/[0.04] hover:border-accent/20 border border-transparent transition-all cursor-pointer"
                title={`Open ${kindRoutes[a.kind].replace('/', '')}`}
              >
                <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white leading-snug">{a.title}</p>
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
