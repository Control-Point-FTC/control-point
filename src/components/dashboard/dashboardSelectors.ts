import { useMemo } from 'react';
import { format } from 'date-fns';
import type { Member, AttendanceRecord, Task, CalendarEvent, BudgetItem } from '../../types';
import type { ActivityItem } from './TeamActivity';

/**
 * Pure, memoized dashboard selectors.
 *
 * The dashboard used to re-scan its arrays on every render: `members.find()`
 * inside task/activity loops, repeated `.filter()` passes, a full sort just to
 * pick the next event, and `new Date(...)` parsing inside sort comparators.
 * Everything here is a single-pass, allocation-light pure function so the
 * results can be memoized and unit-tested with large synthetic datasets.
 */

/** Runtime attendance rows use short status codes ('P' | 'A' | 'L' | 'E'). */
export interface DashboardAttendance extends Omit<AttendanceRecord, 'status'> {
  status: string;
}

/** Runtime task rows carry lifecycle timestamps not declared on Task. */
export interface DashboardTask extends Task {
  completed_at?: string | null;
  created_at?: string | null;
}

/** Runtime event rows — created_at is already declared on CalendarEvent. */
export type DashboardEvent = CalendarEvent;

/** Runtime member rows carry a creation timestamp not declared on Member. */
export interface DashboardMember extends Member {
  created_at?: string | null;
}

export interface DashboardData {
  members: DashboardMember[];
  attendance: DashboardAttendance[];
  tasks: DashboardTask[];
  events: DashboardEvent[];
  budget: BudgetItem[];
  summary?: string;
}

export interface NextEventLabel {
  title: string;
  dateLabel: string;
}

export interface DashboardTeam {
  id: number;
  name?: string;
  number?: string | number;
}

export interface DashboardDerived {
  memberNames: Map<number | string, string>;
  todayAttendance: DashboardAttendance[];
  presentCount: number;
  activeTasks: DashboardTask[];
  overdueCount: number;
  nextEventLabel: NextEventLabel | null;
  totalBudget: number;
  myTeam: DashboardTeam | undefined;
  activityItems: ActivityItem[];
}

/** Constant-time member name lookup — replaces `members.find()` in loops. */
export function buildMemberNameMap(members: DashboardMember[]): Map<number | string, string> {
  const map = new Map<number | string, string>();
  for (const m of members) {
    if (m && m.id != null && !map.has(m.id)) map.set(m.id, m.name || 'Someone');
  }
  return map;
}

/** Same fallback semantics as the old `memberName(id)` helper. */
export function lookupMemberName(
  map: Map<number | string, string>,
  id: number | string | null | undefined,
): string {
  if (id == null) return 'Someone';
  return map.get(id) || 'Someone';
}

export function selectTodayAttendance(
  attendance: DashboardAttendance[],
  today: string,
): DashboardAttendance[] {
  return attendance.filter((r) => r.date === today);
}

export function countPresent(records: DashboardAttendance[]): number {
  let n = 0;
  for (const r of records) {
    if (r.status === 'P' || r.status === 'L') n++;
  }
  return n;
}

export function selectActiveTasks(tasks: DashboardTask[]): DashboardTask[] {
  return tasks.filter((t) => t.status !== 'done');
}

export function countOverdue(tasks: DashboardTask[], today: string): number {
  let n = 0;
  for (const t of tasks) {
    if (t.due_date && t.due_date < today) n++;
  }
  return n;
}

/**
 * Single-pass minimum by (date, start_time) — replaces filter + full sort
 * just to read element [0]. Ties keep the first row in input order, exactly
 * like the stable sort did.
 */
export function selectNextEvent(
  events: DashboardEvent[],
  today: string,
): DashboardEvent | null {
  let best: DashboardEvent | null = null;
  let bestKey = '';
  for (const e of events) {
    if (!e || !(e.date >= today)) continue;
    const key = `${e.date}T${e.start_time || ''}`;
    if (!best || key < bestKey) {
      best = e;
      bestKey = key;
    }
  }
  return best;
}

export function labelNextEvent(e: DashboardEvent, today: string): NextEventLabel {
  return {
    title: e.title,
    dateLabel:
      e.date === today
        ? `Today${e.start_time ? ` · ${e.start_time}` : ''}`
        : `${format(new Date(e.date + 'T12:00:00'), 'EEE, MMM d')}${e.start_time ? ` · ${e.start_time}` : ''}`,
  };
}

export function selectTotalBudget(budget: BudgetItem[]): number {
  let total = 0;
  for (const item of budget) {
    total += item.type === 'income' ? item.amount : -item.amount;
  }
  return total || 0;
}

export interface FeedInput {
  tasks: DashboardTask[];
  events: DashboardEvent[];
  todayAttendance: DashboardAttendance[];
  presentCount: number;
  members: DashboardMember[];
  budget: BudgetItem[];
  today: string;
  /** Milliseconds epoch for the "last 7 days" window — a parameter so tests are deterministic. */
  nowMs: number;
}

/**
 * Builds the "last 7 days" activity feed in construction order
 * (tasks, events, attendance, members, budget), parsing each timestamp once
 * and sorting on precomputed numeric keys instead of `new Date()` inside the
 * comparator.
 */
export function buildActivityFeed(input: FeedInput, limit = 12): ActivityItem[] {
  const { tasks, events, todayAttendance, presentCount, members, budget, today, nowMs } = input;
  const weekAgoMs = nowMs - 7 * 864e5;
  // Hoisted: the old code recomputed this inside the budget loop.
  const weekAgoDay = format(new Date(weekAgoMs), 'yyyy-MM-dd');
  const memberNames = buildMemberNameMap(members);

  const keyed: Array<{ item: ActivityItem; key: number }> = [];
  const push = (item: ActivityItem, ts?: string | null, dateOnly?: string) => {
    const key = ts
      ? Date.parse(ts) || 0
      : dateOnly
        ? Date.parse(`${dateOnly}T23:59:59`) || 0
        : 0;
    keyed.push({ item, key });
  };
  const recent = (ts?: string | null) => !!ts && Date.parse(ts) >= weekAgoMs;

  for (const t of tasks) {
    if (recent(t.completed_at)) {
      push(
        {
          kind: 'task',
          title: `${lookupMemberName(memberNames, t.assigned_to)} completed "${t.title}"`,
          ts: t.completed_at as string,
        },
        t.completed_at,
      );
    } else if (recent(t.created_at)) {
      push(
        {
          kind: 'task',
          title: `New task: "${t.title}"`,
          detail: t.assigned_to
            ? `Assigned to ${lookupMemberName(memberNames, t.assigned_to)}`
            : undefined,
          ts: t.created_at as string,
        },
        t.created_at,
      );
    }
  }

  for (const e of events) {
    if (recent(e.created_at)) {
      push(
        { kind: 'event', title: 'A new event was added:', detail: e.title, ts: e.created_at as string },
        e.created_at,
      );
    }
  }

  if (todayAttendance.length > 0) {
    push(
      {
        kind: 'attendance',
        title: "Attendance was recorded for today's session",
        detail: `${presentCount} of ${todayAttendance.length} ${
          todayAttendance.length === 1 ? 'member' : 'members'
        } present`,
        dateOnly: today,
      },
      undefined,
      today,
    );
  }

  for (const m of members) {
    if (recent(m.created_at)) {
      push(
        { kind: 'member', title: `${m.name} joined the team workspace`, ts: m.created_at as string },
        m.created_at,
      );
    }
  }

  for (const b of budget) {
    if (b.date && b.date >= weekAgoDay) {
      push(
        {
          kind: 'budget',
          title: `Budget ${b.type === 'income' ? 'income' : 'transaction'} added:`,
          detail: `${b.description || b.category || 'Transaction'} · $${Number(
            b.amount || 0,
          ).toLocaleString()}`,
          dateOnly: b.date,
        },
        undefined,
        b.date,
      );
    }
  }

  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, limit).map((w) => w.item);
}

export interface DeriveInput {
  data: DashboardData;
  teams: DashboardTeam[];
  teamId: number | null | undefined;
  today: string;
  nowMs: number;
}

/** Computes every derived dashboard value in a handful of single passes. */
export function deriveDashboardData(input: DeriveInput): DashboardDerived {
  const { data, teams, teamId, today, nowMs } = input;
  const members = data.members || [];
  const tasks = data.tasks || [];
  const events = data.events || [];
  const budget = data.budget || [];
  const attendance = data.attendance || [];

  const memberNames = buildMemberNameMap(members);
  const todayAttendance = selectTodayAttendance(attendance, today);
  const presentCount = countPresent(todayAttendance);
  const activeTasks = selectActiveTasks(tasks);
  const overdueCount = countOverdue(activeTasks, today);
  const next = selectNextEvent(events, today);
  const totalBudget = selectTotalBudget(budget);
  const myTeam = (teams || []).find((t) => t.id === teamId);
  const activityItems = buildActivityFeed({
    tasks,
    events,
    todayAttendance,
    presentCount,
    members,
    budget,
    today,
    nowMs,
  });

  return {
    memberNames,
    todayAttendance,
    presentCount,
    activeTasks,
    overdueCount,
    nextEventLabel: next ? labelNextEvent(next, today) : null,
    totalBudget,
    myTeam,
    activityItems,
  };
}

/**
 * Memoized dashboard derivation. Deps are the individual arrays (stable
 * across App renders) rather than the `data` object identity, which App
 * rebuilds on every render.
 */
export function useDashboardData(
  data: DashboardData,
  teams: DashboardTeam[],
  teamId: number | null | undefined,
  today: string,
): DashboardDerived {
  const members = data.members;
  const tasks = data.tasks;
  const events = data.events;
  const budget = data.budget;
  const attendance = data.attendance;
  return useMemo(
    () =>
      deriveDashboardData({
        data: { members, tasks, events, budget, attendance, summary: data.summary },
        teams,
        teamId,
        today,
        nowMs: Date.now(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, tasks, events, budget, attendance, teams, teamId, today],
  );
}
