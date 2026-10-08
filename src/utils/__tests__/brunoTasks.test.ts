import { describe, it, expect } from 'vitest';
import { normalizeBrunoTask, rosterMatch, recoverEventTime } from '../brunoTasks';

const roster = ['Arnav Patel', 'Ada Lovelace', 'Grace Hopper'];
const today = '2026-10-08'; // a Thursday

describe('Bruno task fields', () => {
  it('the reported bug: priority and assignee dumped in the description, time dropped', () => {
    const t = normalizeBrunoTask({
      title: 'Test autonomous paths',
      description: 'High priority task to test autonomous paths (Assigned to Arnav). Due next Thursday at 4:30pm.',
      due_date: '2026-10-15',
    }, today, roster);
    expect(t).toMatchObject({ title: 'Test autonomous paths', due_date: '2026-10-15', due_time: '16:30', priority: 'high', assignees: ['Arnav Patel'] });
    expect(t.description).not.toMatch(/priority|assigned|4:30/i);
  });

  it('uses the fields the model filled in, resolving names to the roster', () => {
    const t = normalizeBrunoTask({ title: 'Charge batteries', due_date: '2026-10-10', due_time: '18:00', priority: 'URGENT', assignees: ['ada', 'Grace Hopper', 'Nobody'], repeat: 'weekly' }, today, roster);
    expect(t).toEqual({ title: 'Charge batteries', description: '', due_date: '2026-10-10', due_time: '18:00', priority: 'urgent', recurrence: { freq: 'weekly', interval: 1 }, assignees: ['Ada Lovelace', 'Grace Hopper'], unmatched: ['Nobody'] });
  });

  it('reads fields the model left in the title', () => {
    const t = normalizeBrunoTask({ title: 'Order wheels, high priority, assign to Grace, due Friday at noon, every week' }, today, roster);
    expect(t).toMatchObject({ title: 'Order wheels', due_date: '2026-10-09', due_time: '12:00', priority: 'high', assignees: ['Grace Hopper'], recurrence: { freq: 'weekly', interval: 1 } });
  });

  it('a bare time means today; plain text is left alone', () => {
    expect(normalizeBrunoTask({ title: 'Pit check', due_time: '15:00' }, today, roster)).toMatchObject({ due_date: today, due_time: '15:00' });
    const plain = normalizeBrunoTask({ title: 'Design the intake', description: 'Use the 3D-printed rollers from last season.' }, today, roster);
    expect(plain).toMatchObject({ title: 'Design the intake', description: 'Use the 3D-printed rollers from last season.', due_date: null, due_time: null, priority: null, assignees: [] });
  });

  it('roster matching', () => {
    expect(rosterMatch('@arnav', roster)).toBe('Arnav Patel');
    expect(rosterMatch('ADA LOVELACE', roster)).toBe('Ada Lovelace');
    expect(rosterMatch('Zed', roster)).toBeNull();
  });
});

describe('Bruno event times', () => {
  it('moves a time left in the title or notes into the time fields', () => {
    expect(recoverEventTime({ title: 'Parent meeting at 6pm', notes: '', date: '2026-10-10' })).toMatchObject({ title: 'Parent meeting', time: '18:00' });
    expect(recoverEventTime({ title: 'Build session', notes: 'From 3-5pm in the shop', date: '2026-10-10' })).toMatchObject({ time: '15:00', end: '17:00' });
    const kept = { title: 'Qualifier', notes: 'Bring the robot', date: '2026-12-12', time: '' };
    expect(recoverEventTime(kept)).toBe(kept);
    expect(recoverEventTime({ title: 'Scrim', time: '10:00', date: '2026-10-10' }).time).toBe('10:00');
  });
});

describe('Greptile review on #119', () => {
  it('ordinary context never becomes a field (a one-off task stays one-off)', () => {
    const t = normalizeBrunoTask({ title: 'Review attendance', description: 'Use the weekly attendance report from Saturday.' }, today, roster);
    expect(t).toMatchObject({ title: 'Review attendance', description: 'Use the weekly attendance report from Saturday.', recurrence: null, due_date: null });
    const w = normalizeBrunoTask({ title: 'Weekly build log' }, today, roster);
    expect(w).toMatchObject({ title: 'Weekly build log', recurrence: null });
  });

  it('a shared first name assigns nobody and is reported', () => {
    const team = ['Alex Smith', 'Alex Jones', 'Ada Lovelace'];
    expect(rosterMatch('Alex', team)).toBeNull();
    expect(rosterMatch('Alex Jones', team)).toBe('Alex Jones');
    const t = normalizeBrunoTask({ title: 'Wire the hub', assignees: ['Alex'], description: 'Assign to Alex.' }, today, team);
    expect(t.assignees).toEqual([]);
    expect(t.unmatched).toEqual(['Alex']);
  });

  it('the server path (fromText: false) saves only explicit fields', () => {
    const t = normalizeBrunoTask({ title: 'Test paths', description: 'High priority (Assigned to Arnav). Due at 4:30pm.', assignees: ['arnav'] }, today, roster, { fromText: false });
    expect(t).toMatchObject({ description: 'High priority (Assigned to Arnav). Due at 4:30pm.', priority: null, due_time: null, assignees: ['Arnav Patel'] });
  });

  it('event time recovery removes only the time phrase', () => {
    expect(recoverEventTime({ title: 'Monthly status meeting at 9am', date: '2026-10-10' })).toMatchObject({ title: 'Monthly status meeting', time: '09:00' });
    expect(recoverEventTime({ title: 'Scrimmage', notes: 'High priority: bring batteries, 1-3pm', date: '2026-10-10' })).toMatchObject({ notes: 'High priority: bring batteries,', time: '13:00', end: '15:00' });
  });
});

describe('Greptile round 2 on #119', () => {
  it('names after "assign to" stay with it', () => {
    const t = normalizeBrunoTask({ title: 'Wire the hub, assign to Ada, Grace' }, today, roster);
    expect(t).toMatchObject({ title: 'Wire the hub', assignees: ['Ada Lovelace', 'Grace Hopper'] });
    const u = normalizeBrunoTask({ title: 'Wire the hub, assign to Ada and Grace, high priority' }, today, roster);
    expect(u).toMatchObject({ title: 'Wire the hub', assignees: ['Ada Lovelace', 'Grace Hopper'], priority: 'high' });
  });

  it('context sentences that merely mention a keyword stay context', () => {
    const t = normalizeBrunoTask({ title: 'Plan practice', description: 'We meet every week to review the robot. Due to rain we moved it inside.' }, today, roster);
    expect(t).toMatchObject({ description: 'We meet every week to review the robot. Due to rain we moved it inside.', recurrence: null, due_date: null });
  });

  it('24-hour event ranges are recovered', () => {
    expect(recoverEventTime({ title: 'Build session', notes: 'From 15:00 to 17:00 in the shop', date: '2026-10-10' })).toMatchObject({ time: '15:00', end: '17:00', notes: 'in the shop' });
  });
});
