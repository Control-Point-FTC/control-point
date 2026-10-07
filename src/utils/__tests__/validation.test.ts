import { describe, it, expect } from 'vitest';
import {
  isIsoDate, eventTimeError, eventError, parseMoney, formatMoney, formatMoneyCompact, budgetEntryFrom,
  attendanceMarkError, addDaysIso, latestTodayOnEarth, earliestTodayOnEarth, MONEY_MAX,
} from '../validation';

describe('isIsoDate', () => {
  it('accepts real dates and rejects impossible or malformed ones', () => {
    expect(isIsoDate('2026-10-06')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '10/06/2026', '', null, 20261006]) expect(isIsoDate(bad)).toBe(false);
  });
});

describe('eventTimeError (H-1)', () => {
  it('rejects an end before or equal to the start', () => {
    expect(eventTimeError('15:59', '04:59')).toMatch(/after the start/);
    expect(eventTimeError('10:00', '10:00')).toMatch(/after the start/);
  });
  it('clears as soon as the times are corrected', () => {
    expect(eventTimeError('15:59', '16:59')).toBeNull();
  });
  it('allows no times or a start only; an end needs a start', () => {
    expect(eventTimeError('', '')).toBeNull();
    expect(eventTimeError('09:00', '')).toBeNull();
    expect(eventTimeError('', '10:00')).toMatch(/start time/);
  });
  it('rejects malformed times', () => {
    expect(eventTimeError('25:00', '')).not.toBeNull();
    expect(eventTimeError('9am', '')).not.toBeNull();
  });
  it('eventError covers title and date too', () => {
    expect(eventError({ title: '  ', date: '2026-10-06' })).toMatch(/Title/);
    expect(eventError({ title: 'x'.repeat(201), date: '2026-10-06' })).toMatch(/200/);
    expect(eventError({ title: 'Practice', date: '2026-02-30' })).toMatch(/date/);
    expect(eventError({ title: 'Practice', date: '2026-10-06', start_time: '14:00', end_time: '16:00' })).toBeNull();
  });
});

describe('parseMoney (M-1 / H-6)', () => {
  it('rounds to cents and accepts formatted input', () => {
    expect(parseMoney('1,234.567')).toEqual({ ok: true, value: 1234.57 });
    expect(parseMoney('$15')).toEqual({ ok: true, value: 15 });
    expect(parseMoney(0.01)).toEqual({ ok: true, value: 0.01 });
  });
  it('rejects zero, negatives, junk and absurd magnitudes on either sign', () => {
    for (const bad of [0, -5, '-1000000000000', 'abc', '', null, NaN, Infinity, 999999999999.99, MONEY_MAX + 0.01, '1e30', 0.004]) {
      expect(parseMoney(bad as any).ok).toBe(false);
    }
  });
  it('allows exactly the cap', () => {
    expect(parseMoney(MONEY_MAX)).toEqual({ ok: true, value: MONEY_MAX });
  });
});

describe('money formatting', () => {
  it('formats a single $ (L-1 "$$")', () => {
    expect(formatMoney(1500)).toBe('$1,500');
    expect(formatMoney(12.5)).toBe('$12.50');
    expect(formatMoney(-3)).toBe('-$3');
  });
  it('compact axis labels scale instead of "$1000000000k"', () => {
    expect(formatMoneyCompact(950)).toBe('$950');
    expect(formatMoneyCompact(1200)).toBe('$1.2k');
    expect(formatMoneyCompact(3_400_000)).toBe('$3.4M');
    expect(formatMoneyCompact(999_999_999_999.99)).toBe('$1000B');
    expect(formatMoneyCompact(-2500)).toBe('-$2.5k');
  });
});

describe('budgetEntryFrom', () => {
  const base = { type: 'expense', amount: '20', category: 'Parts', description: 'Motors', date: '2026-10-06' };
  it('accepts a valid entry and cleans it', () => {
    expect(budgetEntryFrom(base, null)).toEqual({ type: 'expense', amount: 20, category: 'Parts', description: 'Motors', date: '2026-10-06' });
  });
  it('validates the merged result on update', () => {
    const existing = { type: 'income', amount: 50, category: 'Sponsor', description: '', date: '2026-09-01' } as const;
    expect(budgetEntryFrom({ amount: 75 }, existing)).toMatchObject({ type: 'income', amount: 75, date: '2026-09-01' });
    expect(budgetEntryFrom({ amount: -1 }, existing)).toHaveProperty('error');
    expect(budgetEntryFrom({ type: 'gift' }, existing)).toHaveProperty('error');
  });
  it('rejects bad dates and over-long text', () => {
    expect(budgetEntryFrom({ ...base, date: 'tomorrow' }, null)).toHaveProperty('error');
    expect(budgetEntryFrom({ ...base, category: 'x'.repeat(81) }, null)).toHaveProperty('error');
  });
});

describe('attendanceMarkError (L-4)', () => {
  it('allows any status today or in the past', () => {
    expect(attendanceMarkError('2026-10-06', 'P', '2026-10-06')).toBeNull();
    expect(attendanceMarkError('2026-09-01', 'U', '2026-10-06')).toBeNull();
  });
  it('allows only Excused / School event on future days', () => {
    expect(attendanceMarkError('2026-10-07', 'P', '2026-10-06')).toMatch(/Future/);
    expect(attendanceMarkError('2026-10-07', 'E', '2026-10-06')).toBeNull();
    expect(attendanceMarkError('2026-10-07', 'S', '2026-10-06')).toBeNull();
  });
  it('rejects unknown codes and bad dates', () => {
    expect(attendanceMarkError('2026-10-06', 'X', '2026-10-06')).not.toBeNull();
    expect(attendanceMarkError('nope', 'P', '2026-10-06')).not.toBeNull();
  });
});

describe('date helpers', () => {
  it('addDaysIso crosses month and year boundaries', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('the timezone window brackets every local "today"', () => {
    const now = new Date('2026-10-06T23:30:00Z');
    expect(latestTodayOnEarth(now)).toBe('2026-10-07');
    expect(earliestTodayOnEarth(now)).toBe('2026-10-06');
  });
});
