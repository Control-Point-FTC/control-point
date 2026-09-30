import { format } from 'date-fns';
import { Calendar, MapPin, ArrowRight } from 'lucide-react';
import { Card } from '../ui';

interface UpcomingTimelineProps {
  events: any[];
  onNavigate: (path: string) => void;
}

/** Group an event's date into Today / Tomorrow / weekday buckets. */
function bucketFor(dateStr: string): string {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomorrowStr) return 'Tomorrow';
  return format(new Date(dateStr + 'T12:00:00'), 'EEEE');
}

/**
 * What's coming up, grouped the way people think about it:
 * Today, Tomorrow, then by weekday. Every row opens the calendar.
 */
export default function UpcomingTimeline({ events, onNavigate }: UpcomingTimelineProps) {
  const upcoming = (events || [])
    .filter((e: any) => e.date >= format(new Date(), 'yyyy-MM-dd'))
    .sort((a: any, b: any) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))
    .slice(0, 8);

  const groups: { label: string; items: any[] }[] = [];
  for (const e of upcoming) {
    const label = bucketFor(e.date);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <Card
      title="Up next"
      subtitle={upcoming.length === 0 ? 'Nothing on the calendar' : `${upcoming.length} upcoming ${upcoming.length === 1 ? 'event' : 'events'}`}
      icon={Calendar}
      className="xl:col-span-5"
    >
      {upcoming.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">
          No events scheduled. Add one from the calendar.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2">
                {g.label}
              </p>
              <div className="space-y-2">
                {g.items.map((e: any) => (
                  <button
                    key={e.id}
                    onClick={() => onNavigate('/calendar')}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-accent/40 hover:bg-white/[0.06] transition-all text-left group"
                  >
                    <div className="w-11 shrink-0 rounded-xl bg-accent/10 border border-accent/20 flex flex-col items-center justify-center py-1.5">
                      <span className="text-[10px] font-bold text-accent uppercase">
                        {format(new Date(e.date + 'T12:00:00'), 'MMM')}
                      </span>
                      <span className="text-lg font-display font-bold text-white leading-none">
                        {format(new Date(e.date + 'T12:00:00'), 'd')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate group-hover:text-accent transition-colors">
                        {e.title}
                      </p>
                      <p className="text-[11px] text-text-muted truncate">
                        {[e.time, e.location].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
