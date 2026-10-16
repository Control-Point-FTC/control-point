// Timeline view: bars from start to due, one-day bars for a single date,
// undated tasks listed apart; and the board's WIP-limit helper.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TaskGantt, taskSpan } from '../pages/tasks/TaskGantt';
import { cleanWipLimits } from '../../types/taskStatus';

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
});

describe('cleanWipLimits', () => {
  it('keeps whole numbers 1–99 for To do and In progress only', () => {
    expect(cleanWipLimits({ todo: 12, 'in-progress': 4, done: 3 })).toEqual({ todo: 12, 'in-progress': 4 });
    expect(cleanWipLimits('{"in-progress": 0}')).toEqual({});
    expect(cleanWipLimits({ todo: 2.5, 'in-progress': 100 })).toEqual({});
    expect(cleanWipLimits('nope')).toEqual({});
  });
});
