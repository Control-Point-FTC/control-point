import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OFFLINE_PACK_FORMAT, type OfflinePack } from '../../types/offlinePack';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<object>()), ...api }));
const offline = vi.hoisted(() => ({ getOfflinePack: vi.fn() }));
vi.mock('../offlinePack', async (orig) => ({ ...(await orig<object>()), ...offline }));
const sim = vi.hoisted(() => ({ forecast: vi.fn(), partners: vi.fn() }));
vi.mock('../../utils/offlineForecast', () => ({ OFFLINE_RUNS: 1000, offlineForecaster: (p: OfflinePack) => (p.predict ? sim : null) }));

import { clearPredictCache, fetchForecast, fetchPartners } from '../predictApi';

const pack = (withPredict = true): OfflinePack => ({
  format: OFFLINE_PACK_FORMAT, region: 'USNJ', regionName: 'New Jersey', season: 2025, builtAt: '2026-10-08T07:00:00.000Z', dataAsOf: '2026-10-08T06:00:00.000Z',
  teams: [[4215, 'Mech', null, null]],
  events: [{ code: 'USNJQ1', name: 'NJ Qualifier', type: 'Qualifier', start: '2026-01-10', end: '2026-01-10', region: 'USNJ', state: 'NJ', country: null, teams: [[4215, null, null, null, null, null, null]], awards: [], matches: [] }],
  ...(withPredict ? { predict: {} as any } : {}),
});
const reply = (status: number, body: any, headers: Record<string, string> = {}) => Promise.resolve({ ok: status < 300, status, headers: new Headers(headers), json: async () => body });
const savedCopy = (body: any) => reply(200, body, { 'X-CP-Saved-Copy': '1' });

beforeEach(() => {
  clearPredictCache();
  api.apiFetch.mockReset();
  offline.getOfflinePack.mockReset();
  offline.getOfflinePack.mockResolvedValue({ pack: pack(), bytes: 1, savedAt: '' });
  sim.forecast.mockReset();
  sim.forecast.mockReturnValue({ season: 2025, event: 'USNJQ1', teams: [], generatedAt: 'now' });
  sim.partners.mockReset();
  sim.partners.mockResolvedValue({ role: 'captain', myTeam: 4215, baseline: { pAdvance: 0.5, pWin: 0.2, pCaptain: 0.6 }, options: [] });
});

describe('Predict offline', () => {
  it('forecasts on the device with no connection, for our team, and tries the server again next time', async () => {
    api.apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const fc = await fetchForecast(2025, 'USNJQ1', { myTeam: 4215 });
    expect(sim.forecast).toHaveBeenCalledWith(expect.objectContaining({ code: 'USNJQ1', name: 'NJ Qualifier' }), 4215, 1000);
    expect(fc).toMatchObject({ eventName: 'NJ Qualifier', myTeam: 4215, offline: { asOf: '2026-10-08T06:00:00.000Z', region: 'New Jersey' } });
    expect((await fetchPartners(2025, 'USNJQ1', { myTeam: 4215 })).role).toBe('captain');
    expect(sim.partners).toHaveBeenCalledWith(expect.objectContaining({ code: 'USNJQ1' }), 4215);
    // Back online: the offline answer wasn't cached.
    api.apiFetch.mockImplementation(() => reply(200, { season: 2025, event: 'USNJQ1', teams: [], eventName: 'Live' }));
    expect((await fetchForecast(2025, 'USNJQ1')).eventName).toBe('Live');
  });

  it("never replaces the server's own answer, and needs the event and ratings in the pack", async () => {
    api.apiFetch.mockImplementation(() => reply(422, { error: 'This event does not advance teams' }));
    await expect(fetchForecast(2025, 'USNJQ1')).rejects.toMatchObject({ status: 422 });
    api.apiFetch.mockImplementation(() => reply(503, { error: 'Predictions are warming up' }));
    await expect(fetchForecast(2025, 'USNJQ1')).rejects.toMatchObject({ status: 503 });
    api.apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchForecast(2025, 'OTHER')).rejects.toThrow('Failed to fetch');
    offline.getOfflinePack.mockResolvedValue({ pack: pack(false), bytes: 1, savedAt: '' });
    await expect(fetchForecast(2025, 'USNJQ1')).rejects.toThrow('Failed to fetch');
    expect(sim.forecast).not.toHaveBeenCalled();
    // Alliance options need our team; an answer for "no team" isn't reused once it's known.
    offline.getOfflinePack.mockResolvedValue({ pack: pack(), bytes: 1, savedAt: '' });
    await expect(fetchPartners(2025, 'USNJQ1')).rejects.toThrow('Failed to fetch');
    api.apiFetch.mockClear();
    expect((await fetchPartners(2025, 'USNJQ1', { myTeam: 4215 })).myTeam).toBe(4215);
    expect(api.apiFetch).toHaveBeenCalledTimes(1);
  });

  it('a gateway error (FTC data down) also falls back', async () => {
    api.apiFetch.mockImplementation(() => reply(502, { error: 'Bad gateway' }));
    expect((await fetchForecast(2025, 'USNJQ1')).offline).toBeTruthy();
  });

  it('offline with a saved server forecast: a newer download wins, else the saved one is labelled', async () => {
    // Saved before the download (06:00): the download is newer.
    api.apiFetch.mockImplementation(() => savedCopy({ season: 2025, event: 'USNJQ1', teams: [], eventName: 'Saved', generatedAt: '2026-10-07T00:00:00.000Z' }));
    const fromPack = await fetchForecast(2025, 'USNJQ1', { myTeam: 4215 });
    expect(fromPack.offline).toEqual({ asOf: '2026-10-08T06:00:00.000Z', region: 'New Jersey' });
    expect(sim.forecast).toHaveBeenCalledTimes(1);
    // Saved after the download: the saved forecast, marked as offline.
    clearPredictCache();
    api.apiFetch.mockImplementation(() => savedCopy({ season: 2025, event: 'USNJQ1', teams: [], eventName: 'Saved', generatedAt: '2026-10-08T12:00:00.000Z' }));
    const saved = await fetchForecast(2025, 'USNJQ1');
    expect(saved).toMatchObject({ eventName: 'Saved', offline: { asOf: '2026-10-08T12:00:00.000Z', region: null } });
    expect(sim.forecast).toHaveBeenCalledTimes(1);
    // No download at all: the saved copy, labelled.
    clearPredictCache();
    offline.getOfflinePack.mockResolvedValue(null);
    expect((await fetchForecast(2025, 'USNJQ1')).offline?.region).toBeNull();
  });

  it('offline with saved alliance options: worked out from the download when there is one', async () => {
    api.apiFetch.mockImplementation(() => savedCopy({ role: 'picked', myTeam: 4215, baseline: {}, options: [] }));
    expect((await fetchPartners(2025, 'USNJQ1', { myTeam: 4215 })).role).toBe('captain');
    clearPredictCache();
    offline.getOfflinePack.mockResolvedValue(null);
    expect((await fetchPartners(2025, 'USNJQ1', { myTeam: 4215 })).role).toBe('picked');
  });
});
