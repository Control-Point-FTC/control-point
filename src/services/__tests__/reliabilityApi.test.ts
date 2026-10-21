// Reliability for a field of any size: requests of 100 teams or fewer, at most 3 at once, merged; a failed chunk
// only loses its own teams.
import { describe, it, expect } from 'vitest';
import { fetchReliabilityAll, MAX_PARALLEL } from '../reliabilityApi';
import type { ReliabilityAnswer } from '../../../server/scoutReliability';

const rel = (team: number) => ({ team, index: 70, matches: 10, noShows: 0, dqs: 0, nearZero: 0, recent: { matches: 10, noShows: 0, nearZero: 0 } });

describe('fetchReliabilityAll', () => {
  it('splits into requests of 100, keeps at most 3 in flight, and merges every team', async () => {
    const teams = Array.from({ length: 650 }, (_, i) => i + 1);
    const sizes: number[] = [];
    let inFlight = 0, peak = 0;
    const chunk = async (season: number, ts: number[]): Promise<ReliabilityAnswer> => {
      sizes.push(ts.length);
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { season, fieldIndex: 75, teams: ts.map(rel) };
    };
    const out = await fetchReliabilityAll(2025, teams, chunk);
    expect(sizes.every((n) => n <= 100)).toBe(true);
    expect(sizes).toHaveLength(7);
    expect(peak).toBeLessThanOrEqual(MAX_PARALLEL);
    expect(out.teams.map((r) => r.team).sort((a, b) => a - b)).toEqual(teams);
    expect(out.fieldIndex).toBe(75);
  });

  it('a failed chunk loses only its own teams', async () => {
    const teams = Array.from({ length: 150 }, (_, i) => i + 1);
    const chunk = async (season: number, ts: number[]): Promise<ReliabilityAnswer> => {
      if (ts[0] === 1) throw new Error('down');
      return { season, fieldIndex: 75, teams: ts.map(rel) };
    };
    const out = await fetchReliabilityAll(2025, teams, chunk);
    expect(out.teams.map((r) => r.team)).toEqual(teams.slice(100));
  });
});
