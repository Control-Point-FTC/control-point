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
} from 'lucide-react';
import { useContextMenu } from '../../../components/contextmenu/ContextMenuProvider';
import { notify } from '../../../components/dialog';
import { cn } from '../../../components/cn';
import {
  Badge, Button, ChartContainer, ChartTooltip, ChartTooltipContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useTasksController, taskAssigneeIds, TASK_COLUMNS, completionTrendsOf, memberCapacityOf, avgCompletionDaysOf } from '../../../components/tasks/useTasksController';
import { Page, PageHeader, EmptyState, Section } from '../../ui/page';
import { AnimatedValue } from '../../AnimatedValue';
import { AvatarStack } from './AssigneePicker';
import { TaskEditorSheet, TaskViewSheet, STATUS_META, isOverdue } from './TaskSheets';
import { BulkImportDialog } from './TaskDialogs';

type View = 'board' | 'list' | 'insights';

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
        action: () => { void navigator.clipboard?.writeText(task.title || '').then(() => notify('Copied', 'success'), () => notify('Could not copy', 'error')); },
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

  // Search + assignee filters on top of the shared team/board filter.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ctl.filteredTasks.filter((t: any) => {
      if (q && !`${t.title} ${t.description || ''}`.toLowerCase().includes(q)) return false;
      if (who === 'mine') return taskAssigneeIds(t).includes(currentUser?.id);
      if (who !== 'all') return taskAssigneeIds(t).includes(Number(who));
      return true;
    });
  }, [ctl.filteredTasks, query, who, currentUser?.id]);

  const open = visible.filter((t: any) => t.status !== 'done');
  const overdue = open.filter(isOverdue);
  const viewTask = viewTaskId ? ctl.filteredTasks.find((t: any) => t.id === viewTaskId) ?? null : null;
  const memberById = useMemo(() => new Map(members.map((m: any) => [m.id, m])), [members]);
  const assigneesOf = (t: any) => taskAssigneeIds(t).map((id) => memberById.get(id)).filter(Boolean);

  return (
    <Page>
      <PageHeader
        title="Tasks"
        description={`${open.length} open${overdue.length ? ` · ${overdue.length} overdue` : ''} · ${visible.length - open.length} done`}
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
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="pl-9" />
          </div>
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger className="w-40" aria-label="Filter by assignee"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
              {members.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {teams.length > 1 && (
            <Select value={ctl.filterTeam} onValueChange={ctl.setFilterTeam}>
              <SelectTrigger className="w-44" aria-label="Filter by team"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="View" className="ml-auto">
            <ToggleGroupItem value="board" aria-label="Board"><KanbanSquare /> <span className="hidden sm:inline">Board</span></ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List"><List /> <span className="hidden sm:inline">List</span></ToggleGroupItem>
            <ToggleGroupItem value="insights" aria-label="Insights"><LineChartIcon /> <span className="hidden sm:inline">Insights</span></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </PageHeader>

      {view === 'board' && (
        <Board tasks={visible} ctl={ctl} assigneesOf={assigneesOf} onOpen={setViewTaskId} />
      )}
      {view === 'list' && (
        visible.length === 0
          ? <EmptyState icon={ListChecks} title="No tasks match" description="Try clearing the search or filters." />
          : <ListView tasks={visible} ctl={ctl} assigneesOf={assigneesOf} onOpen={setViewTaskId} />
      )}
      {view === 'insights' && (
        <Insights
          tasks={visible}
          members={members}
          scope={who === 'all' ? (query.trim() ? 'Matching your search' : 'Whole team') : who === 'mine' ? 'Assigned to you' : `Assigned to ${members.find((m: any) => String(m.id) === who)?.name ?? 'them'}`}
        />
      )}

      <TaskViewSheet task={viewTask} onOpenChange={(o) => { if (!o) setViewTaskId(null); }} ctl={ctl} members={members} teams={teams} />
      <TaskEditorSheet ctl={ctl} members={members} teams={teams} />
      <BulkImportDialog ctl={ctl} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function DueChip({ task }: { task: any }) {
  if (!task.due_date) return null;
  const overdue = isOverdue(task);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}>
      <CalendarDays className="size-3" />
      {format(new Date(String(task.due_date).slice(0, 10) + 'T12:00:00'), 'MMM d')}
    </span>
  );
}

function Board({ tasks, ctl, assigneesOf, onOpen }: {
  tasks: any[]; ctl: ReturnType<typeof useTasksController>; assigneesOf: (t: any) => any[]; onOpen: (id: number) => void;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  return (
    <LayoutGroup>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {TASK_COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.id);
          const M = STATUS_META[col.id];
          return (
            <section
              key={col.id}
              aria-label={`${M.label} (${items.length})`}
              onDragOver={(e) => { if (dragId != null) { e.preventDefault(); setOverCol(col.id); } }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId;
                setDragId(null); setOverCol(null);
                const task = tasks.find((t) => t.id === id);
                if (task && task.status !== col.id) void ctl.updateStatus(task.id, col.id);
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
                {ctl.canManageTasks && (
                  <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Add task to ${M.label}`} onClick={() => ctl.openNewTask(col.id)}><Plus /></Button>
                )}
              </header>
              <ul className="flex min-h-24 flex-col gap-2">
                <AnimatePresence initial={false}>
                  {items.map((t) => {
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
                      >
                        <button
                          type="button"
                          draggable
                          data-cm-type="task-card" data-cm-id={t.id}
                          onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragEnd={() => { setDragId(null); setOverCol(null); }}
                          onClick={() => onOpen(t.id)}
                          aria-label={`${t.title}, ${M.label}${isOverdue(t) ? ', overdue' : ''}`}
                          className={cn(
                            'group w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm outline-none transition-[border-color,box-shadow,transform]',
                            'hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99]',
                            dragId === t.id && 'opacity-50',
                          )}
                        >
                          <p className={cn('line-clamp-2 text-sm font-medium', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</p>
                          <div className="mt-2.5 flex items-center gap-2">
                            {t.is_board ? <Badge variant="soft"><Crown /> Board</Badge> : null}
                            <DueChip task={t} />
                            <span className="ml-auto"><AvatarStack members={people} /></span>
                          </div>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
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

function ListView({ tasks, ctl, assigneesOf, onOpen }: {
  tasks: any[]; ctl: ReturnType<typeof useTasksController>; assigneesOf: (t: any) => any[]; onOpen: (id: number) => void;
}) {
  const order: Record<string, number> = { 'in-progress': 0, 'todo': 1, 'done': 2 };
  const sorted = [...tasks].sort((a, b) => (order[a.status] - order[b.status]) || String(a.due_date || '9').localeCompare(String(b.due_date || '9')));
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Task</TableHead>
            <TableHead className="hidden w-40 sm:table-cell">Assignees</TableHead>
            <TableHead className="hidden w-28 sm:table-cell">Due</TableHead>
            <TableHead className="w-40">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((t) => (
            <TableRow key={t.id} data-cm-type="task-card" data-cm-id={t.id} className="cursor-pointer" onClick={() => onOpen(t.id)}>
              <TableCell>
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }} className="text-left font-medium outline-none focus-visible:underline">
                  {t.title}
                </button>
                {t.is_board ? <Badge variant="soft" className="ml-2"><Crown /> Board</Badge> : null}
                <span className="mt-0.5 flex items-center gap-2 sm:hidden"><DueChip task={t} /></span>
              </TableCell>
              <TableCell className="hidden sm:table-cell"><AvatarStack members={assigneesOf(t)} max={4} /></TableCell>
              <TableCell className="hidden sm:table-cell"><DueChip task={t} /></TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select value={t.status} onValueChange={(v) => { if (v !== t.status) void ctl.updateStatus(t.id, v); }}>
                  <SelectTrigger size="sm" aria-label={`Status of ${t.title}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_COLUMNS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2"><span className={cn('size-2 rounded-full', STATUS_META[c.id].dot)} />{STATUS_META[c.id].label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

function Insights({ tasks, members, scope }: { tasks: any[]; members: any[]; scope: string }) {
  // Every figure here uses the same filtered tasks as the board/list.
  const trends = useMemo(() => completionTrendsOf(tasks), [tasks]);
  const capacity = useMemo(() => memberCapacityOf(tasks, members), [tasks, members]);
  const avg = useMemo(() => avgCompletionDaysOf(tasks), [tasks]);
  const openCount = tasks.filter((t) => t.status !== 'done').length;
  const doneThisWeek = trends.reduce((a: number, d: any) => a + d.completed, 0);
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">Showing: <span className="font-medium text-foreground">{scope}</span></p>
      <div className="mb-8 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card py-4">
        <div className="px-5"><p className="text-sm text-muted-foreground">Open</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums"><AnimatedValue value={String(openCount)} /></p></div>
        <div className="px-5"><p className="text-sm text-muted-foreground">Done this week</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums text-success"><AnimatedValue value={String(doneThisWeek)} /></p></div>
        <div className="px-5"><p className="text-sm text-muted-foreground">Avg. time to done</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums"><AnimatedValue value={`${avg}`} /><span className="ml-1 text-base font-normal text-muted-foreground">days</span></p></div>
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
