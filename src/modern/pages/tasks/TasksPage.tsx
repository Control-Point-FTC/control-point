// Modern Tasks (phase 4). Rebuilt on the shadcn kit over the shared
// useTasksController (same endpoints, permissions and optimistic updates as
// Legacy). Views: Board (drag between lanes, or use the task sheet), List,
// Insights. Filters: search, assignee (Mine / person), team.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ArrowRight, CalendarDays, ChevronDown, Copy, Crown, Eye, KanbanSquare, LineChart as LineChartIcon, List, ListChecks, Pencil, Plus, Search, Sparkles, Trash2,
  UserPlus, CheckCheck, CheckCircle2, Repeat, Camera, Ban, GanttChart, UserCheck,
} from 'lucide-react';
import { isOpenStatus } from '../../../types/taskStatus';
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection, type Selection } from '../../ui/selection';
import { useContextMenu } from '../../../components/contextmenu/ContextMenuProvider';
import { LoadMore, Spacer, useIncrementalGroups, useVirtualRows } from '../../ui/windowing';
import { notify } from '../../../components/dialog';
import { cn } from '../../../components/cn';
import {
  Badge, Button, ChartContainer, ChartTooltip, ChartTooltipContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useTasksController, taskAssigneeIds, TASK_COLUMNS, CANCELLED_COLUMN, completionTrendsOf, memberCapacityOf, avgCompletionDaysOf } from '../../../components/tasks/useTasksController';
import { Page, PageHeader, EmptyState, Section } from '../../ui/page';
import { AnimatedValue } from '../../AnimatedValue';
import { AvatarStack } from './AssigneePicker';
import { TaskEditorSheet, TaskViewSheet, STATUS_META, isOverdue, PriorityBadge, ReviewBadge } from './TaskSheets';
import { TaskTagChips } from './TaskTags';
import { TaskLinkMarks } from './TaskLinks';
import { TaskGantt } from './TaskGantt';
import { useJustCompleted } from './useJustCompleted';
import { onTimeStats, onTimePercent, localDateIn, ON_TIME_WINDOW_DAYS } from '../../../utils/taskInsights';
import { WipLimit } from './TaskWip';
import { cleanWipLimits } from '../../../types/taskStatus';
import { GroupBySelect, TaskFiltersButton } from './TaskFilterBar';
import { groupTasks, matchesFilters, readFilters, readGroup, writeFilters, type Group, type GroupBy, type TaskFilters } from './taskFilters';
import { parseSubsystems } from '../../../types/teamModules';
import { parseTagList } from '../../../types/taskTags';
import { readRecurrence, recurrenceLabel } from '../../../utils/quickAdd';
import { dueMoment } from '../../../utils/countdown';
import { taskCompletions } from '../../../utils/taskCompletions';

/** Proof photos across every completion of a task. */
const photoCount = (t: any) => taskCompletions(t).reduce((n, e) => n + e.images.length, 0);
import { Countdown } from '../../ui/Countdown';
import { BulkImportDialog } from './TaskDialogs';

type View = 'board' | 'list' | 'timeline' | 'completed' | 'insights';
type ReviewFilter = 'all' | 'pending' | 'approved';

const NO_TASKS: any[] = [];
const LIST_RANK: Record<string, number> = { 'in-progress': 0, 'todo': 1, 'done': 2, 'cancelled': 3 };
type BoardColumn = { id: string; label: string };
/** The list view's order: in progress, then to do, then done, then cancelled; soonest due first. */
function listOrder(tasks: any[]) {
  return [...tasks].sort((a, b) => (LIST_RANK[a.status] - LIST_RANK[b.status]) || String(a.due_date || '9').localeCompare(String(b.due_date || '9')));
}
/** When the task was last finished (a sent-back task keeps its history). */
const lastFinished = (t: any): string => t.completed_at || taskCompletions(t)[0]?.at || '';
/** Completed tasks, newest first. "All" also keeps tasks that were finished
 *  before and sent back, so every past completion stays reachable. */
function completedOrder(tasks: any[], filter: ReviewFilter) {
  return tasks
    .filter((t) => filter === 'all'
      ? t.status === 'done' || taskCompletions(t).length > 0
      : t.status === 'done' && (filter === 'pending' ? t.review_status !== 'approved' : t.review_status === 'approved'))
    .sort((a, b) => lastFinished(b).localeCompare(lastFinished(a)));
}
/** Only task managers move a card into or out of Cancelled. */
function canMoveBetween(from: string | undefined, to: string, canManage: boolean) {
  return canManage || (from !== 'cancelled' && to !== 'cancelled');
}
/** The board's reading order: column by column, cards top to bottom. */
function boardOrder(tasks: any[], columns: readonly BoardColumn[]) {
  return columns.flatMap((c) => tasks.filter((t) => t.status === c.id));
}
const taskId = (t: any) => t.id as number;

export function TasksPage(props: any) {
  const { tasks, setTasks, teams, members, refresh, currentUser, hasScope, onRequestComplete } = props;
  const ctl = useTasksController({ tasks, setTasks, teams, members, refresh, currentUser, hasScope, onRequestComplete });
  const [view, setView] = useState<View>('board');
  const [query, setQuery] = useState('');
  const [who, setWho] = useState<string>('all'); // 'all' | 'mine' | member id
  const [viewTaskId, setViewTaskId] = useState<number | null>(null);
  const [params, setParams] = useSearchParams();

  // Right-click / menu key on a task (board card or list row).
  useContextMenu('task-card', (el) => {
    const task = (tasks || []).find((t: any) => String(t.id) === el.dataset.cmId);
    if (!task) return null;
    return [
      { label: 'Open', icon: Eye, action: () => setViewTaskId(task.id) },
      ...(ctl.canManageTasks ? [{ label: 'Edit', icon: Pencil, action: () => ctl.openEditTask(task) }] : []),
      { separator: true },
      ...TASK_COLUMNS.filter((c) => c.id !== task.status).map((c) => ({
        label: `Move to ${STATUS_META[c.id].label}`, icon: ArrowRight, action: () => void ctl.updateStatus(task.id, c.id),
      })),
      { separator: true },
      {
        label: 'Copy title', icon: Copy,
        action: () => {
          // No clipboard API (e.g. plain-HTTP origins): say so instead of failing silently.
          if (!navigator.clipboard?.writeText) { notify('Could not copy — your browser blocked the clipboard here.', 'error'); return; }
          void navigator.clipboard.writeText(task.title || '').then(() => notify('Copied', 'success'), () => notify('Could not copy', 'error'));
        },
      },
      ...(ctl.canManageTasks ? [{ label: 'Delete', icon: Trash2, danger: true, action: () => void ctl.handleDeleteTask(task.id) }] : []),
    ];
  });

  // Deep link from a notification: open that task's sheet.
  const linked = Number(params.get('task')) || null;
  useEffect(() => {
    // Same visibility as the board (board tasks only for admins).
    if (!linked || !ctl.filteredTasks.some((t: any) => t.id === linked)) return;
    setViewTaskId(linked);
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, tasks]);

  // "New task" from elsewhere (the Dashboard): /tasks?new=1 opens the editor.
  const wantsNew = params.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    if (ctl.canManageTasks) ctl.openNewTask('todo');
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  // Filters and grouping live in the URL (bookmarkable, shareable).
  const filters = useMemo(() => readFilters(params), [params]);
  const group = readGroup(params);
  const setFilters = (f: TaskFilters) => setParams(writeFilters(params, f, group), { replace: true });
  const setGroup = (g: GroupBy) => setParams(writeFilters(params, filters, g), { replace: true });
  const teamSubsystems = parseSubsystems(teams.find((t: any) => t.id === currentUser?.team_id)?.subsystems);
  const filterSubsystems = useMemo(() => [...new Set([...teamSubsystems, ...ctl.filteredTasks.flatMap((t: any) => parseTagList(t.subsystems))])], [ctl.filteredTasks, teamSubsystems.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const filterLabels = useMemo(() => [...new Set(ctl.filteredTasks.flatMap((t: any) => parseTagList(t.labels)))].sort(), [ctl.filteredTasks]);

  // Search + assignee filters on top of the shared team/board filter.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ctl.filteredTasks.filter((t: any) => {
      if (q && !`${t.title} ${t.description || ''}`.toLowerCase().includes(q)) return false;
      if (!matchesFilters(t, filters)) return false;
      if (who === 'mine') return taskAssigneeIds(t).includes(currentUser?.id);
      if (who !== 'all') return taskAssigneeIds(t).includes(Number(who));
      return true;
    });
  }, [ctl.filteredTasks, query, who, currentUser?.id, filters]);

  // Cancelled tasks are kept but out of the way until asked for.
  const [showCancelled, setShowCancelled] = useState(false);
  const cancelledCount = visible.filter((t: any) => t.status === 'cancelled').length;
  const shown = useMemo(() => (showCancelled ? visible : visible.filter((t: any) => t.status !== 'cancelled')), [visible, showCancelled]);
  const columns: readonly BoardColumn[] = useMemo(() => (showCancelled ? [...TASK_COLUMNS, CANCELLED_COLUMN] : TASK_COLUMNS), [showCancelled]);
  const open = visible.filter((t: any) => isOpenStatus(t.status));
  // Your open tasks across the team (not narrowed by search or filters).
  const mineOpen = useMemo(() => ctl.filteredTasks.filter((t: any) => isOpenStatus(t.status) && taskAssigneeIds(t).includes(currentUser?.id)).length, [ctl.filteredTasks, currentUser?.id]);
  const overdue = open.filter(isOverdue);
  // Multi-select works on what's shown (search + filters), for task managers.
  // Rows in the order they're on screen, so shift-click ranges match what you see.
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('pending');
  const completed = useMemo(() => completedOrder(visible, reviewFilter), [visible, reviewFilter]);
  // Same rule as the Awaiting review list: done and not approved yet (older tasks have no review status).
  const awaitingReview = visible.filter((t: any) => t.status === 'done' && t.review_status !== 'approved').length;
  // The board's groups as displayed (Priority / Assignee / Subsystem columns).
  const groups = useMemo(() => (group === 'status' ? null : groupTasks(shown, group, { members, subsystems: teamSubsystems, assigneesOf: (t) => taskAssigneeIds(t) })), [shown, group, members, teamSubsystems.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  // Selection (and shift-click ranges) follow what's on screen; each task once.
  const shownInOrder = useMemo(() => (
    view === 'list' ? listOrder(shown)
      : view === 'board' ? (groups ? [...new Map(groups.flatMap((g) => g.tasks).map((t: any) => [t.id, t])).values()] : boardOrder(shown, columns))
        : view === 'completed' ? completed : NO_TASKS
  ), [view, shown, columns, completed, groups]);
  const sel = useSelection(ctl.canManageTasks ? shownInOrder : NO_TASKS, taskId);
  const viewTask = viewTaskId ? ctl.filteredTasks.find((t: any) => t.id === viewTaskId) ?? null : null;
  const memberById = useMemo(() => new Map(members.map((m: any) => [m.id, m])), [members]);
  const assigneesOf = (t: any) => taskAssigneeIds(t).map((id) => memberById.get(id)).filter(Boolean);

  return (
    <Page>
      <PageHeader
        title="Tasks"
        description={`${open.length} open${overdue.length ? ` · ${overdue.length} overdue` : ''} · ${visible.filter((t: any) => t.status === 'done').length} done${cancelledCount ? ` · ${cancelledCount} cancelled` : ''}`}
        actions={ctl.canManageTasks ? (
          <div className="flex">
            <Button onClick={() => ctl.openNewTask('todo')} className="rounded-r-none"><Plus /> New task</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="More ways to add tasks" className="rounded-l-none border-l border-accent-ink/20 px-2"><ChevronDown /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => ctl.setShowBulk(true)}><Sparkles /> Paste a list with Bruno</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:w-auto sm:min-w-44 sm:flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="pl-9" />
          </div>
          <Button
            variant="outline" size="sm" aria-pressed={who === 'mine'}
            aria-label={`Mine: ${mineOpen} open task${mineOpen === 1 ? '' : 's'} assigned to you`}
            onClick={() => setWho((w) => (w === 'mine' ? 'all' : 'mine'))}
            className={cn('max-sm:h-11', who === 'mine' && 'border-accent bg-accent/10')}
          >
            <UserCheck /> Mine <span className="tabular-nums text-muted-foreground">{mineOpen}</span>
          </Button>
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger className="w-40" aria-label="Filter by assignee"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
              {members.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <TaskFiltersButton filters={filters} onChange={setFilters} subsystems={filterSubsystems} labels={filterLabels} />
          {view === 'board' && <GroupBySelect value={group} onChange={setGroup} />}
          {teams.length > 1 && (
            <Select value={ctl.filterTeam} onValueChange={ctl.setFilterTeam}>
              <SelectTrigger className="w-44" aria-label="Filter by team"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {ctl.canManageTasks && view !== 'insights' && view !== 'timeline' && visible.length > 0 && (
            <label className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground max-sm:min-h-11">
              <SelectAllCheckbox sel={sel} label="Select all shown tasks" />
              <span>{sel.count ? `${sel.count} selected` : 'Select all'}</span>
            </label>
          )}
          {(cancelledCount > 0 || showCancelled) && (view === 'board' || view === 'list') && (
            <Button variant="outline" size="sm" aria-pressed={showCancelled} onClick={() => setShowCancelled((v) => !v)} className={cn('max-sm:h-11', showCancelled && 'border-accent bg-accent/10')}>
              <Ban /> {showCancelled ? 'Hide cancelled' : 'Show cancelled'} <span className="tabular-nums text-muted-foreground">{cancelledCount}</span>
            </Button>
          )}
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="View" className="ml-auto">
            <ToggleGroupItem value="board" aria-label="Board"><KanbanSquare /> <span className="hidden sm:inline">Board</span></ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List"><List /> <span className="hidden sm:inline">List</span></ToggleGroupItem>
            <ToggleGroupItem value="timeline" aria-label="Timeline"><GanttChart /> <span className="hidden sm:inline">Timeline</span></ToggleGroupItem>
            {ctl.canManageTasks && (
              <ToggleGroupItem value="completed" aria-label={`Completed${awaitingReview ? `, ${awaitingReview} awaiting review` : ''}`}>
                <CheckCheck /> <span className="hidden sm:inline">Completed</span>
                {awaitingReview > 0 && <Badge variant="soft" className="ml-0.5 px-1.5">{awaitingReview}</Badge>}
              </ToggleGroupItem>
            )}
            <ToggleGroupItem value="insights" aria-label="Insights"><LineChartIcon /> <span className="hidden sm:inline">Insights</span></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </PageHeader>

      {view === 'board' && (
        group === 'status'
          ? <Board wipLimits={cleanWipLimits(teams.find((t: any) => t.id === currentUser?.team_id)?.task_wip_limits)} tasks={shown} columns={columns} ctl={ctl} assigneesOf={assigneesOf} onOpen={setViewTaskId} filterKey={`${query}|${who}|${ctl.filterTeam}|${params.toString()}`} sel={ctl.canManageTasks ? sel : null} />
          : <GroupedBoard tasks={shown} groups={groups!} group={group} ctl={ctl} assigneesOf={assigneesOf} onOpen={setViewTaskId} filterKey={`${query}|${who}|${ctl.filterTeam}|${params.toString()}`} sel={ctl.canManageTasks ? sel : null} />
      )}
      {view === 'list' && (
        shown.length === 0
          ? <EmptyState icon={ListChecks} title="No tasks match" description="Try clearing the search or filters." />
          : <ListView tasks={shown} ctl={ctl} assigneesOf={assigneesOf} onOpen={setViewTaskId} sel={ctl.canManageTasks ? sel : null} />
      )}
      {view === 'completed' && ctl.canManageTasks && (
        <CompletedView tasks={completed} filter={reviewFilter} onFilter={setReviewFilter} members={members} onOpen={setViewTaskId} sel={sel} />
      )}
      {view === 'timeline' && <TaskGantt tasks={shown} onOpen={setViewTaskId} />}
      {view === 'insights' && (
        <Insights
          onOpen={setViewTaskId}
          timeZone={teams.find((t: any) => t.id === currentUser?.team_id)?.timezone}
          tasks={visible}
          members={members}
          scope={who === 'all' ? (query.trim() ? 'Matching your search' : 'Whole team') : who === 'mine' ? 'Assigned to you' : `Assigned to ${members.find((m: any) => String(m.id) === who)?.name ?? 'them'}`}
        />
      )}

      <BulkBar
        sel={sel}
        noun="task"
        actions={[
          {
            label: 'Move to',
            run: () => false,
            render: (ids, busy, exec) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={busy} className="max-sm:h-11"><ArrowRight /> Move to</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(['todo', 'in-progress'] as const).map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => { exec(() => ctl.bulkSetStatus(ids.map(Number), s)); }}>
                      <span className={cn('size-2 rounded-full', STATUS_META[s].dot)} /> {STATUS_META[s].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
          {
            label: 'Assign',
            run: () => false,
            render: (ids, busy, exec) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={busy} className="max-sm:h-11"><UserPlus /> Assign</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                  {members.map((m: any) => (
                    <DropdownMenuItem key={m.id} onSelect={() => { exec(() => ctl.bulkAssign(ids.map(Number), m.id)); }}>{m.name}</DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => { exec(() => ctl.bulkAssign(ids.map(Number), null)); }}>Unassign everyone</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
          { label: 'Approve', icon: <CheckCircle2 />, show: view === 'completed', run: (ids) => ctl.bulkApprove(ids.map(Number)) },
          { label: 'Delete', icon: <Trash2 />, danger: true, run: (ids) => ctl.bulkDeleteTasks(ids.map(Number)) },
        ]}
      />
      <TaskViewSheet onOpenTask={setViewTaskId} task={viewTask} onOpenChange={(o) => { if (!o) setViewTaskId(null); }} ctl={ctl} members={members} teams={teams} />
      <TaskEditorSheet ctl={ctl} members={members} teams={teams} />
      <BulkImportDialog ctl={ctl} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 86400000;
/** Due date, with a live countdown (ticks every second) for open tasks due within a week or overdue. */
function DueChip({ task }: { task: any }) {
  if (!task.due_date) return null;
  const overdue = isOverdue(task);
  const at = dueMoment(task.due_date, task.due_time);
  const live = at && isOpenStatus(task.status) && at.getTime() - Date.now() < WEEK_MS;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1 text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}>
      <CalendarDays className="size-3" />
      {format(new Date(String(task.due_date).slice(0, 10) + 'T12:00:00'), 'MMM d')}{task.due_time && at ? `, ${format(at, 'h:mm a')}` : ''}
      {live && <Countdown to={at!} className="text-[11px]" />}
    </span>
  );
}

/** A card's content: title, tags, markers, due date and people (Board and grouped boards). */
function TaskCardBody({ task: t, people, byId }: { task: any; people: any[]; byId: Map<number, any> }) {
  return (
    <>
      <p className={cn('line-clamp-2 text-sm font-medium', !isOpenStatus(t.status) && 'text-muted-foreground line-through')}>{t.title}</p>
      <TaskTagChips task={t} className="mt-2" />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {t.is_board ? <Badge variant="soft"><Crown /> Board</Badge> : null}
        <TaskMarks task={t} byId={byId} />
        <DueChip task={t} />
        <span className="ml-auto"><AvatarStack members={people} /></span>
      </div>
    </>
  );
}

/**
 * The board in Priority, Assignee or Subsystem columns. Dragging a card to
 * another Priority column changes its priority; status stays as it is (use
 * Columns: Status to move work along).
 */
function GroupedBoard({ tasks, groups, group, ctl, assigneesOf, onOpen, filterKey, sel }: {
  tasks: any[]; groups: Group[]; group: Exclude<GroupBy, 'status'>; ctl: ReturnType<typeof useTasksController>;
  assigneesOf: (t: any) => any[]; onOpen: (id: number) => void; filterKey?: string; sel: Selection | null;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const canDrag = group === 'priority' && ctl.canManageTasks;
  // Long columns show 40 cards, then more as you scroll (like the Status board).
  // A card just moved into a column stays in view (and keeps focus).
  const inc = useIncrementalGroups(40, `${filterKey}|${group}`);
  const [moved, setMoved] = useState<Set<number>>(() => new Set());
  const keepMoved = (t: any) => moved.has(t.id);
  const justDone = useJustCompleted(tasks);
  const moveTo = (t: any, colId: string) => {
    setMoved((s) => new Set(s).add(t.id));
    void ctl.setPriority(t.id, colId === 'none' ? null : colId);
  };
  /** Arrows move between cards; in Priority columns Alt (Option) or Shift + Left/Right moves the card; X selects it. */
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, t: any) => {
    const col = Number(e.currentTarget.dataset.gcol);
    const row = Number(e.currentTarget.dataset.grow);
    const focusAt = (c: number, r: number) => {
      const cards = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-grouped-card][data-gcol="${c}"]`));
      if (!cards.length) return false;
      cards[Math.max(0, Math.min(r, cards.length - 1))].focus();
      return true;
    };
    if ((e.shiftKey || e.altKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      if (!canDrag) return;
      const next = groups[col + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (!next) return;
      e.preventDefault();
      moveTo(t, next.id);
      window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-grouped-card][data-id="${t.id}"]`)?.focus(), 60);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focusAt(col, row + (e.key === 'ArrowDown' ? 1 : -1)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      for (let c = col + dir; c >= 0 && c < groups.length; c += dir) if (focusAt(c, row)) break;
    } else if ((e.key === 'x' || e.key === 'X') && sel) { e.preventDefault(); sel.toggle(t.id); }
  };
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {groups.map((col) => (
        <section
          key={col.id}
          aria-label={`${col.label} (${col.tasks.length})`}
          onDragOver={(e) => { if (canDrag && dragId != null) { e.preventDefault(); setOverCol(col.id); } }}
          onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
          onDrop={(e) => {
            e.preventDefault();
            const id = dragId; setDragId(null); setOverCol(null);
            const t = tasks.find((x) => x.id === id);
            if (canDrag && t && (t.priority || 'none') !== col.id) moveTo(t, col.id);
          }}
          className={cn('flex w-[82vw] shrink-0 snap-start flex-col rounded-xl bg-muted/40 p-2 sm:w-72', overCol === col.id && 'bg-accent/10 ring-1 ring-accent/40')}
        >
          <header className="flex items-center gap-2 px-2 pb-2 pt-1">
            <h2 className="truncate text-sm font-medium">{col.label}</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{col.tasks.length}</span>
          </header>
          <ul className="flex min-h-24 flex-col gap-2">
            {inc.slice(col.id, col.tasks, keepMoved).map((t, rowIdx) => (
              <li key={t.id} className="group/card relative">
                {sel && (
                  <RowCheckbox
                    sel={sel} id={t.id} label={`Select ${t.title}`}
                    className={cn('absolute right-2.5 top-2.5 z-10 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:focus-within:opacity-100', sel.count > 0 && 'md:opacity-100')}
                  />
                )}
                <button
                  type="button"
                  data-grouped-card data-id={t.id} data-gcol={groups.indexOf(col)} data-grow={rowIdx}
                  aria-keyshortcuts={canDrag ? 'ArrowUp ArrowDown ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Shift+ArrowLeft Shift+ArrowRight X' : 'ArrowUp ArrowDown ArrowLeft ArrowRight X'}
                  onKeyDown={(e) => onKey(e, t)}
                  draggable={canDrag}
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => onOpen(t.id)}
                  data-cm-type="task-card" data-cm-id={t.id}
                  aria-label={`${t.title}, ${STATUS_META[t.status]?.label ?? t.status}`}
                  className={cn('w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm outline-none transition-[border-color,box-shadow]', 'hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60', dragId === t.id && 'opacity-50', sel && 'pr-9', sel?.has(t.id) && 'border-accent/60 ring-1 ring-accent/40', justDone.has(t.id) && 'task-done-pop')}
                >
                  {justDone.has(t.id) && <CheckCircle2 aria-hidden className="task-done-check pointer-events-none absolute -left-1.5 -top-1.5 size-5 rounded-full bg-card text-success" />}
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-2 rounded-full', STATUS_META[t.status]?.dot)} />{STATUS_META[t.status]?.label ?? t.status}</span>
                  <TaskCardBody task={t} people={assigneesOf(t)} byId={ctl.taskById} />
                </button>
              </li>
            ))}
            <LoadMore as="li" hidden={inc.hidden(col.id, col.tasks, keepMoved)} onMore={() => inc.more(col.id)} />
            {col.tasks.length === 0 && (
              <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Nothing here</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Small markers on a card: priority, repeat, review, blocked and links. */
function TaskMarks({ task, byId }: { task: any; byId: Map<number, any> }) {
  const rule = readRecurrence(task.recurrence);
  return (
    <>
      <TaskLinkMarks task={task} byId={byId} />
      {task.completion_mode === 'each' && taskAssigneeIds(task).length > 0 && task.status !== 'done' && (
        <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground" title="Everyone assigned completes it separately">
          <CheckCircle2 className="size-3" aria-hidden /> {(task.done_assignee_ids || []).length}/{taskAssigneeIds(task).length}<span className="sr-only"> people done</span>
        </span>
      )}
      <PriorityBadge value={task.priority} />
      {rule && <span className="inline-flex items-center text-muted-foreground" title={recurrenceLabel(rule)}><Repeat className="size-3.5" /><span className="sr-only">{recurrenceLabel(rule)}</span></span>}
      <ReviewBadge task={task} />
    </>
  );
}

/** Done tasks, newest first, for managers to review (V3.5). */
function CompletedView({ tasks, filter, onFilter, members, onOpen, sel }: {
  tasks: any[]; filter: ReviewFilter; onFilter: (f: ReviewFilter) => void; members: any[]; onOpen: (id: number) => void; sel: Selection;
}) {
  const nameOf = (id: any) => members.find((m: any) => m.id === id)?.name;
  return (
    <>
      <ToggleGroup variant="chips" type="single" aria-label="Review status" value={filter} onValueChange={(v) => { if (v) onFilter(v as ReviewFilter); }} className="mb-4">
        <ToggleGroupItem value="pending">Awaiting review</ToggleGroupItem>
        <ToggleGroupItem value="approved">Approved</ToggleGroupItem>
        <ToggleGroupItem value="all">All completed</ToggleGroupItem>
      </ToggleGroup>
      {!tasks.length ? (
        <EmptyState icon={CheckCheck} title={filter === 'pending' ? 'Nothing waiting for review' : 'No completed tasks yet'} description={filter === 'pending' ? 'Finished tasks land here until a manager approves them.' : 'Tasks show up here once they are marked done.'} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10"><SelectAllCheckbox sel={sel} label="Select all completed tasks shown" /></TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="hidden w-40 sm:table-cell">Completed by</TableHead>
                <TableHead className="hidden w-36 sm:table-cell">Completed</TableHead>
                <TableHead className="w-44">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id} data-cm-type="task-card" data-cm-id={t.id} data-state={sel.has(t.id) ? 'selected' : undefined} className="cursor-pointer" onClick={() => onOpen(t.id)}>
                  <TableCell className="w-10"><RowCheckbox sel={sel} id={t.id} label={`Select ${t.title}`} /></TableCell>
                  <TableCell>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }} className="text-left font-medium outline-none focus-visible:underline">{t.title}</button>
                    {t.completion_notes && <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{t.completion_notes}</span>}
                    {photoCount(t) > 0 && <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Camera className="size-3" aria-hidden /> {`${photoCount(t)} photo${photoCount(t) === 1 ? '' : 's'}`}</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{nameOf(t.completed_by) || '—'}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{lastFinished(t) && !Number.isNaN(Date.parse(lastFinished(t))) ? format(new Date(lastFinished(t)), 'MMM d, h:mm a') : '—'}</TableCell>
                  <TableCell><ReviewBadge task={t} />{!t.review_status && <span className="text-xs text-muted-foreground">Not reviewed</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

/** Board keyboard: arrows move between cards, Alt (Option) or Shift + Left/Right moves the card. */
function onCardKey(e: React.KeyboardEvent<HTMLButtonElement>, task: any, ctl: ReturnType<typeof useTasksController>, sel: Selection | null, columns: readonly BoardColumn[]) {
  const card = e.currentTarget;
  const col = Number(card.dataset.col);
  const row = Number(card.dataset.row);
  const focusAt = (c: number, r: number) => {
    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-task-card][data-col="${c}"]`));
    if (!cards.length) return false;
    cards[Math.max(0, Math.min(r, cards.length - 1))].focus();
    return true;
  };
  if ((e.shiftKey || e.altKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const next = columns[col + (e.key === 'ArrowLeft' ? -1 : 1)];
    if (!next || !canMoveBetween(task.status, next.id, ctl.canManageTasks)) return;
    e.preventDefault();
    void ctl.updateStatus(task.id, next.id);
    // Follow the card to its new column once it has moved.
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-task-card][data-id="${task.id}"]`)?.focus(), 60);
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    focusAt(col, row + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    for (let c = col + dir; c >= 0 && c < columns.length; c += dir) if (focusAt(c, row)) break;
  } else if ((e.key === 'x' || e.key === 'X') && sel) {
    e.preventDefault();
    sel.toggle(task.id);
  }
}

const altKey = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent) ? 'Option' : 'Alt';

function Board({ tasks, columns, ctl, assigneesOf, onOpen, filterKey, sel, wipLimits }: {
  tasks: any[]; columns: readonly BoardColumn[]; ctl: ReturnType<typeof useTasksController>; assigneesOf: (t: any) => any[]; onOpen: (id: number) => void; filterKey?: string;
  sel: Selection | null;
  /** The team's column limits; counts are the whole column, not just what a filter shows. */
  wipLimits: Partial<Record<string, number>>;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // Long columns show 40 cards, then more as you scroll (audit: scale); a new
  // search or filter starts over. Cards dropped into a column stay in view.
  const inc = useIncrementalGroups(40, filterKey);
  const [moved, setMoved] = useState<Set<number>>(() => new Set());
  const keepMoved = (t: any) => moved.has(t.id);
  const justDone = useJustCompleted(tasks);
  return (
    <LayoutGroup>
      <p className="mb-2 hidden text-xs text-muted-foreground md:block">Keyboard: arrow keys move between cards, <kbd className="rounded border border-border px-1 font-sans">{altKey}</kbd> + <kbd className="rounded border border-border px-1 font-sans">←</kbd>/<kbd className="rounded border border-border px-1 font-sans">→</kbd> (or Shift) moves a card to the next column, X selects it.</p>
      <div className={cn('-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:overflow-visible md:px-0', columns.length > 3 ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
        {columns.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          const M = STATUS_META[col.id];
          return (
            <section
              key={col.id}
              aria-label={`${M.label} (${items.length})`}
              onDragOver={(e) => { if (dragId != null && canMoveBetween(tasks.find((t) => t.id === dragId)?.status, col.id, ctl.canManageTasks)) { e.preventDefault(); setOverCol(col.id); } }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId;
                setDragId(null); setOverCol(null);
                const task = tasks.find((t) => t.id === id);
                if (task && task.status !== col.id && canMoveBetween(task.status, col.id, ctl.canManageTasks)) {
                  setMoved((s) => new Set(s).add(task.id));
                  void ctl.updateStatus(task.id, col.id);
                }
              }}
              className={cn(
                'flex w-[82vw] shrink-0 snap-start flex-col rounded-xl bg-muted/40 p-2 transition-colors sm:w-80 md:w-auto',
                overCol === col.id && 'bg-accent/10 ring-1 ring-accent/40',
              )}
            >
              <header className="flex items-center gap-2 px-2 pb-2 pt-1">
                <span className={cn('size-2 rounded-full', M.dot)} />
                <h2 className="text-sm font-medium">{M.label}</h2>
                <span className="text-sm tabular-nums text-muted-foreground">{items.length}</span>
                {(col.id === 'todo' || col.id === 'in-progress') && (
                  <WipLimit
                    column={M.label}
                    count={ctl.filteredTasks.filter((t: any) => t.status === col.id).length}
                    limit={wipLimits[col.id]}
                    canEdit={ctl.isAdmin}
                    onSave={(n) => ctl.setWipLimit(col.id as 'todo' | 'in-progress', n)}
                  />
                )}
                {ctl.canManageTasks && col.id !== 'cancelled' && (
                  <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Add task to ${M.label}`} onClick={() => ctl.openNewTask(col.id)}><Plus /></Button>
                )}
              </header>
              <ul className="flex min-h-24 flex-col gap-2">
                <AnimatePresence initial={false}>
                  {inc.slice(col.id, items, keepMoved).map((t, rowIdx) => {
                    const people = assigneesOf(t);
                    return (
                      <motion.li
                        key={t.id}
                        layout
                        layoutId={`task-${t.id}`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: ctl.pendingIds.has(t.id) ? 0.6 : 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        className="group/card relative"
                      >
                        {sel && (
                          <RowCheckbox
                            sel={sel} id={t.id} label={`Select ${t.title}`}
                            className={cn(
                              'absolute right-2.5 top-2.5 z-10 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:focus-within:opacity-100',
                              sel.count > 0 && 'md:opacity-100',
                            )}
                          />
                        )}
                        <button
                          type="button"
                          draggable
                          data-cm-type="task-card" data-cm-id={t.id}
                          data-task-card data-id={t.id} data-col={columns.findIndex((c) => c.id === col.id)} data-row={rowIdx}
                          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Shift+ArrowLeft Shift+ArrowRight X"
                          onKeyDown={(e) => onCardKey(e, t, ctl, sel, columns)}
                          onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragEnd={() => { setDragId(null); setOverCol(null); }}
                          onClick={() => onOpen(t.id)}
                          aria-label={`${t.title}, ${M.label}${isOverdue(t) ? ', overdue' : ''}`}
                          className={cn(
                            'group w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm outline-none transition-[border-color,box-shadow,transform]',
                            'hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99]',
                            dragId === t.id && 'opacity-50',
                            sel && 'pr-9',
                            sel?.has(t.id) && 'border-accent/60 ring-1 ring-accent/40',
                            justDone.has(t.id) && 'task-done-pop',
                          )}
                        >
                          {justDone.has(t.id) && <CheckCircle2 aria-hidden className="task-done-check pointer-events-none absolute -left-1.5 -top-1.5 size-5 rounded-full bg-card text-success" />}
                          <TaskCardBody task={t} people={people} byId={ctl.taskById} />
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
                <LoadMore as="li" hidden={inc.hidden(col.id, items, keepMoved)} onMore={() => inc.more(col.id)} />
                {items.length === 0 && (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {col.id === 'done' ? 'Finished tasks land here' : 'Nothing here'}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function ListView({ tasks, ctl, assigneesOf, onOpen, sel }: {
  tasks: any[]; ctl: ReturnType<typeof useTasksController>; assigneesOf: (t: any) => any[]; onOpen: (id: number) => void;
  sel: Selection | null;
}) {
  const sorted = useMemo(() => listOrder(tasks), [tasks]);
  // Only the rows near the screen are rendered once the list is long.
  const vr = useVirtualRows(sorted.length, 57);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {sel && <TableHead className="w-10"><SelectAllCheckbox sel={sel} label="Select all tasks in the list" /></TableHead>}
            <TableHead>Task</TableHead>
            <TableHead className="hidden w-40 sm:table-cell">Assignees</TableHead>
            <TableHead className="hidden w-28 sm:table-cell">Due</TableHead>
            <TableHead className="w-40">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody ref={vr.ref as any}>
          <Spacer height={vr.paddingTop} colSpan={sel ? 5 : 4} />
          {vr.rows(sorted).map(({ item: t, rowProps }) => (
            <TableRow key={t.id} {...rowProps} data-cm-type="task-card" data-cm-id={t.id} data-state={sel?.has(t.id) ? 'selected' : undefined} className="cursor-pointer" onClick={() => onOpen(t.id)}>
              {sel && <TableCell className="w-10"><RowCheckbox sel={sel} id={t.id} label={`Select ${t.title}`} /></TableCell>}
              <TableCell>
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }} className="text-left font-medium outline-none focus-visible:underline">
                  {t.title}
                </button>
                {t.is_board ? <Badge variant="soft" className="ml-2"><Crown /> Board</Badge> : null}
                <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle"><TaskMarks task={t} byId={ctl.taskById} /></span>
                <TaskTagChips task={t} className="mt-1" />
                <span className="mt-0.5 flex items-center gap-2 sm:hidden"><DueChip task={t} /></span>
              </TableCell>
              <TableCell className="hidden sm:table-cell"><AvatarStack members={assigneesOf(t)} max={4} /></TableCell>
              <TableCell className="hidden sm:table-cell"><DueChip task={t} /></TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select value={t.status} disabled={t.status === 'cancelled' && !ctl.canManageTasks} onValueChange={(v) => { if (v !== t.status) void ctl.updateStatus(t.id, v); }}>
                  <SelectTrigger size="sm" aria-label={`Status of ${t.title}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(ctl.canManageTasks || t.status === 'cancelled' ? [...TASK_COLUMNS, CANCELLED_COLUMN] : TASK_COLUMNS).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2"><span className={cn('size-2 rounded-full', STATUS_META[c.id].dot)} />{STATUS_META[c.id].label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
          <Spacer height={vr.paddingBottom} colSpan={sel ? 5 : 4} />
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/** "Needs attention" card: a count and the first few tasks, each opens its sheet. */
function AttentionList({ title, tone, tasks, onOpen, empty }: { title: string; tone: string; tasks: any[]; onOpen: (id: number) => void; empty: string }) {
  const [all, setAll] = useState(false);
  const list = all ? tasks : tasks.slice(0, 4);
  return (
    <section aria-label={`Needs attention: ${title}`} className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className={cn('mt-1 font-display text-3xl font-semibold tabular-nums', tasks.length ? tone : 'text-foreground')}><AnimatedValue value={String(tasks.length)} /></p>
      {tasks.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">{empty}</p> : (
        <ul className="mt-2 space-y-1">
          {list.map((t) => <li key={t.id}><button type="button" onClick={() => onOpen(t.id)} className="block w-full truncate text-left text-sm hover:underline">{t.title}</button></li>)}
          {tasks.length > 4 && <li><Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${tasks.length}`}</Button></li>}
        </ul>
      )}
    </section>
  );
}

function Insights({ tasks, members, scope, onOpen, timeZone }: { tasks: any[]; members: any[]; scope: string; onOpen: (id: number) => void; timeZone?: string | null }) {
  // Every figure here uses the same filtered tasks as the board/list.
  const trends = useMemo(() => completionTrendsOf(tasks), [tasks]);
  const capacity = useMemo(() => memberCapacityOf(tasks, members), [tasks, members]);
  const avg = useMemo(() => avgCompletionDaysOf(tasks), [tasks]);
  const openCount = tasks.filter((t) => isOpenStatus(t.status)).length;
  const doneThisWeek = trends.reduce((a: number, d: any) => a + d.completed, 0);
  // Same rule as Bruno's facts: finished in the last 30 days, with a due date, on or before
  // it, counted in the team's timezone so every teammate (and Bruno) sees the same rate.
  const onTime = useMemo(() => onTimeStats(tasks, { since: new Date(Date.now() - ON_TIME_WINDOW_DAYS * 86400000), localDate: localDateIn(timeZone) }), [tasks, timeZone]);
  const onTimePct = onTimePercent(onTime);
  const overdueList = tasks.filter((t) => isOpenStatus(t.status) && isOverdue(t));
  const undatedList = tasks.filter((t) => isOpenStatus(t.status) && !t.due_date);
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">Showing: <span className="font-medium text-foreground">{scope}</span></p>
      <div className="mb-8 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card py-4">
        <div className="px-5"><p className="text-sm text-muted-foreground">Open</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums"><AnimatedValue value={String(openCount)} /></p></div>
        <div className="px-5"><p className="text-sm text-muted-foreground">Done this week</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums text-success"><AnimatedValue value={String(doneThisWeek)} /></p></div>
        <div className="px-5"><p className="text-sm text-muted-foreground">Avg. time to done</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums"><AnimatedValue value={`${avg}`} /><span className="ml-1 text-base font-normal text-muted-foreground">days</span></p></div>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">On time</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{onTimePct == null ? '—' : <AnimatedValue value={`${onTimePct}%`} />}</p>
          <p className="mt-1 text-xs text-muted-foreground">{onTime.total ? `${onTime.onTime} of ${onTime.total} tasks with a due date, finished in the last ${ON_TIME_WINDOW_DAYS} days` : `No tasks with a due date finished in the last ${ON_TIME_WINDOW_DAYS} days`}</p>
        </div>
        <AttentionList title="Overdue" tone="text-destructive" tasks={overdueList} onOpen={onOpen} empty="Nothing overdue" />
        <AttentionList title="No due date" tone="text-foreground" tasks={undatedList} onOpen={onOpen} empty="Every open task has a due date" />
      </div>
      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title="Completed per day" description="Last 7 days">
          <ChartContainer config={{ completed: { label: 'Completed', color: 'var(--color-chart-3)' } }} className="h-56">
            <AreaChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tasks-done" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-completed)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-completed)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Area dataKey="completed" type="monotone" stroke="var(--color-completed)" strokeWidth={2} fill="url(#tasks-done)" animationDuration={900} />
            </AreaChart>
          </ChartContainer>
        </Section>
        <Section title="Workload by person" description="Assigned tasks by status">
          {capacity.length === 0 ? (
            <EmptyState title="No assigned tasks yet" />
          ) : (
            <ChartContainer
              config={{ todo: { label: 'To do', color: 'var(--color-muted-foreground)' }, inProgress: { label: 'In progress', color: 'var(--color-chart-2)' }, done: { label: 'Done', color: 'var(--color-chart-3)' } }}
              className="h-56"
            >
              <BarChart data={capacity} layout="vertical" barSize={14} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={88} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="todo" stackId="a" fill="var(--color-todo)" radius={[4, 0, 0, 4]} animationDuration={900} />
                <Bar dataKey="inProgress" stackId="a" fill="var(--color-inProgress)" animationDuration={900} />
                <Bar dataKey="done" stackId="a" fill="var(--color-done)" radius={[0, 4, 4, 0]} animationDuration={900} />
              </BarChart>
            </ChartContainer>
          )}
        </Section>
      </div>
    </>
  );
}
