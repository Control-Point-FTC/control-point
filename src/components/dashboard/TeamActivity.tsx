import { Activity, CheckSquare, UserPlus, Calendar, Package } from 'lucide-react';
import { Card } from '../ui';

const icons: Record<string, any> = {
  task: CheckSquare,
  member: UserPlus,
  event: Calendar,
  inventory: Package,
};

interface TeamActivityProps {
  items: any[];
}

/** The team's pulse: what actually happened in the last 7 days. */
export default function TeamActivity({ items }: TeamActivityProps) {
  return (
    <Card
      title="Recent team activity"
      subtitle={items.length === 0 ? 'Quiet week so far' : 'The last 7 days'}
      icon={Activity}
      className="xl:col-span-7"
    >
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">
          Nothing logged in the last 7 days. Once tasks move and parts arrive, they'll show up here.
        </p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {items.map((a: any, i: number) => {
            const Icon = icons[a.kind] || Activity;
            return (
              <div
                key={`${a.kind}-${i}`}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    <span className="font-semibold">{a.title}</span>
                    {a.detail && <span className="text-text-muted"> · {a.detail}</span>}
                  </p>
                </div>
                <span className="text-[11px] text-text-muted shrink-0">{a.when}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
