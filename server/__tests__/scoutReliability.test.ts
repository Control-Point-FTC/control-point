// Control Scout's reliability index, read for the pages that show OPR: only the named public fields pass,
// answers are cached per season and team, and any failure means no number (never an error).
import { describe, it, expect } from 'vitest';
import { createReliabilityClient, parseReliability, CACHE_MS } from '../scoutReliability';

const row = (team: number, index: number) => ({
  team, reliability: { index, matches: 20, noShows: 1, dqs: 0, nearZero: 2, recent: { matches: 10, noShows: 1, nearZero: 2 }, parts: { noShowRate: 0.05 }, fieldIndex: 75, secret: 'x' },
});

describe('parseReliability', () => {
  it('keeps the named fields only, and drops bad rows', () => {
    const p = parseReliability(2025, { fieldIndex: 75, teams: [row(1, 80), { team: 2, reliability: null }, { team: 3, reliability: { index: 140, matches: 1 } }, { team: 'x' }] })!;
    expect(p.fieldIndex).toBe(75);
    expect(p.teams).toEqual([{ team: 1, index: 80, matches: 20, noShows: 1, dqs: 0, nearZero: 2, recent: { matches: 10, noShows: 1, nearZero: 2 } }]);
    expect(parseReliability(2025, { nope: true })).toBeNull();
  });
});

describe('reliability client', () => {
  it('asks Scout once per team within the cache window, in the order asked', async () => {
    const urls: string[] = [];
    let t = 0;
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      const teams = new URL(url).searchParams.get('teams')!.split(',').map(Number);
      return new Response(JSON.stringify({ season: 2025, fieldIndex: 75, teams: teams.map((n) => row(n, 60 + n)) }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = createReliabilityClient({ origin: 'https://scout.test', fetchImpl, now: () => t });
    expect((await c.get(2025, [2, 1])).teams.map((r) => [r.team, r.index])).toEqual([[2, 62], [1, 61]]);
    await c.get(2025, [1, 3]);
    expect(urls).toEqual(['https://scout.test/api/reliability?season=2025&teams=2,1', 'https://scout.test/api/reliability?season=2025&teams=3']);
    t = CACHE_MS;
    await c.get(2025, [1]);
    expect(urls).toHaveLength(3);
  });

  it('gives no numbers, never an error, when Scout fails', async () => {
    const down = createReliabilityClient({ origin: 'https://scout.test', fetchImpl: (async () => { throw new Error('down'); }) as unknown as typeof fetch });
    expect(await down.get(2025, [1])).toEqual({ season: 2025, fieldIndex: null, teams: [] });
    const bad = createReliabilityClient({ origin: 'https://scout.test', fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch });
    expect((await bad.get(2025, [1])).teams).toEqual([]);
  });
});
