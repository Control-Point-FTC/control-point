import { describe, it, expect, vi, beforeEach } from 'vitest';
import { packEvent, packSearch, packStale, packTeamProfile, PACK_STALE_MS } from '../offlinePack';
import { OFFLINE_PACK_FORMAT, type OfflinePack } from '../../types/offlinePack';

const pack: OfflinePack = {
  format: OFFLINE_PACK_FORMAT, region: 'USNJ', regionName: 'New Jersey', season: 2025, builtAt: '2026-10-08T07:00:00.000Z', dataAsOf: '2026-10-08T06:00:00.000Z',
  teams: [[4215, 'Mech', 'Edison', 'NJ'], [42150, 'Mechanical Minds', 'Newark', 'NJ'], [1111, 'Robo Rams', 'Princeton', 'NJ'], [2222, 'Gears', 'Trenton', 'NJ']],
  events: [{
    code: 'USNJQ1', name: 'NJ Qualifier', type: 'Qualifier', start: '2026-01-10', end: '2026-01-10', region: 'USNJ', state: 'NJ', country: 'USA',
    teams: [[1111, 2, 2, 2, 1, 0, 3], [4215, 1, 2.5, 3, 0, 0, 3], [2222, null, null, null, null, null, null]],
    awards: [['Inspire', 1, 4215]],
    matches: [
      { l: 'q', s: 0, n: 1, t: '2026-01-10T15:00:00Z', r: [4215, 1111], b: [2222, 3333], rs: [130, 120, 10, 105, 5, 10], bs: [80, 80, 10, 65, 5, 0], sur: [1111], dq: [3333] },
      { l: 'p', s: 2, n: 1, t: null, r: [4215, 1111], b: [2222, 3333], rs: null, bs: null },
    ],
  }],
};

describe('offline pack', () => {
  it('searches by number (exact, then prefix) and by name or town', () => {
    expect(packSearch(pack, '4215').map((h) => h.number)).toEqual([4215, 42150]);
    expect(packSearch(pack, 'mech').map((h) => h.number)).toEqual([4215, 42150]);
    expect(packSearch(pack, 'robo princeton')).toEqual([{ number: 1111, name: 'Robo Rams', city: 'Princeton', state: 'NJ' }]);
    expect(packSearch(pack, 'nope')).toEqual([]);
    expect(packSearch(pack, '  ')).toEqual([]);
  });

  it('rebuilds an event in the live shape, ranked, with scores, penalties and surrogates', () => {
    const ev = packEvent(pack, 2025, 'usnjq1')!;
    expect(ev).toMatchObject({ code: 'USNJQ1', name: 'NJ Qualifier', source: 'cache', stale: true, fetchedAt: pack.dataAsOf, alliances: [] });
    expect(ev.field.map((t) => [t.teamNumber, t.name, t.rank])).toEqual([[4215, 'Mech', 1], [1111, 'Robo Rams', 2], [2222, 'Gears', null]]);
    expect(ev.field[0].awards).toEqual(['Inspire']);
    const [q1, sf] = ev.matches;
    expect(q1).toMatchObject({ key: 'qual:0:1', label: 'Q-1', played: true });
    expect(q1.red.score).toEqual({ total: 130, totalNp: 120, auto: 10, teleop: 105, endgame: 5, penaltiesCommitted: 10, penaltiesByOpp: 0 });
    expect(q1.blue.score?.penaltiesByOpp).toBe(10);
    expect(q1.red.teams[1]).toEqual({ number: 1111, name: 'Robo Rams', surrogate: true });
    expect(q1.blue.teams[1]).toEqual({ number: 3333, name: 'Team 3333', dq: true });
    expect(sf).toMatchObject({ label: 'M-2', played: false, level: 'playoff' });
    expect(packEvent(pack, 2024, 'USNJQ1')).toBeNull();
    expect(packEvent(pack, 2025, 'OTHER')).toBeNull();
  });

  it('builds a team season from its events', () => {
    const p = packTeamProfile(pack, 2025, 4215)!;
    // A region's pack may miss the team's events elsewhere.
    expect(p).toMatchObject({ number: 4215, name: 'Mech', city: 'Edison', season: 2025, stale: true, partial: true });
    expect(packTeamProfile({ ...pack, region: 'ALL' }, 2025, 4215)).not.toHaveProperty('partial');
    expect(p.events).toHaveLength(1);
    expect(p.events[0].stats).toMatchObject({ rank: 1, wins: 3, awards: ['Inspire'] });
    expect(packTeamProfile(pack, 2025, 9999)).toBeNull();
    expect(packTeamProfile(pack, 2024, 4215)).toBeNull();
  });

  it('is stale a week after its data', () => {
    const at = Date.parse(pack.dataAsOf!);
    expect(packStale(pack, at + PACK_STALE_MS - 1)).toBe(false);
    expect(packStale(pack, at + PACK_STALE_MS + 1)).toBe(true);
    expect(packStale({ ...pack, dataAsOf: null }, Date.parse(pack.builtAt) + 1000)).toBe(false);
  });
});

// The scouting API falls back to the pack only when the network or FTC data is down.
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const offline = vi.hoisted(() => ({ getOfflinePack: vi.fn() }));
vi.mock('../../services/offlinePack', async (orig) => ({ ...(await orig<object>()), ...offline }));
import { clearScoutCache, fetchScoutEvent, fetchScoutTeam, searchScoutTeams } from '../../services/ftcScoutApi';

describe('scouting API offline fallback', () => {
  beforeEach(() => {
    clearScoutCache();
    api.apiFetch.mockReset();
    offline.getOfflinePack.mockReset();
    offline.getOfflinePack.mockResolvedValue({ pack, bytes: 1, savedAt: '' });
  });
  const reply = (status: number, body: any) => Promise.resolve({ ok: status < 300, status, json: async () => body });

  it('answers from the pack with no connection, and goes back to the network next time', async () => {
    api.apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await searchScoutTeams('mech', 2025)).map((h) => h.number)).toEqual([4215, 42150]);
    expect((await fetchScoutTeam(2025, 4215)).name).toBe('Mech');
    expect((await fetchScoutEvent(2025, 'USNJQ1')).field).toHaveLength(3);
    // Not in the pack: the original failure.
    await expect(searchScoutTeams('zzz', 2025)).rejects.toThrow('Failed to fetch');
    await expect(fetchScoutTeam(2025, 9999)).rejects.toThrow('Failed to fetch');
    // Back online: offline answers weren't cached.
    api.apiFetch.mockImplementation(() => reply(200, { results: [{ number: 1, name: 'Live', city: null, state: null }] }));
    expect((await searchScoutTeams('mech', 2025))[0].name).toBe('Live');
  });

  it('uses the pack when FTC data is down (502), never over a real answer', async () => {
    api.apiFetch.mockImplementation(() => reply(502, { error: 'Could not reach FTC data sources' }));
    expect((await fetchScoutTeam(2025, 4215)).name).toBe('Mech');
    api.apiFetch.mockImplementation(() => reply(404, { error: 'No record of that team number this season' }));
    await expect(fetchScoutTeam(2025, 1111)).rejects.toThrow('No record');
  });

  it('without a pack, fails as before', async () => {
    offline.getOfflinePack.mockResolvedValue(null);
    api.apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(searchScoutTeams('mech', 2025)).rejects.toThrow('Failed to fetch');
  });
});
