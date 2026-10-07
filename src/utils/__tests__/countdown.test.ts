import { describe, it, expect } from 'vitest';
import { dueMoment, formatCountdown } from '../countdown';

describe('countdowns', () => {
  it('a due time is local; no time means the end of the day', () => {
    expect(dueMoment('2026-10-09', '15:30')!.getHours()).toBe(15);
    const eod = dueMoment('2026-10-09', null)!;
    expect([eod.getHours(), eod.getMinutes(), eod.getSeconds()]).toEqual([23, 59, 59]);
    expect(dueMoment('2026-10-09', '25:00')!.getHours()).toBe(23); // bad time → end of day
    expect(dueMoment('nope')).toBeNull();
  });
  it('formats to the second, with days when needed', () => {
    expect(formatCountdown(59_000)).toBe('00:00:59');
    expect(formatCountdown((3 * 3600 + 14 * 60 + 22) * 1000)).toBe('03:14:22');
    expect(formatCountdown((2 * 86400 + 5) * 1000)).toBe('2d 00:00:05');
    expect(formatCountdown(-61_000)).toBe('00:01:01'); // overdue reads as elapsed time
  });
});
