import { describe, it, expect } from 'vitest';
import { addDaysISO, dueShortcuts, teamToday } from '../../utils/dueShortcuts';
import { editPayload } from '../../components/tasks/useTasksController';

describe('due shortcuts', () => {
  it('count calendar days across months and years', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysISO('2026-12-28', 7)).toBe('2027-01-04');
    expect(dueShortcuts('2026-10-16').map((d) => d.date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-23']);
  });
  it("today is the team's: 10 PM Oct 16 in New York is still the 16th", () => {
    expect(teamToday('America/New_York', new Date('2026-10-17T02:00:00Z'))).toBe('2026-10-16');
    expect(teamToday('UTC', new Date('2026-10-17T02:00:00Z'))).toBe('2026-10-17');
  });
});

describe('editPayload', () => {
  it('a due time only goes with its date; empty fields are null', () => {
    expect(editPayload({ title: 'A', due_date: '', due_time: '17:00', priority: '' }, false)).toMatchObject({ due_date: null, due_time: null, priority: null, is_board: 0 });
    expect(editPayload({ title: 'A', due_date: '2026-10-20', due_time: '17:00' }, true)).toMatchObject({ due_date: '2026-10-20', due_time: '17:00', is_board: 1 });
  });
});
