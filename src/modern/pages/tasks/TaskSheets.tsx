// Task side sheets (Modern): a read view with status control, and the
// create/edit form with Bruno quick-add. Both are shadcn Sheets (right on
// desktop, bottom on phones). All mutations go through useTasksController.
import { format } from 'date-fns';
import { useState } from 'react';
import { CalendarDays, CheckCircle2, Circle, CircleDot, Crown, Flag, Loader2, Pencil, Repeat, RotateCcw, ShieldCheck, Sparkles, Trash2, Users, Wand2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Switch, Textarea,
  ToggleGroup, ToggleGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, RequiredMark,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { PRIORITY_META, REPEAT_OPTIONS, ruleToRepeat, taskAssigneeIds, type useTasksController } from '../../../components/tasks/useTasksController';
import { readRecurrence, recurrenceLabel } from '../../../utils/quickAdd';
import { dueMoment } from '../../../utils/countdown';
import { Countdown } from '../../ui/Countdown';
import { AssigneePicker, AvatarStack } from './AssigneePicker';
import { isTaskOverdue } from '../../../utils/countdown';

type Ctl = ReturnType<typeof useTasksController>;

export const STATUS_META: Record<string, { label: string; icon: typeof Circle; dot: string }> = {
  'todo': { label: 'To do', icon: Circle, dot: 'bg-muted-foreground' },
  'in-progress': { label: 'In progress', icon: CircleDot, dot: 'bg-chart-2' },
  'done': { label: 'Done', icon: CheckCircle2, dot: 'bg-success' },
};

export function isOverdue(t: any) {
  return isTaskOverdue(t);
}

export const REVIEW_META: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Awaiting review', tone: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  approved: { label: 'Approved', tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  changes_requested: { label: 'Changes requested', tone: 'border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300' },
};

export function PriorityBadge({ value }: { value?: string | null }) {
  const m = value ? PRIORITY_META[value] : null;
  if (!m) return null;
  return <Badge variant="outline" className={cn('gap-1', m.tone)}><Flag className="size-3" />{m.label}</Badge>;
}

export function ReviewBadge({ task }: { task: any }) {
  const m = task.review_status ? REVIEW_META[task.review_status] : null;
  if (!m || (task.review_status !== 'changes_requested' && task.status !== 'done')) return null;
  return <Badge variant="outline" className={m.tone}>{m.label}</Badge>;
}

/** "Oct 15, 4:30 PM", plus a live countdown for open tasks. */
export function DueText({ task, countdown = true }: { task: any; countdown?: boolean }) {
  if (!task.due_date) return <span className="text-muted-foreground">No due date</span>;
  const at = dueMoment(task.due_date, task.due_time);
  const label = format(new Date(String(task.due_date).slice(0, 10) + 'T12:00:00'), 'EEE, MMM d') + (task.due_time && at ? `, ${format(at, 'h:mm a')}` : '');
  return (
    <span className={cn(isOverdue(task) && 'text-destructive')}>
      {label}
      {countdown && at && task.status !== 'done' && <> · <Countdown to={at} className="text-xs" /></>}
    </span>
  );
}

/** Approve a finished task, or send it back with a note (managers). */
function ReviewPanel({ task, ctl }: { task: any; ctl: Ctl }) {
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'idle' | 'back'>('idle');
  const [busy, setBusy] = useState(false);
  const run = async (action: 'approve' | 'send_back') => {
    if (busy) return;
    setBusy(true);
    try { if (await ctl.reviewTask(task.id, action, action === 'send_back' ? note : '')) { setNote(''); setMode('idle'); } }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-accent" /> Review</p>
      {task.review_status === 'approved'
        ? <p className="text-sm text-muted-foreground">Approved. You can still send it back if something's off.</p>
        : <p className="text-sm text-muted-foreground">Done isn't accepted yet. Check the proof, then approve it or send it back to the assignees.</p>}
      {mode === 'back' ? (
        <div className="space-y-2">
          <Label htmlFor="review-note">What needs to change? <RequiredMark /></Label>
          <Textarea id="review-note" required value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The bracket still flexes; add a gusset and retest." className="min-h-20" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode('idle')}>Cancel</Button>
            <Button type="button" disabled={busy || !note.trim()} onClick={() => void run('send_back')}>{busy && <Loader2 className="animate-spin" />}<RotateCcw /> Send back</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {task.review_status !== 'approved' && <Button type="button" disabled={busy} onClick={() => void run('approve')}><CheckCircle2 /> Approve</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => setMode('back')}><RotateCcw /> Send back for changes</Button>
        </div>
      )}
    </div>
  );
}

function useSheetSide() {
  return useIsNarrow() ? 'bottom' : 'right';
}

/** Read view of one task. Anyone can move its status; managers can edit/delete. */
export function TaskViewSheet({ task, onOpenChange, ctl, members, teams }: {
  task: any | null;
  onOpenChange: (open: boolean) => void;
  ctl: Ctl;
  members: any[];
  teams: any[];
}) {
  const side = useSheetSide();
  const assignees = task ? members.filter((m) => taskAssigneeIds(task).includes(m.id)) : [];
  const team = task ? teams.find((t) => String(t.id) === String(task.team_id)) : null;
  return (
    <Sheet open={!!task} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn('gap-0 p-0', side === 'right' ? 'sm:max-w-lg' : '')}>
        {task && (
          <>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                {task.is_board ? <Badge variant="soft"><Crown /> Board</Badge> : null}
                {isOverdue(task) && <Badge variant="destructive">Overdue</Badge>}
                <PriorityBadge value={task.priority} />
                <ReviewBadge task={task} />
                {readRecurrence(task.recurrence) && <Badge variant="outline" className="gap-1"><Repeat className="size-3" />{recurrenceLabel(readRecurrence(task.recurrence))}</Badge>}
              </div>
              <SheetTitle className="text-xl leading-snug">{task.title}</SheetTitle>
              <SheetDescription>{team ? team.name : 'Task'}{task.created_at ? ` · created ${format(new Date(task.created_at), 'MMM d')}` : ''}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="space-y-2">
                <Label>Status</Label>
                <ToggleGroup
                  type="single"
                  value={task.status}
                  onValueChange={(v) => { if (v && v !== task.status) void ctl.updateStatus(task.id, v); }}
                  aria-label="Task status"
                  className="w-full"
                >
                  {(['todo', 'in-progress', 'done'] as const).map((s) => {
                    const M = STATUS_META[s];
                    return <ToggleGroupItem key={s} value={s} className="flex-1" disabled={ctl.pendingIds.has(task.id)}><M.icon /> {M.label}</ToggleGroupItem>;
                  })}
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">Marking done asks for a short note or photo as proof.{readRecurrence(task.recurrence) ? ' This task repeats: finishing it schedules the next one.' : ''}</p>
              </div>
              {task.review_status === 'changes_requested' && task.review_note && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
                  <p className="font-medium">Sent back for changes</p>
                  <p className="mt-1 whitespace-pre-wrap text-foreground/90">{task.review_note}</p>
                </div>
              )}
              {ctl.canManageTasks && task.status === 'done' && <ReviewPanel task={task} ctl={ctl} />}
              <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
                <dt className="flex items-center gap-2 text-muted-foreground"><Users className="size-4" /> Assignees</dt>
                <dd>{assignees.length ? <span className="flex items-center gap-2"><AvatarStack members={assignees} max={5} /> <span className="truncate">{assignees.map((m) => m.name).join(', ')}</span></span> : <span className="text-muted-foreground">Unassigned</span>}</dd>
                <dt className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" /> Due</dt>
                <dd><DueText task={task} /></dd>
                {task.completed_at && (<>
                  <dt className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="size-4" /> Completed</dt>
                  <dd>{format(new Date(task.completed_at), 'MMM d, h:mm a')}</dd>
                </>)}
              </dl>
              <Separator />
              <div>
                <Label className="mb-2 block">Description</Label>
                {task.description
                  ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{task.description}</p>
                  : <p className="text-sm text-muted-foreground">No description.</p>}
              </div>
            </div>
            {ctl.canManageTasks && (
              <div className="flex items-center gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button variant="outline" onClick={() => { onOpenChange(false); ctl.openEditTask(task); }}><Pencil /> Edit</Button>
                <Button
                  variant="ghost"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={async () => { if (await ctl.handleDeleteTask(task.id)) onOpenChange(false); }}
                >
                  <Trash2 /> Delete
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Create / edit form. Open state + values live in the draft store (ctl). */
export function TaskEditorSheet({ ctl, members, teams }: { ctl: Ctl; members: any[]; teams: any[] }) {
  const side = useSheetSide();
  const f = ctl.newTask;
  const set = (patch: Partial<typeof f>) => ctl.setNewTask({ ...f, ...patch });
  const editing = !!ctl.editingTaskId;
  const saving = ctl.pendingIds.has(-1);
  return (
    <Sheet open={ctl.showAddTask} onOpenChange={(o) => { if (!o) ctl.closeTaskModal(); }}>
      <SheetContent side={side} className={cn('gap-0 p-0', side === 'right' ? 'sm:max-w-lg' : '')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{editing ? 'Edit task' : 'New task'}</SheetTitle>
          <SheetDescription>{editing ? 'Changes save for everyone on the team.' : 'Describe it to Bruno, or fill in the details.'}</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) void ctl.handleAddTask(); }}
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {!editing && (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <Label htmlFor="task-ai" className="mb-2 flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent" /> Quick add with Bruno</Label>
                <div className="flex gap-2">
                  <Input
                    id="task-ai"
                    value={ctl.aiTaskText}
                    onChange={(e) => ctl.setAiTaskText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void ctl.handleAiTaskParse(); } }}
                    placeholder="e.g. Test auto paths, high priority, assign to Arnav, due Thursday 4:30pm"
                  />
                  <Button type="button" variant="outline" disabled={!ctl.aiTaskText.trim() || ctl.aiTaskBusy} onClick={() => void ctl.handleAiTaskParse()}>
                    {ctl.aiTaskBusy ? <Loader2 className="animate-spin" /> : <Wand2 />} Fill
                  </Button>
                </div>
                {ctl.aiTaskNote && <p className="mt-2 text-xs text-muted-foreground" role="status">{ctl.aiTaskNote}</p>}
                {ctl.aiTaskProposals.length > 1 && (
                  <ul className="mt-2 space-y-1">
                    {ctl.aiTaskProposals.map((p: any, i: number) => (
                      <li key={i}>
                        <button type="button" onClick={() => { ctl.applyAiTaskToForm(p); ctl.setAiTaskProposals([]); ctl.setAiTaskNote('Bruno filled in the form — review it and save.'); }}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted">
                          <span className="font-medium">{p.title}</span>
                          <span className="block text-xs text-muted-foreground">{p.due_date || 'No due date'}{p.due_time ? ` ${p.due_time}` : ''}{p.assignee_name ? ` · ${p.assignee_name}` : ''}{p.priority ? ` · ${PRIORITY_META[p.priority]?.label ?? p.priority} priority` : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="task-title">Title <RequiredMark /></Label>
              <Input id="task-title" required autoFocus={editing} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="What needs doing?" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea id="task-desc" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="Details, links, acceptance criteria…" className="min-h-28" />
            </div>
            {!editing && teams.length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="task-team">Team</Label>
                <Select value={String(f.team_id || '')} onValueChange={(v) => set({ team_id: v })}>
                  <SelectTrigger id="task-team"><SelectValue placeholder="Select a team" /></SelectTrigger>
                  <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.number ? ` #${t.number}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="task-assignees">Assignees</Label>
              <AssigneePicker id="task-assignees" members={members} selected={f.assignee_ids} onChange={(ids) => set({ assignee_ids: ids })} />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="grid gap-2">
                <Label htmlFor="task-due">Due date</Label>
                <Input id="task-due" type="date" value={f.due_date ? String(f.due_date).slice(0, 10) : ''} onChange={(e) => set({ due_date: e.target.value, ...(e.target.value ? {} : { due_time: '' }) })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-due-time">Time <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="task-due-time" type="time" disabled={!f.due_date} value={f.due_time || ''} onChange={(e) => set({ due_time: e.target.value })} className="w-32" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={f.priority || 'none'} onValueChange={(v) => set({ priority: v === 'none' ? '' : v })}>
                  <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No priority</SelectItem>
                    {(['urgent', 'high', 'medium', 'low'] as const).map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-repeat">Repeat</Label>
                <Select value={f.repeat || 'none'} onValueChange={(v) => set({ repeat: v === 'none' ? '' : v })}>
                  <SelectTrigger id="task-repeat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPEAT_OPTIONS.map((o) => <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>)}
                    {f.repeatRule && ruleToRepeat(f.repeatRule) === 'custom' && <SelectItem value="custom">{recurrenceLabel(f.repeatRule)}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {f.repeat && !f.due_date && <p className="-mt-2 text-xs text-muted-foreground">Repeats start from the day it's finished. Add a due date to set the rhythm.</p>}
            {ctl.isAdmin && (
              <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
                <span>
                  <span className="block text-sm font-medium">Board task</span>
                  <span className="block text-xs text-muted-foreground">Only admins see board tasks.</span>
                </span>
                <Switch checked={ctl.isBoardTask} onCheckedChange={ctl.setIsBoardTask} aria-label="Board task" />
              </label>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={ctl.closeTaskModal}>Cancel</Button>
            <Button type="submit" disabled={saving || !f.title.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Save changes' : 'Create task'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
