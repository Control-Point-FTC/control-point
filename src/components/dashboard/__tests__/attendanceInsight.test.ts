import { describe, it, expect } from 'vitest';
import { attendanceInsight } from '../attendanceInsight';

const members = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }, { id: 3, name: 'Linus' }];
const rec = (member_id: number, date: string, status: string) => ({ member_id, date, status });

describe('attendance insight', () => {
  const records = [
    // last week
    rec(1, '2026-09-29', 'P'), rec(2, '2026-09-29', 'P'), rec(3, '2026-09-29', 'A'),
    // this week
    rec(1, '2026-10-02', 'P'), rec(2, '2026-10-02', 'A'), rec(3, '2026-10-02', 'P'),
    rec(1, '2026-10-05', 'L'), rec(2, '2026-10-05', 'A'), rec(3, '2026-10-05', 'E'),
    rec(1, '2026-10-07', 'P'), /* Grace: no record = miss */ rec(3, '2026-10-07', 'P'),
  ];

  it('rates this week vs last week (excused days not counted)', () => {
    const r = attendanceInsight(records, members, [], '2026-10-07');
    // this week: 3 days × 3 members − 1 excused = 8 counted; attended: Ada×3, Linus×2 = 5
    expect(r.thisWeekRate).toBe(Math.round((5 / 8) * 100));
    expect(r.lastWeekRate).toBe(67);
  });

  it('flags 2+ misses in a row and finds the best streak (excused skipped)', () => {
    const r = attendanceInsight(records, members, [], '2026-10-07');
    expect(r.missingInARow).toEqual([{ id: 2, name: 'Grace', misses: 3 }]);
    expect(r.bestStreak).toEqual({ id: 1, name: 'Ada', days: 4 });
  });

  it('hidden dates and future dates are ignored', () => {
    const r = attendanceInsight([...records, rec(2, '2026-10-08', 'P')], members, ['2026-10-07'], '2026-10-07');
    expect(r.missingInARow.find((m) => m.id === 2)?.misses).toBe(2);
  });

  it('no data: nothing to say', () => {
    expect(attendanceInsight([], members, [], '2026-10-07')).toEqual({ thisWeekRate: null, lastWeekRate: null, missingInARow: [], bestStreak: null });
  });
});
