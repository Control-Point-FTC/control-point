// The completion flourish: only tasks that change to Done, and it always ends.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJustCompleted, CELEBRATE_MS } from '../pages/tasks/useJustCompleted';
import { onTimeStats } from '../../utils/taskInsights';

afterEach(() => { vi.useRealTimers(); });

describe('useJustCompleted', () => {
  it('flags a task that just moved to Done, not ones that loaded as Done, then clears', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ tasks }) => useJustCompleted(tasks), {
      initialProps: { tasks: [{ id: 1, status: 'todo' }, { id: 2, status: 'done' }] },
    });
    expect(result.current.size).toBe(0);
    rerender({ tasks: [{ id: 1, status: 'done' }, { id: 2, status: 'done' }] });
    expect([...result.current]).toEqual([1]);
    // Another change mid-flourish must not leave it stuck on.
    rerender({ tasks: [{ id: 1, status: 'done' }, { id: 2, status: 'done' }, { id: 3, status: 'todo' }] });
    act(() => { vi.advanceTimersByTime(CELEBRATE_MS + 10); });
    expect(result.current.size).toBe(0);
  });
});

describe('onTimeStats', () => {
  it('counts finished tasks with a due date in the window; on time by the local day', () => {
    const since = new Date('2026-09-15T00:00:00Z');
    const localDate = (iso: string) => iso.slice(0, 10);
    expect(onTimeStats([
      { status: 'done', due_date: '2026-10-01', completed_at: '2026-10-01T23:00:00Z' },
      { status: 'done', due_date: '2026-10-01', completed_at: '2026-10-02T01:00:00Z' },
      { status: 'done', completed_at: '2026-10-01T01:00:00Z' },
      { status: 'done', due_date: '2026-09-01', completed_at: '2026-09-01T01:00:00Z' },
      { status: 'todo', due_date: '2026-10-01' },
    ], { since, localDate })).toEqual({ onTime: 1, total: 2 });
  });
});
