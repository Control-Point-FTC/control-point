import { describe, it, expect } from 'vitest';
import { nextMeetDate } from '../AttendanceTrend';

describe('nextMeetDate', () => {
  const today = '2026-10-05';
  it('picks the earliest event after today', () => {
    expect(nextMeetDate([{ date: '2026-10-20' }, { date: '2026-10-09' }, { date: '2026-10-12' }], today)).toBe('2026-10-09');
  });
  it('ignores today and past events', () => {
    expect(nextMeetDate([{ date: '2026-10-05' }, { date: '2026-09-30' }, { date: '2026-10-06' }], today)).toBe('2026-10-06');
  });
  it('returns null with no upcoming events, no events, or missing dates', () => {
    expect(nextMeetDate([{ date: '2026-10-01' }], today)).toBeNull();
    expect(nextMeetDate([], today)).toBeNull();
    expect(nextMeetDate(undefined, today)).toBeNull();
    expect(nextMeetDate([{ date: null }, {}], today)).toBeNull();
  });
});
