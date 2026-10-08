import { describe, it, expect } from 'vitest';
import { repeatChoiceOf, repeatFromForm, repeatError, type EventForm } from '../useCalendarController';

const form = (patch: Partial<EventForm>): EventForm => ({
  title: 'Build', description: '', date: '2026-10-10', start_time: '10:00', end_time: '', location: '', event_type: 'meeting', team_id: '',
  repeat: '', repeat_rule: null, repeat_end: 'count', repeat_count: '10', repeat_until: '', reminder: '', scope: 'one', ...patch,
});

describe('event repeat form', () => {
  it('turns the choices into a rule', () => {
    expect(repeatFromForm(form({}))).toBeNull();
    expect(repeatFromForm(form({ repeat: 'weekly', repeat_count: '4' }))).toEqual({ freq: 'weekly', interval: 1, count: 4 });
    expect(repeatFromForm(form({ repeat: 'biweekly', repeat_end: 'until', repeat_until: '2026-12-12' }))).toEqual({ freq: 'weekly', interval: 2, until: '2026-12-12' });
    expect(repeatFromForm(form({ repeat: 'custom', repeat_rule: { freq: 'daily', interval: 3, count: 5 }, repeat_count: '5' }))).toEqual({ freq: 'daily', interval: 3, count: 5 });
  });

  it('round-trips stored rules to choices', () => {
    expect(repeatChoiceOf({ freq: 'weekly', interval: 2, count: 3 })).toBe('biweekly');
    expect(repeatChoiceOf({ freq: 'daily', interval: 3, count: 3 })).toBe('custom');
    expect(repeatChoiceOf(null)).toBe('');
  });

  it('flags a bad end, but not on a series occurrence it can’t change', () => {
    expect(repeatError(form({ repeat: 'weekly', repeat_count: '1' }))).toMatch(/2 to 100/);
    expect(repeatError(form({ repeat: 'weekly', repeat_end: 'until', repeat_until: '2026-10-01' }))).toMatch(/after the first/);
    expect(repeatError(form({ repeat: 'weekly', repeat_end: 'until', repeat_until: '' }))).toMatch(/last date/);
    const last = { series_id: 1, recurrence: '{"freq":"weekly","interval":1,"until":"2026-10-10"}' };
    const f = form({ repeat: 'weekly', repeat_end: 'until', repeat_until: '2026-10-10' });
    expect(repeatError(f, last)).toBeNull();
    expect(repeatError({ ...f, scope: 'following' }, last)).toBeNull();
    expect(repeatError({ ...f, scope: 'following', repeat_until: '2026-10-03' }, last)).toMatch(/after the first/);
  });
});
