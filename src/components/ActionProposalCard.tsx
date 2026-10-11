import { ArrowRight, Calendar, CalendarX, Megaphone, ListTodo, ListChecks, Wallet, Mail, Check, X, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResultLink } from './bruno/resultLinks';
import type { ActionProposal } from '../services/aiService';
import { recurrenceLabel } from '../utils/quickAdd';
import { getTaskIndex, resolveEventItem, resolveTaskItem, resolveTaskUpdate, useProposalContext, useTaskIndex } from '../services/proposalContext';

/** A task exactly as it will be saved: title, due date and time, priority, people, repeat. */
function taskSummary(it: any): string {
  const t = resolveTaskItem(it);
  const parts = [
    t.due_date ? `due ${t.due_date}${t.due_time ? ` at ${t.due_time}` : ''}` : t.due_time ? `due today at ${t.due_time}` : '',
    t.priority ? `${t.priority} priority` : '',
    t.assignees.length ? `→ ${t.assignees.join(', ')}` : '',
    t.repeat ? recurrenceLabel(t.repeat).toLowerCase() : '',
    t.unmatched.length ? `not assigned (no single team member named ${t.unmatched.join(', ')})` : '',
  ].filter(Boolean);
  return `${t.title.slice(0, 60)}${parts.length ? ` — ${parts.join(' · ')}` : ''}`;
}

/** An edit to an existing task: its real current title, then only what changes. */
function taskUpdateSummary(it: any): string {
  const u = resolveTaskUpdate(it);
  if (!u) return 'Nothing to change';
  const idx = getTaskIndex();
  const current = idx?.get(u.id);
  if (idx && !current) return `Task #${u.id} — not found (it may have been deleted)`;
  const c = u.changes;
  const parts = [
    c.title !== undefined ? `rename to “${c.title.slice(0, 60)}”` : '',
    c.description !== undefined ? (c.description ? `description becomes “${c.description.length > 400 ? `${c.description.slice(0, 400)}…` : c.description}”` : 'clear the description') : '',
    c.due_date !== undefined ? (c.due_date ? `due ${c.due_date}${c.due_time ? ` at ${c.due_time}` : ''}` : 'no due date') : c.due_time !== undefined ? (c.due_time ? `at ${c.due_time}` : 'no due time') : '',
    c.priority !== undefined ? (c.priority ? `${c.priority} priority` : 'no priority') : '',
    c.status ? (c.status === 'todo' ? 'back to To do' : 'In progress') : '',
    c.assignees !== undefined ? (c.assignees.length ? `→ ${c.assignees.join(', ')}` : 'unassign everyone') : '',
    c.recurrence !== undefined ? (c.recurrence ? recurrenceLabel(c.recurrence).toLowerCase() : 'stop repeating') : '',
    u.unmatched.length ? `no single team member named ${u.unmatched.join(', ')}` : '',
    u.refused.includes('status') ? 'mark it done from Tasks (it needs proof)' : '',
  ].filter(Boolean);
  const name = current?.title || `Task #${u.id}`;
  return `${name.slice(0, 60)}${parts.length ? ` — ${parts.join(' · ')}` : ''}`;
}

/** The card's verb: all edits say Update, a mix of new and edited says Save. */
export function proposalVerb(proposals: ActionProposal[]): { ask: string; done: string; busy: string } {
  if (proposals.some((p) => KIND_META[p.kind]?.destructive)) return { ask: 'Delete', done: 'Deleted', busy: 'Deleting…' };
  const edits = proposals.filter((p) => p.kind === 'task-update').length;
  if (edits && edits === proposals.length) return { ask: 'Update', done: 'Updated', busy: 'Updating…' };
  if (edits) return { ask: 'Save', done: 'Saved', busy: 'Saving…' };
  return { ask: 'Add', done: 'Added', busy: 'Adding…' };
}

export const KIND_META: Record<ActionProposal['kind'], { label: string; icon: any; destructive?: boolean }> = {
  event: { label: 'Calendar', icon: Calendar },
  'delete-event': { label: 'Delete from Calendar', icon: CalendarX, destructive: true },
  outreach: { label: 'Outreach log', icon: Megaphone },
  task: { label: 'Tasks', icon: ListTodo },
  'task-update': { label: 'Task changes', icon: ListChecks },
  budget: { label: 'Budget', icon: Wallet },
  communication: { label: 'Communication log', icon: Mail },
};

export function itemSummary(kind: ActionProposal['kind'], raw: any): string {
  const it = kind === 'event' ? resolveEventItem(raw) : raw;
  const title = String(it.title || it.description || it.category || 'Untitled').slice(0, 60);
  if (kind === 'event') {
    // Show an end only if the server will keep it (valid HH:MM after the start).
    const end = typeof it.end === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(it.end) && it.time && it.end > it.time ? it.end : '';
    const when = it.time ? `${it.date} at ${it.time}${end ? `–${end}` : ''}` : it.date ? `${it.date} (all day)` : '';
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
  if (kind === 'task') return taskSummary(it);
  if (kind === 'task-update') return taskUpdateSummary(it);
  const amt = !isNaN(parseFloat(it.amount)) ? `$${parseFloat(it.amount).toFixed(2)}` : '';
  const dir = it.type === 'income' ? 'in' : 'out';
  return `${title} — ${amt} ${dir}${it.date ? ` — ${it.date}` : ''}`;
}

export type ProposalStatus = 'pending' | 'confirming' | 'done' | 'dismissed' | 'error';

export default function ActionProposalCard({ proposals, status, error, onConfirm, onDismiss, links = [] }: {
  proposals: ActionProposal[];
  /** After applying: where to see the changes ("View task"). */
  links?: ResultLink[];
  status: ProposalStatus;
  error?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useProposalContext(); // re-render once the team's roster and today load
  useTaskIndex(proposals.some((p) => p.kind === 'task-update'));
  const total = proposals.reduce((n, p) => n + p.items.length, 0);
  const isDestructive = proposals.some((p) => KIND_META[p.kind]?.destructive);
  const verb = proposalVerb(proposals);
  const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  if (status === 'done') {
    return (
      <div className="mt-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-[13px] text-emerald-200 font-medium">
            {verb.done} {items(total)} ✓
          </p>
        </div>
        {links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => <Link key={l.to} to={l.to} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 px-2.5 py-1 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-400/15">{l.label}<ArrowRight className="w-3.5 h-3.5" /></Link>)}
          </div>
        )}
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
          {verb.ask} {items(total)}?
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
              {verb.busy}
            </>
          ) : (
            <>{verb.ask} all {total}</>
          )}
        </button>
      </div>
    </div>
  );
}
