// Task board filters and grouping, kept in the URL (?priority=high&subsystem=Intake&group=priority)
// so a filtered board can be bookmarked or shared. Pure: easy to test.
import { parseTagList } from '../../../types/taskTags';
import { isTaskOverdue, dueMoment } from '../../../utils/countdown';
import { isOpenStatus } from '../../../types/taskStatus';

export type DueFilter = '' | 'overdue' | 'week' | 'none';
export type GroupBy = 'status' | 'priority' | 'assignee' | 'subsystem';

export interface TaskFilters {
  priority: string[];
  subsystem: string[];
  label: string[];
  award: string[];
  due: DueFilter;
}

export const NO_FILTERS: TaskFilters = { priority: [], subsystem: [], label: [], award: [], due: '' };
export const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'] as const;
const LIST_KEYS = ['priority', 'subsystem', 'label', 'award'] as const;
const GROUPS: GroupBy[] = ['status', 'priority', 'assignee', 'subsystem'];

/** Filters from the page's URL (unknown values are ignored). */
export function readFilters(params: URLSearchParams): TaskFilters {
  // One parameter per value (?subsystem=A&subsystem=B): a name may itself contain commas.
  const list = (k: string) => params.getAll(k).map((v) => v.trim()).filter(Boolean).slice(0, 20);
  const due = params.get('due');
  return {
    priority: list('priority').filter((p) => (PRIORITY_ORDER as readonly string[]).includes(p) || p === 'none'),
    subsystem: list('subsystem'),
    label: list('label'),
    award: list('award'),
    due: due === 'overdue' || due === 'week' || due === 'none' ? due : '',
  };
}

export function readGroup(params: URLSearchParams): GroupBy {
  const g = params.get('group') as GroupBy;
  return GROUPS.includes(g) ? g : 'status';
}

/** The URL with these filters and grouping (other parameters kept). */
export function writeFilters(params: URLSearchParams, f: TaskFilters, group: GroupBy): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const k of [...LIST_KEYS, 'due', 'group']) next.delete(k);
  for (const k of LIST_KEYS) for (const v of f[k]) next.append(k, v);
  if (f.due) next.set('due', f.due);
  if (group !== 'status') next.set('group', group);
  return next;
}

export function activeFilterCount(f: TaskFilters): number {
  return LIST_KEYS.reduce((n, k) => n + f[k].length, 0) + (f.due ? 1 : 0);
}

/** Does a task pass every active filter? (Within one kind, any value matches.) */
export function matchesFilters(t: any, f: TaskFilters, now = Date.now()): boolean {
  if (f.priority.length && !f.priority.includes(t.priority || 'none')) return false;
  const lower = (v: string[]) => v.map((x) => x.toLowerCase());
  if (f.subsystem.length && !parseTagList(t.subsystems).some((s) => lower(f.subsystem).includes(s.toLowerCase()))) return false;
  if (f.label.length && !parseTagList(t.labels).some((s) => lower(f.label).includes(s.toLowerCase()))) return false;
  if (f.award.length && !parseTagList(t.awards).some((s) => f.award.includes(s))) return false;
  if (f.due === 'none' && t.due_date) return false;
  if (f.due === 'overdue' && !isTaskOverdue(t, now)) return false;
  if (f.due === 'week') {
    const at = dueMoment(t.due_date, t.due_time);
    if (!at || !isOpenStatus(t.status) || at.getTime() < now || at.getTime() > now + 7 * 864e5) return false;
  }
  return true;
}

export interface Group { id: string; label: string; tasks: any[] }

/**
 * Columns for a non-status grouping. A task with several subsystems (or
 * assignees) shows in each of their columns; tasks with none go in a final
 * "No …" column. Empty columns are left out, except the "No …" column.
 */
export function groupTasks(tasks: any[], group: Exclude<GroupBy, 'status'>, opts: { members: any[]; subsystems: string[]; assigneesOf: (t: any) => number[] }): Group[] {
  if (group === 'priority') {
    const cols: Group[] = [...PRIORITY_ORDER.map((p) => ({ id: p, label: p[0].toUpperCase() + p.slice(1), tasks: [] as any[] })), { id: 'none', label: 'No priority', tasks: [] }];
    for (const t of tasks) cols.find((c) => c.id === (t.priority || 'none'))!.tasks.push(t);
    return cols;
  }
  if (group === 'assignee') {
    const cols = new Map<string, Group>();
    const none: Group = { id: 'none', label: 'Unassigned', tasks: [] };
    for (const t of tasks) {
      const ids = opts.assigneesOf(t);
      if (!ids.length) { none.tasks.push(t); continue; }
      for (const id of ids) {
        const m = opts.members.find((x: any) => Number(x.id) === Number(id));
        const key = String(id);
        if (!cols.has(key)) cols.set(key, { id: key, label: m?.name || 'Former member', tasks: [] });
        cols.get(key)!.tasks.push(t);
      }
    }
    return [...[...cols.values()].sort((a, b) => a.label.localeCompare(b.label)), none];
  }
  const cols = new Map<string, Group>(opts.subsystems.map((s) => [s.toLowerCase(), { id: s, label: s, tasks: [] }]));
  const none: Group = { id: 'none', label: 'No subsystem', tasks: [] };
  for (const t of tasks) {
    const subs = parseTagList(t.subsystems);
    if (!subs.length) { none.tasks.push(t); continue; }
    for (const s of subs) {
      const key = s.toLowerCase();
      if (!cols.has(key)) cols.set(key, { id: s, label: s, tasks: [] });
      cols.get(key)!.tasks.push(t);
    }
  }
  return [...[...cols.values()].filter((c) => c.tasks.length), none];
}
