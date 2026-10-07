import { describe, expect, it } from 'vitest';
import {
  buildActivityFeed,
  buildMemberNameMap,
  countOverdue,
  countPresent,
  deriveDashboardData,
  labelNextEvent,
  lookupMemberName,
  selectActiveTasks,
  selectNextEvent,
  selectTodayAttendance,
  selectTotalBudget,
  type DashboardData,
} from '../dashboardSelectors';

const TODAY = '2026-10-01';
const NOW = new Date('2026-10-01T12:00:00').getTime();

function makeData(over: Partial<DashboardData> = {}): DashboardData {
  return {
    members: [
      { id: 1, team_id: 7, name: 'Sushil', role: 'admin', email: 'a@x.com', is_board: 1, scopes: '[]', created_at: '2026-09-20T10:00:00' },
      { id: 2, team_id: 7, name: 'Rida', role: 'member', email: 'b@x.com', is_board: 0, scopes: '[]', created_at: '2026-09-29T10:00:00' },
    ],
    attendance: [
      { id: 1, member_id: 1, date: TODAY, status: 'P' },
      { id: 2, member_id: 2, date: TODAY, status: 'L' },
      { id: 3, member_id: 1, date: '2026-09-30', status: 'A' },
    ],
    tasks: [
      { id: 1, team_id: 7, title: 'Build intake', description: '', status: 'in-progress', assigned_to: 1, due_date: '2026-09-28', created_at: '2026-09-29T09:00:00' },
      { id: 2, team_id: 7, title: 'Wire robot', description: '', status: 'done', assigned_to: 2, due_date: '2026-09-25', completed_at: '2026-09-30T18:00:00', created_at: '2026-09-20T09:00:00' },
      { id: 3, team_id: 7, title: 'Old done', description: '', status: 'done', assigned_to: null, due_date: '2026-08-01', completed_at: '2026-08-02T09:00:00', created_at: '2026-08-01T09:00:00' },
    ],
    events: [
      { id: 1, title: 'Qualifier', description: '', date: '2026-10-05', start_time: '09:00', end_time: '17:00', location: '', event_type: 'competition', team_id: 7, created_by: 1, created_at: '2026-09-28T09:00:00' },
      { id: 2, title: 'Past meeting', description: '', date: '2026-09-20', start_time: '09:00', end_time: '10:00', location: '', event_type: 'meeting', team_id: 7, created_by: 1, created_at: '2026-09-10T09:00:00' },
      { id: 3, title: 'Sooner workshop', description: '', date: '2026-10-02', start_time: '18:00', end_time: '20:00', location: '', event_type: 'meeting', team_id: 7, created_by: 1, created_at: '2026-09-29T09:00:00' },
    ],
    budget: [
      { id: 1, team_id: 7, type: 'income', amount: 500, category: 'dues', description: 'Dues', date: '2026-09-29' },
      { id: 2, team_id: 7, type: 'expense', amount: 120, category: 'parts', description: 'Gears', date: '2026-09-15' },
      { id: 3, team_id: 7, type: 'expense', amount: 40, category: 'parts', description: 'Old', date: '2026-09-01' },
    ],
    ...over,
  };
}

describe('dashboard selectors', () => {
  it('builds a constant-time member name map with find-first semantics', () => {
    const data = makeData();
    const map = buildMemberNameMap(data.members);
    expect(lookupMemberName(map, 1)).toBe('Sushil');
    expect(lookupMemberName(map, 2)).toBe('Rida');
    expect(lookupMemberName(map, 999)).toBe('Someone');
    expect(lookupMemberName(map, null)).toBe('Someone');
    expect(lookupMemberName(map, undefined)).toBe('Someone');
  });

  it('filters today attendance and counts present/late', () => {
    const data = makeData();
    const todayRows = selectTodayAttendance(data.attendance, TODAY);
    expect(todayRows).toHaveLength(2);
    expect(countPresent(todayRows)).toBe(2);
    expect(countPresent(selectTodayAttendance(data.attendance, '2026-09-30'))).toBe(0);
  });

  it('selects active tasks and counts overdue ones', () => {
    const data = makeData();
    const active = selectActiveTasks(data.tasks);
    expect(active.map((t) => t.id)).toEqual([1]);
    // Overdue is judged against the moment (the full deadline), not a date.
    const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();
    expect(countOverdue(active, TODAY, noon(TODAY))).toBe(1);
    expect(countOverdue(active, '2026-09-01', noon('2026-09-01'))).toBe(0);
  });

  it('picks the next event without sorting', () => {
    const data = makeData();
    const next = selectNextEvent(data.events, TODAY);
    expect(next?.id).toBe(3); // 2026-10-02 beats 2026-10-05; past event excluded
    expect(selectNextEvent([], TODAY)).toBeNull();
    expect(selectNextEvent(data.events, '2026-12-01')).toBeNull();
  });

  it('keeps the first row on (date, start_time) ties, like the stable sort did', () => {
    const data = makeData({
      events: [
        { id: 10, title: 'A', description: '', date: '2026-10-03', start_time: '09:00', end_time: '', location: '', event_type: 'meeting', team_id: 7, created_by: 1, created_at: '2026-09-01T00:00:00' },
        { id: 11, title: 'B', description: '', date: '2026-10-03', start_time: '09:00', end_time: '', location: '', event_type: 'meeting', team_id: 7, created_by: 1, created_at: '2026-09-01T00:00:00' },
      ],
    });
    expect(selectNextEvent(data.events, TODAY)?.id).toBe(10);
  });

  it('labels the next event for today vs future dates', () => {
    const data = makeData();
    const todayEvent = { ...data.events[0], date: TODAY, start_time: '15:00' };
    expect(labelNextEvent(todayEvent, TODAY).dateLabel).toBe('Today · 15:00');
    expect(labelNextEvent(data.events[0], TODAY).dateLabel).toContain('Oct 5');
  });

  it('totals the budget with income minus expenses', () => {
    expect(selectTotalBudget(makeData().budget)).toBe(340);
    expect(selectTotalBudget([])).toBe(0);
  });

  it('builds the 7-day activity feed newest-first with a 12-item cap', () => {
    const data = makeData();
    const feed = buildActivityFeed({
      tasks: data.tasks,
      events: data.events,
      todayAttendance: selectTodayAttendance(data.attendance, TODAY),
      presentCount: 2,
      members: data.members,
      budget: data.budget,
      today: TODAY,
      nowMs: NOW,
    });
    // Old completed task (Aug) and old budget row (Sep 1) are outside the window.
    expect(feed.length).toBeLessThanOrEqual(12);
    const titles = feed.map((f) => f.title);
    const details = feed.map((f) => f.detail || '');
    expect(titles.some((t) => t.includes('completed "Wire robot"'))).toBe(true);
    expect(titles.some((t) => t.includes('Rida joined'))).toBe(true);
    expect(titles.some((t) => t.includes('Attendance was recorded'))).toBe(true);
    expect(details.some((d) => d.includes('Dues'))).toBe(true);
    expect(titles.some((t) => t.includes('Old done'))).toBe(false);
    // Newest first: Oct 1 attendance summary beats Sep 30 completion.
    expect(feed[0].kind).toBe('attendance');
    // Completed recent task wins over its own creation (else-if branch).
    expect(titles.filter((t) => t.includes('Wire robot'))).toHaveLength(1);
  });

  it('derives the whole dashboard bundle in one call', () => {
    const data = makeData();
    const derived = deriveDashboardData({
      data,
      teams: [{ id: 7, name: 'Test Team', number: '33950' }],
      teamId: 7,
      today: TODAY,
      nowMs: NOW,
    });
    expect(derived.presentCount).toBe(2);
    expect(derived.activeTasks).toHaveLength(1);
    expect(derived.overdueCount).toBe(1);
    expect(derived.nextEventLabel?.title).toBe('Sooner workshop');
    expect(derived.totalBudget).toBe(340);
    expect(derived.myTeam?.name).toBe('Test Team');
    expect(derived.activityItems.length).toBeGreaterThan(0);
  });

  it('handles empty datasets without throwing', () => {
    const derived = deriveDashboardData({
      data: { members: [], attendance: [], tasks: [], events: [], budget: [] },
      teams: [],
      teamId: null,
      today: TODAY,
      nowMs: NOW,
    });
    expect(derived.activityItems).toEqual([]);
    expect(derived.nextEventLabel).toBeNull();
    expect(derived.myTeam).toBeUndefined();
  });

  it('scales: 5k members + 20k tasks stay fast without per-item scans', () => {
    const members = Array.from({ length: 5000 }, (_, i) => ({
      id: i + 1, team_id: 7, name: `Member ${i + 1}`, role: 'member',
      email: `m${i}@x.com`, is_board: 0, scopes: '[]', created_at: '2026-09-29T10:00:00',
    }));
    const tasks = Array.from({ length: 20000 }, (_, i) => ({
      id: i + 1, team_id: 7, title: `Task ${i + 1}`, description: '',
      status: i % 3 === 0 ? ('done' as const) : ('todo' as const),
      assigned_to: (i % 5000) + 1, due_date: '2026-10-02',
      created_at: '2026-09-29T10:00:00',
      completed_at: i % 3 === 0 ? '2026-09-30T10:00:00' : null,
    }));
    const start = performance.now();
    const derived = deriveDashboardData({
      data: { members, attendance: [], tasks, events: [], budget: [] },
      teams: [],
      teamId: 7,
      today: TODAY,
      nowMs: NOW,
    });
    const elapsed = performance.now() - start;
    expect(derived.activityItems.length).toBe(12);
    // Generous ceiling — the old per-item find() approach is quadratic here.
    expect(elapsed).toBeLessThan(2000);
  });
});
