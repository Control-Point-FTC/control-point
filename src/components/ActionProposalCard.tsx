import { ArrowRight, Calendar, CalendarCheck, CalendarX, Megaphone, ListTodo, ListChecks, Wallet, Mail, Check, X, Loader2, SlidersHorizontal, MessageSquare } from 'lucide-react';
import { TEAM_MODULES } from '../types/teamModules';
import { awardById } from '../types/taskTags';
import { strictWipLimits } from '../types/taskStatus';
import { cleanEventType, EVENT_TYPE_LABELS } from '../types/eventTypes';
import { RSVP_STATUS_LABELS } from '../types/eventRsvp';
import { Link } from 'react-router-dom';
import type { ResultLink } from './bruno/resultLinks';
import type { ActionProposal } from '../services/aiService';
import { recurrenceLabel } from '../utils/quickAdd';
import { getProposalContext, getTaskIndex, resolveEventItem, resolveTaskItem, resolveTaskUpdate, useProposalContext, useTaskIndex } from '../services/proposalContext';

/** "subsystems Arm, Intake · Think evidence · labels TeleOp" (empty parts skipped). */
function tagParts(t: { start_date?: string | null; subsystems?: string[]; awards?: string[]; labels?: string[] }, clearing = false): string[] {
  const list = (name: string, v: string[] | undefined) => (v === undefined ? '' : v.length ? `${name} ${v.join(', ')}` : clearing ? `no ${name}` : '');
  return [
    t.start_date !== undefined && (t.start_date || clearing) ? (t.start_date ? `starts ${t.start_date}` : 'no start date') : '',
    list('subsystems', t.subsystems),
    t.awards === undefined ? '' : t.awards.length ? `${t.awards.map((a) => awardById(a)?.name ?? a).join(', ')} evidence` : clearing ? 'no award tags' : '',
    list('labels', t.labels),
  ];
}

/** A task exactly as it will be saved: title, due date and time, priority, people, repeat. */
function taskSummary(it: any): string {
  const t = resolveTaskItem(it);
  const parts = [
    t.due_date ? `due ${t.due_date}${t.due_time ? ` at ${t.due_time}` : ''}` : t.due_time ? `due today at ${t.due_time}` : '',
    t.priority ? `${t.priority} priority` : '',
    t.assignees.length || t.roles.length ? `→ ${[...t.assignees, ...t.roles.map((r) => { const who = t.roleMembers[r]; return `everyone in ${r}${!who ? '' : who.length ? ` (${who.join(', ')})` : ' (no one has this role yet)'}`; })].join(', ')}` : '',
    t.unmatchedRoles.length ? `no single role named ${t.unmatchedRoles.join(', ')}` : '',
    t.repeat ? recurrenceLabel(t.repeat).toLowerCase() : '',
    ...tagParts(t),
    t.completion_mode === 'each' ? 'everyone assigned completes it separately' : '',
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
    c.status ? (c.status === 'todo' ? 'back to To do' : c.status === 'cancelled' ? 'cancel it (kept, can be restored)' : 'In progress') : '',
    c.assignees !== undefined || c.roles ? (c.assignees?.length || c.roles ? `→ ${[...(c.assignees ?? []), ...(c.roles ?? []).map((r) => {
      const who = getProposalContext()?.roles?.find((x) => x.name === r)?.members;
      return `everyone in ${r}${!who ? '' : who.length ? ` (${who.join(', ')})` : ' (no one has this role yet)'}`;
    })].join(', ')}` : 'unassign everyone') : '',
    u.unmatchedRoles.length ? `no single role named ${u.unmatchedRoles.join(', ')}` : '',
    c.recurrence !== undefined ? (c.recurrence ? recurrenceLabel(c.recurrence).toLowerCase() : 'stop repeating') : '',
    ...tagParts(c, true),
    c.completion_mode !== undefined ? (c.completion_mode === 'each' ? 'everyone assigned completes it separately' : 'one shared deliverable') : '',
    ...(['blocked_by', 'blocks', 'related'] as const).map((k) => {
      const ids = c[k];
      if (!ids) return '';
      const name = k === 'blocked_by' ? 'blocked by' : k === 'blocks' ? 'blocks' : 'related to';
      return ids.length ? `${name} ${ids.map((i) => `#${i}`).join(', ')}` : `not ${name} anything`;
    }),
    u.unmatched.length ? `no single team member named ${u.unmatched.join(', ')}` : '',
    u.refused.includes('status') ? 'mark it done from Tasks (it needs proof)' : '',
  ].filter(Boolean);
  const name = current?.title || `Task #${u.id}`;
  return `${name.slice(0, 60)}${parts.length ? ` — ${parts.join(' · ')}` : ''}`;
}

/** The card's verb: all edits say Update, a mix of new and edited says Save. */
export function proposalVerb(proposals: ActionProposal[]): { ask: string; done: string; busy: string } {
  if (proposals.some((p) => KIND_META[p.kind]?.destructive)) return { ask: 'Delete', done: 'Deleted', busy: 'Deleting…' };
  const edits = proposals.filter((p) => p.kind === 'task-update' || p.kind === 'workspace').length;
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
  workspace: { label: 'Workspace settings', icon: SlidersHorizontal },
  'task-comment': { label: 'Task comments', icon: MessageSquare },
  'event-rsvp': { label: 'RSVP', icon: CalendarCheck },
};

/** "Turn off Code · Turn on Predict · Subsystems: Drivetrain, Lift" */
export function workspaceSummary(it: any): string {
  const label = (id: unknown) => TEAM_MODULES.find((m) => m.id === id)?.label;
  const names = (v: unknown) => (Array.isArray(v) ? v.map(label).filter(Boolean) : []) as string[];
  const parts: string[] = [];
  const on = names(it?.enable);
  const off = names(it?.disable).filter((n) => !on.includes(n));
  if (off.length) parts.push(`Turn off ${off.join(', ')} (data is kept)`);
  if (on.length) parts.push(`Turn on ${on.join(', ')}`);
  if (Array.isArray(it?.subsystems)) parts.push(`Subsystems: ${it.subsystems.filter((n: unknown) => typeof n === 'string').join(', ').slice(0, 120)}`);
  if (it?.wip_limits !== undefined) {
    const w = strictWipLimits(it.wip_limits);
    const bits = w ? [w.todo ? `To do ${w.todo}` : '', w['in-progress'] ? `In progress ${w['in-progress']}` : ''].filter(Boolean) : [];
    parts.push(!w ? 'Board limits: not valid (whole numbers 1–99), nothing will change' : bits.length ? `Board limits: ${bits.join(', ')}` : 'Remove board limits');
  }
  return parts.join(' · ') || 'No change';
}

export function itemSummary(kind: ActionProposal['kind'], raw: any): string {
  const it = kind === 'event' ? resolveEventItem(raw) : raw;
  const title = String(it.title || it.description || it.category || 'Untitled').slice(0, 60);
  if (kind === 'event') {
    // Show an end only if the server will keep it (valid HH:MM after the start).
    const end = typeof it.end === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(it.end) && it.time && it.end > it.time ? it.end : '';
    const when = it.time ? `${it.date} at ${it.time}${end ? `–${end}` : ''}` : it.date ? `${it.date} (all day)` : '';
    const type = cleanEventType(it.type ?? it.event_type);
    const where = typeof it.location === 'string' && it.location.trim() ? ` @ ${it.location.trim().slice(0, 60)}` : '';
    // The agenda itself, so it can be checked before it's saved.
    const items = typeof it.agenda === 'string' ? it.agenda.split('\n').map((l: string) => l.trim()).filter(Boolean) : [];
    const agendaText = items.join('; ');
    const agenda = items.length ? ` · Agenda: ${agendaText.length > 160 ? `${agendaText.slice(0, 159)}…` : agendaText}` : '';
    return `${title}${when ? ` — ${when}` : ''}${where}${type && type !== 'meeting' ? ` · ${EVENT_TYPE_LABELS[type]}` : ''}${agenda}`;
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
  if (kind === 'workspace') return workspaceSummary(it);
  if (kind === 'event-rsvp') {
    const s = typeof it.status === 'string' ? (RSVP_STATUS_LABELS as Record<string, string>)[it.status] : '';
    const name = typeof it.title === 'string' && it.title.trim() ? it.title.trim().slice(0, 60) : `Event #${String(it.id ?? '').replace(/^#/, '')}`;
    const reason = typeof it.reason === 'string' && it.reason.trim() ? ` · ${it.reason.trim().slice(0, 80)}` : '';
    return `${name} — ${s || 'Take back my answer'}${reason}`;
  }
  if (kind === 'task-comment') {
    const id = Number(String(it?.id ?? '').replace(/^#/, ''));
    const name = getTaskIndex()?.get(id)?.title || `Task #${id}`;
    const body = String(it?.body || '').trim();
    return `${name.slice(0, 60)} — “${body.length > 160 ? `${body.slice(0, 160)}…` : body}”`;
  }
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
  useTaskIndex(status !== 'done' && status !== 'dismissed' && proposals.some((p) => p.kind === 'task-update' || p.kind === 'task-comment'));
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
