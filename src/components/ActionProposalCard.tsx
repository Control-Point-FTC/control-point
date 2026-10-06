import { Calendar, CalendarX, Megaphone, ListTodo, Wallet, Mail, Check, X, Loader2 } from 'lucide-react';
import type { ActionProposal } from '../services/aiService';

export const KIND_META: Record<ActionProposal['kind'], { label: string; icon: any; destructive?: boolean }> = {
  event: { label: 'Calendar', icon: Calendar },
  'delete-event': { label: 'Delete from Calendar', icon: CalendarX, destructive: true },
  outreach: { label: 'Outreach log', icon: Megaphone },
  task: { label: 'Tasks', icon: ListTodo },
  budget: { label: 'Budget', icon: Wallet },
  communication: { label: 'Communication log', icon: Mail },
};

export function itemSummary(kind: ActionProposal['kind'], it: any): string {
  const title = String(it.title || it.description || it.category || 'Untitled').slice(0, 60);
  if (kind === 'event') {
    const when = it.time ? `${it.date} at ${it.time}` : it.date || '';
    return `${title}${when ? ` — ${when}` : ''}`;
  }
  if (kind === 'delete-event') {
    return `${title}${it.date ? ` — ${it.date}` : ''}`;
  }
  if (kind === 'outreach') return `${title}${it.date ? ` — ${it.date}` : ''}`;
  if (kind === 'communication') {
    const subj = String(it.subject || 'No subject').slice(0, 60);
    const to = String(it.recipient || '').slice(0, 40);
    return `${subj}${to ? ` → ${to}` : ''}${it.date ? ` — ${it.date}` : ''}`;
  }
  if (kind === 'task') return `${title}${it.due_date ? ` — due ${it.due_date}` : ''}`;
  const amt = !isNaN(parseFloat(it.amount)) ? `$${parseFloat(it.amount).toFixed(2)}` : '';
  const dir = it.type === 'income' ? 'in' : 'out';
  return `${title} — ${amt} ${dir}${it.date ? ` — ${it.date}` : ''}`;
}

export type ProposalStatus = 'pending' | 'confirming' | 'done' | 'dismissed' | 'error';

export default function ActionProposalCard({ proposals, status, error, onConfirm, onDismiss }: {
  proposals: ActionProposal[];
  status: ProposalStatus;
  error?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const total = proposals.reduce((n, p) => n + p.items.length, 0);
  const isDestructive = proposals.some((p) => KIND_META[p.kind]?.destructive);
  if (status === 'done') {
    return (
      <div className="mt-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2.5 flex items-center gap-2">
        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-[13px] text-emerald-200 font-medium">
          {isDestructive ? `Deleted ${total} ${total === 1 ? 'item' : 'items'}` : `Added ${total} ${total === 1 ? 'item' : 'items'}`} ✓
        </p>
      </div>
    );
  }
  const frameCls = isDestructive
    ? "mt-2 rounded-xl border border-red-400/30 bg-red-400/[0.06] overflow-hidden"
    : "mt-2 rounded-xl border border-accent/30 bg-accent/[0.06] overflow-hidden";
  return (
    <div className={frameCls}>
      <div className="px-3.5 pt-3 pb-1 flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-text-base">
          {isDestructive ? `Delete ${total} ${total === 1 ? 'item' : 'items'}?` : `Add ${total} ${total === 1 ? 'item' : 'items'}?`}
        </p>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="p-1 text-text-muted hover:text-text-base transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-3.5 pb-2 space-y-2.5 max-h-56 overflow-y-auto custom-scrollbar">
        {proposals.map((p) => {
          const meta = KIND_META[p.kind];
          const Icon = meta.icon;
          return (
            <div key={p.kind}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-accent/90 flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" />
                {meta.label} · {p.items.length}
              </p>
              <ul className="space-y-1">
                {p.items.map((it, i) => (
                  <li key={i} className="text-[13px] text-text-base/80 leading-snug flex gap-2">
                    <span className="text-accent mt-0.5 shrink-0">•</span>
                    <span className="min-w-0">{itemSummary(p.kind, it)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {status === 'error' && error && (
        <p className="px-3.5 pb-1 text-[12px] text-red-300">{error}</p>
      )}
      <div className="px-3.5 pb-3 pt-1">
        <button
          onClick={onConfirm}
          disabled={status === 'confirming'}
          className={isDestructive
            ? "w-full rounded-xl bg-red-500 text-text-base font-bold text-[13px] py-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
            : "w-full rounded-xl bg-accent text-accent-ink font-bold text-[13px] py-2 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"}
        >
          {status === 'confirming' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isDestructive ? 'Deleting…' : 'Adding…'}
            </>
          ) : (
            <>{isDestructive ? `Delete all ${total}` : `Add all ${total}`}</>
          )}
        </button>
      </div>
    </div>
  );
}
