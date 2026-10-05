import { describe, it, expect } from 'vitest';
import type { FtcEventFull, FtcMatchFull, FtcPointSplit, FtcTeamEventStats, ShortlistEntry } from '../../types/ftcScout';
import {
  winRate, percentile, mean, perspective, teamMatches, recordOf, eventAverages, componentRank,
  strengthsWeaknesses, seasonTrend, trendDirection, partnersAndOpponents, partnerFit,
  scoutingPriorities, missingFields,
} from '../ftcAnalysis';

const split = (o: Partial<FtcPointSplit>): FtcPointSplit => ({ total: null, totalNp: null, auto: null, teleop: null, endgame: null, penaltiesCommitted: null, penaltiesByOpp: null, ...o });

function team(n: number, o: Partial<FtcTeamEventStats> = {}): FtcTeamEventStats {
  return { teamNumber: n, name: `Team ${n}`, rank: null, rp: null, wins: null, losses: null, ties: null, qualMatchesPlayed: 5, opr: null, avg: null, awards: [], ...o };
}

function match(key: string, red: number[], blue: number[], rs: number | null, bs: number | null, extra: { redPen?: number; bluePen?: number } = {}): FtcMatchFull {
  const [level, series, number] = key.split(':');
  const played = rs != null && bs != null;
  return {
    key, level: level as 'qual' | 'playoff', series: Number(series), number: Number(number), label: key, description: null, time: null, played,
    red: { teams: red.map((n) => ({ number: n, name: `Team ${n}` })), score: played ? split({ total: rs, penaltiesCommitted: extra.redPen ?? 0 }) : null },
    blue: { teams: blue.map((n) => ({ number: n, name: `Team ${n}` })), score: played ? split({ total: bs, penaltiesCommitted: extra.bluePen ?? 0 }) : null },
    breakdownSource: played ? 'first-events' : null,
  };
}

function event(code: string, matches: FtcMatchFull[], field: FtcTeamEventStats[] = []): FtcEventFull {
  return { code, season: 2025, name: code, type: null, start: null, end: null, venue: null, city: null, state: null, country: null, field, matches, alliances: [], source: 'first-events', fetchedAt: '2026-10-05T10:00:00Z' };
}

describe('basic stats', () => {
  it('winRate counts ties as half', () => {
    expect(winRate(4, 1, 0)).toBe(80);
    expect(winRate(1, 1, 2)).toBe(50);
    expect(winRate(0, 0, 0)).toBeNull();
    expect(winRate(null, null, null)).toBeNull();
  });
  it('percentile', () => {
    expect(percentile(1, 100)).toBe(100);
    expect(percentile(616, 8868)).toBe(93);
    expect(percentile(null, 100)).toBeNull();
    expect(percentile(5, 0)).toBeNull();
  });
  it('mean ignores nulls', () => {
    expect(mean([1, null, 2, undefined])).toBe(1.5);
    expect(mean([null])).toBeNull();
  });
});

describe('match perspective', () => {
  const m = match('qual:0:1', [14481, 4215], [17670, 23786], 171, 242, { redPen: 15 });
  it('scores and result from the selected team\'s side', () => {
    const p = perspective(m, 4215)!;
    expect(p).toMatchObject({ alliance: 'red', result: 'loss', scoreFor: 171, scoreAgainst: 242, penaltiesCommitted: 15, partners: [14481], opponents: [17670, 23786] });
    expect(perspective(m, 17670)!.result).toBe('win');
    expect(perspective(m, 1)).toBeNull();
  });
  it('unplayed matches have no result', () => {
    expect(perspective(match('qual:0:2', [4215], [1], null, null), 4215)!.result).toBeNull();
  });
  it('recordOf counts W-L-T and win rate', () => {
    const ev = event('E', [m, match('qual:0:2', [4215], [1], 100, 90), match('qual:0:3', [4215], [2], 50, 50), match('qual:0:4', [4215], [3], null, null)]);
    expect(recordOf(teamMatches(ev, 4215))).toEqual({ wins: 1, losses: 1, ties: 1, played: 3, winRate: 50 });
  });
});

describe('event field context', () => {
  const field = [
    team(1, { rank: 1, opr: split({ totalNp: 120, auto: 40, teleop: 70, endgame: 10 }), avg: split({ total: 200, penaltiesCommitted: 2 }), rp: 5 }),
    team(2, { rank: 2, opr: split({ totalNp: 80, auto: 10, teleop: 60, endgame: 10 }), avg: split({ total: 150, penaltiesCommitted: 20 }), rp: 4 }),
    team(3, { rank: 3, opr: split({ totalNp: 40, auto: 10, teleop: 25, endgame: 5 }), avg: split({ total: 100, penaltiesCommitted: 8 }), rp: 3 }),
    team(4, { rank: 4 }),
  ];
  it('eventAverages averages available values only', () => {
    const a = eventAverages(field);
    expect(a.teams).toBe(4);
    expect(a.opr).toEqual({ totalNp: 80, auto: 20, teleop: 51.7, endgame: 8.3 });
    expect(a.avgScore).toBe(150);
    expect(a.avgPenaltiesCommitted).toBe(10);
    expect(a.rp).toBe(4);
  });
  it('componentRank ranks within the field', () => {
    expect(componentRank(field, 1, 'auto')).toBe(1);
    expect(componentRank(field, 3, 'teleop')).toBe(3);
    expect(componentRank(field, 4, 'auto')).toBeNull();
  });
  it('strengthsWeaknesses measures one team against the event average', () => {
    const avg = eventAverages(field);
    expect(strengthsWeaknesses(field[0], avg).map((t) => t.label)).toEqual(['Strong autonomous', 'Strong teleop', 'Strong endgame', 'Clean play']);
    expect(strengthsWeaknesses(field[1], avg).map((t) => t.label)).toContain('High penalties');
    expect(strengthsWeaknesses(field[2], avg).filter((t) => t.kind === 'weakness').map((t) => t.label)).toEqual(['Weak autonomous', 'Weak teleop', 'Weak endgame']);
    expect(strengthsWeaknesses(field[3], avg)).toEqual([]);
  });
  it('missingFields lists gaps', () => {
    expect(missingFields(null)).toEqual(['all event stats']);
    expect(missingFields(field[3])).toEqual(['W-L-T record', 'ranking points', 'OPR', 'average score / penalties']);
    expect(missingFields(field[0])).toEqual(['W-L-T record']);
  });
});

describe('season trend', () => {
  it('orders events by date and derives win rate', () => {
    const t = seasonTrend([
      { code: 'B', name: 'B', date: '2026-02-01', type: null, city: null, state: null, stats: team(1, { wins: 4, losses: 1, ties: 0, opr: split({ totalNp: 90 }) }) },
      { code: 'A', name: 'A', date: '2025-11-01', type: null, city: null, state: null, stats: team(1, { wins: 1, losses: 1, ties: 0, opr: split({ totalNp: 50 }) }) },
      { code: 'C', name: 'C', date: '2026-03-01', type: null, city: null, state: null, stats: null },
    ]);
    expect(t.map((p) => p.code)).toEqual(['A', 'B']);
    expect(t.map((p) => p.winRate)).toEqual([50, 80]);
    expect(trendDirection(t.map((p) => p.opr))).toBe('up');
    expect(trendDirection([100, 102])).toBe('flat');
    expect(trendDirection([100, 50])).toBe('down');
    expect(trendDirection([5])).toBeNull();
  });
});

describe('partners and opponents', () => {
  it('aggregates records, scores and penalties per partner/opponent across events', () => {
    const e1 = event('E1', [
      match('qual:0:1', [4215, 7], [8, 9], 100, 80, { redPen: 10 }),
      match('qual:0:2', [4215, 7], [9, 10], 60, 90, { redPen: 0 }),
    ]);
    const e2 = event('E2', [match('qual:0:1', [4215, 11], [9, 12], 70, 70), match('qual:0:2', [4215, 7], [1, 2], null, null)]);
    const { partners, opponents } = partnersAndOpponents([e1, e2], 4215);
    const p7 = partners.find((p) => p.number === 7)!;
    expect(p7).toMatchObject({ matches: 2, wins: 1, losses: 1, ties: 0, winRate: 50, avgScore: 80, avgPenalties: 5, events: ['E1'] });
    expect(partners[0].number).toBe(7); // most frequent first; unplayed match ignored
    const o9 = opponents.find((o) => o.number === 9)!;
    expect(o9).toMatchObject({ matches: 3, wins: 1, losses: 1, ties: 1 });
    expect(o9.events.sort()).toEqual(['E1', 'E2']);
  });
});

describe('partner fit and scouting priority', () => {
  const field = [
    team(4215, { rank: 6, opr: split({ auto: 10, teleop: 70, endgame: 10 }), avg: split({ penaltiesCommitted: 5 }) }),
    team(1, { rank: 1, wins: 5, losses: 0, ties: 0, opr: split({ auto: 40, teleop: 60, endgame: 10 }), avg: split({ penaltiesCommitted: 4 }) }),
    team(2, { rank: 2, opr: split({ auto: 12, teleop: 90, endgame: 10 }), avg: split({ penaltiesCommitted: 30 }) }),
    team(3, { rank: 3, opr: split({ auto: 15, teleop: 40, endgame: 5 }), avg: split({ penaltiesCommitted: 5 }) }),
    team(5, { rank: 4, opr: null, qualMatchesPlayed: 1 }),
  ];
  it('prefers teams that cover our below-average areas and flags penalty risk', () => {
    const fit = partnerFit(field, 4215, 3);
    expect(fit[0].teamNumber).toBe(1); // strong auto covers our weak auto
    expect(fit[0].reasons.some((r) => /Autonomous OPR 40/.test(r.text) && /gap/.test(r.text))).toBe(true);
    const t2 = fit.find((f) => f.teamNumber === 2)!;
    expect(t2.cautions[0].text).toMatch(/30 penalty pts/);
    expect(fit.map((f) => f.teamNumber)).not.toContain(4215);
    expect(fit.map((f) => f.teamNumber)).not.toContain(5); // no OPR → no fit claim
  });
  it('scouting priorities: scout-next first, then ranked teams with thin data, then un-noted shortlist', () => {
    const sl: ShortlistEntry[] = [
      { teamNumber: 3, teamName: 'Team 3', season: 2025, eventCode: null, notes: '', priority: 'high', scoutNext: false, strengths: [], weaknesses: [], updatedAt: '' },
      { teamNumber: 2, teamName: 'Team 2', season: 2025, eventCode: null, notes: 'watched', priority: 'low', scoutNext: true, strengths: [], weaknesses: [], updatedAt: '' },
    ];
    const pri = scoutingPriorities(field, sl, 4215);
    expect(pri.map((p) => p.teamNumber)).toEqual([2, 5, 3]);
    expect(pri[1].why).toMatch(/no OPR/);
    expect(scoutingPriorities(field, [], 4215).map((p) => p.teamNumber)).toEqual([5]);
  });
});
