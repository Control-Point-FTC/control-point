import { describe, it, expect } from 'vitest';
import {
  readEventRepeat, seriesDates, repeatLabel, cleanReminder, zonedToUtcMs, reminderDueMs, reminderText,
  MAX_OCCURRENCES,
} from '../eventSeries';

describe('readEventRepeat', () => {
  it('accepts count or until, defaults to 10 times, rejects junk', () => {
    expect(readEventRepeat({ freq: 'weekly', interval: 1 })).toEqual({ freq: 'weekly', interval: 1, count: 10 });
    expect(readEventRepeat('{"freq":"daily","interval":2,"count":5}')).toEqual({ freq: 'daily', interval: 2, count: 5 });
    expect(readEventRepeat({ freq: 'monthly', interval: 1, until: '2027-01-31' })).toEqual({ freq: 'monthly', interval: 1, until: '2027-01-31' });
    expect(readEventRepeat({ freq: 'weekly', count: 5000 })?.count).toBe(MAX_OCCURRENCES);
    expect(readEventRepeat({ freq: 'weekly', until: '2027-02-30' })?.until).toBeUndefined();
    expect(readEventRepeat({ freq: 'yearly' })).toBeNull();
    expect(readEventRepeat('not json')).toBeNull();
    expect(readEventRepeat(null)).toBeNull();
  });
});

describe('seriesDates', () => {
  it('weekly, by count', () => {
    expect(seriesDates('2026-10-10', { freq: 'weekly', interval: 1, count: 4 })).toEqual(['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
  });
  it('every 2 days until a date (inclusive)', () => {
    expect(seriesDates('2026-10-01', { freq: 'daily', interval: 2, until: '2026-10-07' })).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07']);
  });
  it('monthly keeps the day, clamped to short months', () => {
    expect(seriesDates('2027-01-31', { freq: 'monthly', interval: 1, count: 3 })).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
  it('is capped by count and by a year', () => {
    expect(seriesDates('2026-01-01', { freq: 'daily', interval: 1, until: '2030-01-01' })).toHaveLength(MAX_OCCURRENCES);
    const weekly = seriesDates('2026-01-01', { freq: 'weekly', interval: 1, until: '2030-01-01' });
    expect(weekly.at(-1)! <= '2027-01-02').toBe(true);
  });
  it('labels', () => {
    expect(repeatLabel({ freq: 'weekly', interval: 1, count: 10 })).toBe('Every week, 10 times');
    expect(repeatLabel({ freq: 'weekly', interval: 2, until: '2026-12-12' })).toMatch(/^Every 2 weeks until /);
  });
});

describe('reminders', () => {
  it('only known lead times', () => {
    expect(cleanReminder(30)).toBe(30);
    expect(cleanReminder('1440')).toBe(1440);
    expect(cleanReminder(31)).toBeNull();
    expect(cleanReminder('')).toBeNull();
    expect(cleanReminder(null)).toBeNull();
  });
  it('converts team wall-clock time to UTC across DST', () => {
    // EDT (UTC-4) in October, EST (UTC-5) in December.
    expect(new Date(zonedToUtcMs('2026-10-10', '18:00', 'America/New_York')).toISOString()).toBe('2026-10-10T22:00:00.000Z');
    expect(new Date(zonedToUtcMs('2026-12-10', '18:00', 'America/New_York')).toISOString()).toBe('2026-12-10T23:00:00.000Z');
    expect(new Date(zonedToUtcMs('2026-10-10', '09:00', 'Asia/Kolkata')).toISOString()).toBe('2026-10-10T03:30:00.000Z');
  });
  it('due time = start minus lead; all-day counts from 9am', () => {
    const tz = 'America/New_York';
    expect(new Date(reminderDueMs({ date: '2026-10-10', start_time: '18:00', reminder_minutes: 30 }, tz)!).toISOString()).toBe('2026-10-10T21:30:00.000Z');
    expect(new Date(reminderDueMs({ date: '2026-10-10', start_time: '', reminder_minutes: 1440 }, tz)!).toISOString()).toBe('2026-10-09T13:00:00.000Z');
    expect(reminderDueMs({ date: '2026-10-10', start_time: '18:00', reminder_minutes: null }, tz)).toBeNull();
  });
  it('reads naturally', () => {
    expect(reminderText({ title: 'Build', start_time: '18:00', reminder_minutes: 30 })).toBe('Reminder: Build starts in 30 minutes');
    expect(reminderText({ title: 'Build', start_time: '18:00', reminder_minutes: 120 })).toBe('Reminder: Build starts in 2 hours');
    expect(reminderText({ title: 'Qualifier', start_time: '', reminder_minutes: 1440 })).toBe('Reminder: Qualifier is tomorrow');
  });
});
