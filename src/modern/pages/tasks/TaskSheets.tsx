// Task side sheets (Modern): a read view with status control, and the
// create/edit form with Bruno quick-add. Both are shadcn Sheets (right on
// desktop, bottom on phones). All mutations go through useTasksController.
import { format } from 'date-fns';
import { CalendarDays, CheckCircle2, Circle, CircleDot, Crown, Loader2, Pencil, Sparkles, Trash2, Users, Wand2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Switch, Textarea,
  ToggleGroup, ToggleGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { taskAssigneeIds, type useTasksController } from '../../../components/tasks/useTasksController';
import { AssigneePicker, AvatarStack } from './AssigneePicker';

type Ctl = ReturnType<typeof useTasksController>;

export const STATUS_META: Record<string, { label: string; icon: typeof Circle; dot: string }> = {
  'todo': { label: 'To do', icon: Circle, dot: 'bg-muted-foreground' },
  'in-progress': { label: 'In progress', icon: CircleDot, dot: 'bg-chart-2' },
  'done': { label: 'Done', icon: CheckCircle2, dot: 'bg-success' },
};

export function isOverdue(t: any) {
  if (!t?.due_date || t.status === 'done') return false;
  return String(t.due_date).slice(0, 10) < format(new Date(), 'yyyy-MM-dd');
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
                <p className="text-xs text-muted-foreground">Marking done asks for a short note or photo as proof.</p>
              </div>
              <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
                <dt className="flex items-center gap-2 text-muted-foreground"><Users className="size-4" /> Assignees</dt>
                <dd>{assignees.length ? <span className="flex items-center gap-2"><AvatarStack members={assignees} max={5} /> <span className="truncate">{assignees.map((m) => m.name).join(', ')}</span></span> : <span className="text-muted-foreground">Unassigned</span>}</dd>
                <dt className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" /> Due</dt>
                <dd className={cn(isOverdue(task) && 'text-destructive')}>{task.due_date ? format(new Date(String(task.due_date).slice(0, 10) + 'T12:00:00'), 'EEE, MMM d') : <span className="text-muted-foreground">No due date</span>}</dd>
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
                    placeholder="e.g. Finish robot CAD by Friday, assign to Sushil"
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
                          <span className="block text-xs text-muted-foreground">{p.due_date || 'No due date'}{p.assignee_name ? ` · ${p.assignee_name}` : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="task-title">Title</Label>
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
