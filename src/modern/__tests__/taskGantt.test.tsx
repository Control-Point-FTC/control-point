// Timeline view: bars from start to due, one-day bars for a single date,
// undated tasks listed apart; and the board's WIP-limit helper.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TaskGantt, taskSpan } from '../pages/tasks/TaskGantt';
import { cleanWipLimits, strictWipLimits } from '../../types/taskStatus';

afterEach(cleanup);

describe('taskSpan', () => {
  it('start → due, a single date as one day, swapped dates fixed, none → null', () => {
    expect(taskSpan({ start_date: '2026-10-12', due_date: '2026-10-16' })!.to.getDate()).toBe(16);
    const one = taskSpan({ due_date: '2026-10-20' })!;
    expect(one.from.getTime()).toBe(one.to.getTime());
    const swapped = taskSpan({ start_date: '2026-10-20', due_date: '2026-10-18' })!;
    expect(swapped.from.getDate()).toBe(18);
    expect(taskSpan({})).toBeNull();
  });
});

describe('TaskGantt', () => {
  it('draws dated tasks in the window and lists undated ones; clicking opens the task', () => {
    const onOpen = vi.fn();
    const today = new Date('2026-10-16T12:00:00');
    render(<TaskGantt today={today} onOpen={onOpen} tasks={[
      { id: 1, title: 'Prototype intake', status: 'in-progress', start_date: '2026-10-14', due_date: '2026-10-21' },
      { id: 2, title: 'Far future', status: 'todo', due_date: '2027-03-01' },
      { id: 3, title: 'Someday', status: 'todo' },
    ]} />);
    const bar = screen.getByRole('button', { name: /Prototype intake, Oct 14 to Oct 21, In progress/ });
    fireEvent.click(bar);
    expect(onOpen).toHaveBeenCalledWith(1);
    expect(screen.queryByText('Far future')).toBeNull();
    expect(screen.getByRole('region', { name: 'Tasks without dates' })).toHaveTextContent('Someday');
  });

  it('keeps a task due on the last shown day, and reveals more undated tasks on demand', () => {
    const today = new Date('2026-10-16T12:00:00');
    // Window: Mon Oct 5 for 6 weeks → last day Sun Nov 15.
    const undated = Array.from({ length: 65 }, (_, i) => ({ id: 100 + i, title: `Loose ${i}`, status: 'todo' }));
    render(<TaskGantt today={today} onOpen={() => {}} tasks={[
      { id: 1, title: 'Last day', status: 'todo', due_date: '2026-11-15' },
      { id: 2, title: 'Day after', status: 'todo', due_date: '2026-11-16' },
      ...undated,
    ]} />);
    expect(screen.getByRole('button', { name: /Last day, Nov 15/ })).toBeTruthy();
    expect(screen.queryByText('Day after')).toBeNull();
    expect(screen.queryByText('Loose 64')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more' }));
    expect(screen.getByText('Loose 64')).toBeTruthy();
  });
});

describe('strictWipLimits', () => {
  it('refuses anything invalid instead of clearing; null or {} clears', () => {
    expect(strictWipLimits(null)).toEqual({});
    expect(strictWipLimits({})).toEqual({});
    expect(strictWipLimits({ todo: 3, 'in-progress': null })).toEqual({ todo: 3 });
    expect(strictWipLimits({ todo: 100 })).toBeNull();
    expect(strictWipLimits({ done: 3 })).toBeNull();
    expect(strictWipLimits(false)).toBeNull();
    expect(strictWipLimits([])).toBeNull();
  });
});

describe('cleanWipLimits', () => {
  it('keeps whole numbers 1–99 for To do and In progress only', () => {
    expect(cleanWipLimits({ todo: 12, 'in-progress': 4, done: 3 })).toEqual({ todo: 12, 'in-progress': 4 });
    expect(cleanWipLimits('{"in-progress": 0}')).toEqual({});
    expect(cleanWipLimits({ todo: 2.5, 'in-progress': 100 })).toEqual({});
    expect(cleanWipLimits('nope')).toEqual({});
  });
});
