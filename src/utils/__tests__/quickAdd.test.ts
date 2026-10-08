import { describe, it, expect } from 'vitest';
import { nextOccurrence, parseQuickAdd, readRecurrence, recurrenceLabel } from '../quickAdd';

// Thursday 8 October 2026.
const TODAY = '2026-10-08';
const roster = ['Arnav Patel', 'Ada Lovelace', 'Grace Hopper', 'Max'];
const p = (s: string) => parseQuickAdd(s, TODAY, roster);

describe('parseQuickAdd', () => {
  it('splits the tracker example into real fields (no leftovers in the title)', () => {
    const r = p('Create a task to test autonomous paths, high priority, assign to Arnav, due next Thursday at 4:30pm');
    expect(r).toMatchObject({
      title: 'Test autonomous paths', priority: 'high', assignees: ['Arnav Patel'], due_date: '2026-10-15', due_time: '16:30',
    });
  });

  it('reads times in the usual forms', () => {
    expect(p('Charge batteries tomorrow 5pm')).toMatchObject({ title: 'Charge batteries', due_date: '2026-10-09', due_time: '17:00' });
    expect(p('Standup at 16:45')).toMatchObject({ title: 'Standup', due_date: TODAY, due_time: '16:45' });
    expect(p('Lunch order at noon friday')).toMatchObject({ due_date: '2026-10-09', due_time: '12:00' });
    expect(p('Pack the pit at 4')).toMatchObject({ due_time: '16:00' });
    expect(p('Open the lab at 9am Saturday')).toMatchObject({ due_date: '2026-10-10', due_time: '09:00' });
    expect(p('Build session Saturday 10am to 4pm')).toMatchObject({ title: 'Build session', due_date: '2026-10-10', due_time: '10:00', end_time: '16:00' });
    expect(p('Drive practice 3-5pm tomorrow')).toMatchObject({ due_time: '15:00', end_time: '17:00', due_date: '2026-10-09' });
  });

  it('reads dates', () => {
    expect(p('Final CAD due friday').due_date).toBe('2026-10-09');
    expect(p('Final CAD due thursday').due_date).toBe(TODAY);
    expect(p('Final CAD next thursday').due_date).toBe('2026-10-15');
    expect(p('Order parts in 2 weeks').due_date).toBe('2026-10-22');
    expect(p('Qualifier on Dec 12').due_date).toBe('2026-12-12');
    expect(p('Kickoff 12th of September').due_date).toBe('2027-09-12');
    expect(p('Banquet 10/20').due_date).toBe('2026-10-20');
    expect(p('Report 2026-11-03').due_date).toBe('2026-11-03');
    expect(p('Wrap up next week').due_date).toBe('2026-10-15');
  });

  it('reads priority and repeat', () => {
    expect(p('Fix the intake urgent')).toMatchObject({ title: 'Fix the intake', priority: 'urgent' });
    expect(p('Clean the lab, low priority')).toMatchObject({ title: 'Clean the lab', priority: 'low' });
    expect(p('Weekly build session every Saturday at 10am')).toMatchObject({
      recurrence: { freq: 'weekly', interval: 1 }, due_date: '2026-10-10', due_time: '10:00',
    });
    expect(p('Check inventory every 2 weeks').recurrence).toEqual({ freq: 'weekly', interval: 2 });
    expect(p('Water the plants daily').recurrence).toEqual({ freq: 'daily', interval: 1 });
    expect(p('Dues reminder monthly').recurrence).toEqual({ freq: 'monthly', interval: 1 });
  });

  it('only takes assignees from the roster', () => {
    expect(p('Wire hub @Ada and assign to Grace').assignees.sort()).toEqual(['Ada Lovelace', 'Grace Hopper']);
    expect(p('Thank-you note for Bob').assignees).toEqual([]);
    expect(p('Thank-you note for Bob').title).toBe('Thank-you note for Bob');
    expect(p('Wire hub, assign to Max and Ada')).toMatchObject({ title: 'Wire hub', assignees: ['Max', 'Ada Lovelace'] });
  });

  it('review cases: assignee then a date, morning 24-hour times, default dates are marked', () => {
    expect(p('Wire hub assign to Ada tomorrow at noon')).toMatchObject({ title: 'Wire hub', assignees: ['Ada Lovelace'], due_date: '2026-10-09', due_time: '12:00' });
    expect(p('Wire hub, assign to Ada Lovelace and Max, friday')).toMatchObject({ title: 'Wire hub', assignees: ['Ada Lovelace', 'Max'], due_date: '2026-10-09' });
    expect(p('Open lab at 06:30').due_time).toBe('06:30');
    expect(p('Open lab at 18:30').due_time).toBe('18:30');
    expect(p('Open lab at 6:30').due_time).toBe('18:30');
    expect(p('Drive practice 07:00-09:00 saturday')).toMatchObject({ due_time: '07:00', end_time: '09:00' });
    const weekend = p('Finish CAD this weekend at 4:30pm');
    expect(weekend).toMatchObject({ due_time: '16:30', due_date: TODAY, date_is_default: true });
    expect(p('Finish CAD friday at 4:30pm').date_is_default).toBeFalsy();
  });

  it('leaves plain text alone', () => {
    expect(p('Write the judge presentation script')).toEqual({
      title: 'Write the judge presentation script', due_date: null, due_time: null, end_time: null, priority: null, recurrence: null, assignees: [],
    });
    // A number that isn't a time stays in the title.
    expect(p('Print 12 brackets').title).toBe('Print 12 brackets');
  });
});

describe('recurrence helpers', () => {
  it('advances dates', () => {
    expect(nextOccurrence('2026-10-08', { freq: 'daily', interval: 1 })).toBe('2026-10-09');
    expect(nextOccurrence('2026-10-08', { freq: 'weekly', interval: 2 })).toBe('2026-10-22');
    expect(nextOccurrence('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28');
  });
  it('reads stored values and labels them', () => {
    expect(readRecurrence('{"freq":"weekly","interval":1}')).toEqual({ freq: 'weekly', interval: 1 });
    expect(readRecurrence('nope')).toBeNull();
    expect(readRecurrence({ freq: 'yearly' })).toBeNull();
    expect(recurrenceLabel({ freq: 'weekly', interval: 2 })).toBe('Every 2 weeks');
    expect(recurrenceLabel({ freq: 'daily', interval: 1 })).toBe('Every day');
  });
});
