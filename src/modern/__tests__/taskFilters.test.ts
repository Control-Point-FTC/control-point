// Task board filters and grouping (URL-kept, so a filtered board can be shared).
import { describe, it, expect } from 'vitest';
import { activeFilterCount, groupTasks, matchesFilters, NO_FILTERS, readFilters, readGroup, writeFilters } from '../pages/tasks/taskFilters';

const NOW = Date.parse('2026-10-16T12:00:00');
const tasks = [
  { id: 1, title: 'Tune intake', status: 'todo', priority: 'high', subsystems: '["Intake"]', labels: '["TeleOp"]', awards: '["innovate"]', due_date: '2026-10-18' },
  { id: 2, title: 'Wire hub', status: 'in-progress', priority: null, subsystems: '["Electrical","Intake"]', labels: null, awards: null, due_date: '2026-10-10' },
  { id: 3, title: 'Library demo', status: 'todo', priority: 'urgent', subsystems: null, labels: '["Outreach"]', awards: '["reach"]', due_date: null },
];

describe('task filters', () => {
  it('round-trips through the URL, keeping other parameters', () => {
    const f = { ...NO_FILTERS, priority: ['high', 'urgent'], subsystem: ['Intake'], due: 'week' as const };
    const p = writeFilters(new URLSearchParams('task=4'), f, 'priority');
    expect(p.get('task')).toBe('4');
    expect(readFilters(p)).toEqual(f);
    expect(readGroup(p)).toBe('priority');
    expect(activeFilterCount(f)).toBe(4);
    // Unknown values are ignored; the default grouping isn't written.
    expect(readFilters(new URLSearchParams('priority=asap&due=soon'))).toEqual(NO_FILTERS);
    expect(writeFilters(new URLSearchParams(), NO_FILTERS, 'status').toString()).toBe('');
  });

  it('matches priority (incl. none), tags in any case, and due windows', () => {
    const ids = (f: any) => tasks.filter((t) => matchesFilters(t, { ...NO_FILTERS, ...f }, NOW)).map((t) => t.id);
    expect(ids({ priority: ['none'] })).toEqual([2]);
    expect(ids({ subsystem: ['intake'] })).toEqual([1, 2]);
    expect(ids({ label: ['outreach'], award: ['reach'] })).toEqual([3]);
    expect(ids({ due: 'overdue' })).toEqual([2]);
    expect(ids({ due: 'week' })).toEqual([1]);
    expect(ids({ due: 'none' })).toEqual([3]);
  });

  it('groups by priority, assignee and subsystem (a task can sit in several subsystem columns)', () => {
    const byPriority = groupTasks(tasks, 'priority', { members: [], subsystems: [], assigneesOf: () => [] });
    expect(byPriority.map((g) => [g.id, g.tasks.map((t) => t.id)])).toEqual([['urgent', [3]], ['high', [1]], ['medium', []], ['low', []], ['none', [2]]]);
    const bySub = groupTasks(tasks, 'subsystem', { members: [], subsystems: ['Drivetrain', 'Intake'], assigneesOf: () => [] });
    expect(bySub.map((g) => [g.label, g.tasks.map((t) => t.id)])).toEqual([['Intake', [1, 2]], ['Electrical', [2]], ['No subsystem', [3]]]);
    const byWho = groupTasks(tasks, 'assignee', { members: [{ id: 7, name: 'Ana' }], subsystems: [], assigneesOf: (t) => (t.id === 1 ? [7] : []) });
    expect(byWho.map((g) => [g.label, g.tasks.length])).toEqual([['Ana', 1], ['Unassigned', 2]]);
  });
});
