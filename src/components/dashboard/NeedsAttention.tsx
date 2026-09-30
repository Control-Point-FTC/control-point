import { AlertTriangle, Package, CalendarX, Clock, ArrowRight, Check } from 'lucide-react';
import { Card, Button } from '../ui';

interface NeedsAttentionProps {
  overdueTasks: any[];
  lowStock: any[];
  missingCheckin: any[];
  deadlinesSoon: any[];
  attentionCount: number;
  onMarkTaskDone: (task: any) => void;
  onNavigate: (path: string) => void;
}

/**
 * Everything that needs a human decision right now: overdue tasks,
 * low-stock parts, missing check-ins, and deadlines coming up.
 * Every item carries its own action — no dead ends.
 */
export default function NeedsAttention({
  overdueTasks,
  lowStock,
  missingCheckin,
  deadlinesSoon,
  attentionCount,
  onMarkTaskDone,
  onNavigate,
}: NeedsAttentionProps) {
  return (
    <Card
      title="Needs attention"
      subtitle={attentionCount === 0 ? "Nothing needs you right now" : `${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} a decision`}
      icon={AlertTriangle}
      className="xl:col-span-7 scroll-mt-24"
    >
      <div id="needs-attention" className="scroll-mt-24 -mt-4 pt-4">
        {attentionCount === 0 && (
          <p className="text-sm text-text-muted py-6 text-center">
            All clear — no overdue tasks, no low stock, everyone checked in.
          </p>
        )}

        {overdueTasks.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-rose-400 mb-2">
              Overdue tasks ({overdueTasks.length})
            </p>
            <div className="space-y-2">
              {overdueTasks.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                    <p className="text-[11px] text-rose-300/80">Due {t.due_date}</p>
                  </div>
                  <Button variant="ghost" className="!px-2.5 !py-1.5 text-xs" onClick={() => onMarkTaskDone(t)}>
                    <Check className="w-3.5 h-3.5" /> Done
                  </Button>
                  <button
                    onClick={() => onNavigate('/tasks')}
                    className="text-[11px] font-bold text-text-muted hover:text-white px-2 py-1.5"
                  >
                    Review
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {lowStock.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400 mb-2">
              Low stock ({lowStock.length})
            </p>
            <div className="space-y-2">
              {lowStock.map((item: any) => (
                <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                  <Package className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                    <p className="text-[11px] text-amber-300/80">
                      {item.quantity ?? 0} left{item.reorder_point ? ` · reorder at ${item.reorder_point}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigate('/inventory')}
                    className="text-[11px] font-bold text-text-muted hover:text-white px-2 py-1.5 flex items-center gap-1"
                  >
                    Restock <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {missingCheckin.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-400 mb-2">
              Missing check-ins ({missingCheckin.length})
            </p>
            <div className="space-y-2">
              {missingCheckin.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/25">
                  <CalendarX className="w-4 h-4 text-sky-400 shrink-0" />
                  <p className="text-sm font-semibold text-white truncate flex-1">{m.name}</p>
                  <button
                    onClick={() => onNavigate('/attendance')}
                    className="text-[11px] font-bold text-text-muted hover:text-white px-2 py-1.5 flex items-center gap-1"
                  >
                    View <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {deadlinesSoon.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-2">
              Due in the next 3 days ({deadlinesSoon.length})
            </p>
            <div className="space-y-2">
              {deadlinesSoon.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => onNavigate('/tasks')}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/25 transition-all text-left"
                >
                  <Clock className="w-4 h-4 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                    <p className="text-[11px] text-text-muted">Due {t.due_date}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
