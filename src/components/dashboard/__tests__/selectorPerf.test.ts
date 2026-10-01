import { describe, expect, it } from 'vitest';
import {
  buildActivityFeed,
  buildMemberNameMap,
  deriveDashboardData,
  type DashboardAttendance,
  type DashboardData,
  type DashboardMember,
  type DashboardTask,
} from '../dashboardSelectors';

// Regression tests: the dashboard selectors must stay linear-ish. If someone
// reintroduces an O(n^2) lookup (e.g. Array.find inside a loop), these budgets
// catch it on a synthetic large team.

const NOW = Date.now();

function members(n: number): DashboardMember[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Member ${i + 1}` }) as DashboardMember);
}
function tasks(n: number): DashboardTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title: `Task ${i}`,
    status: i % 3 === 0 ? 'done' : 'todo',
    due_date: '2026-10-01',
    updated_at: new Date(NOW - i * 1000).toISOString(),
    member_id: (i % 500) + 1,
  }) as unknown as DashboardTask);
}
function attendance(n: number): DashboardAttendance[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    member_id: (i % 500) + 1,
    date: '2026-10-01',
    status: i % 10 === 0 ? 'A' : 'P',
    created_at: new Date(NOW - i * 500).toISOString(),
  }) as unknown as DashboardAttendance);
}

describe('dashboard selector performance', () => {
  it('buildMemberNameMap stays fast for 5k members', () => {
    const t0 = performance.now();
    const map = buildMemberNameMap(members(5000));
    expect(performance.now() - t0).toBeLessThan(500);
    expect(map.get(4999)).toBe('Member 4999');
  });

  it('buildActivityFeed handles 15k rows within budget and stays sorted', () => {
    const mem = members(500);
    const input = {
      tasks: tasks(5000),
      events: [],
      todayAttendance: attendance(10000),
      presentCount: 9000,
      members: mem,
      budget: [],
      today: '2026-10-01',
      nowMs: NOW,
    };
    const t0 = performance.now();
    const feed = buildActivityFeed(input, 12);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(feed.length).toBeLessThanOrEqual(12);
    // newest first
    const tsOf = (it: { ts?: string; dateOnly?: string }) =>
      it.ts ? new Date(it.ts).getTime() : it.dateOnly ? new Date(it.dateOnly).getTime() : 0;
    for (let i = 1; i < feed.length; i++) {
      expect(tsOf(feed[i - 1])).toBeGreaterThanOrEqual(tsOf(feed[i]));
    }
  });

  it('deriveDashboardData handles a large team within budget', () => {
    const data = {
      attendance: attendance(10000),
      tasks: tasks(5000),
      budget: [],
      outreach: [],
      insights: '',
      scoutFeed: [],
      summary: '',
      members: members(500),
      events: [],
    } as unknown as DashboardData;
    const t0 = performance.now();
    const derived = deriveDashboardData({ data, teams: [], teamId: 1, today: '2026-10-01', nowMs: NOW });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(derived.presentCount).toBeGreaterThan(0);
  });
});
