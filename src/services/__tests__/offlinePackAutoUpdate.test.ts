// The offline pack keeps itself current: a re-download when the server has a
// later sync or the next season, at most every two hours (sooner when the
// connection comes back), never when turned off or with no pack saved.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OFFLINE_PACK_FORMAT, type OfflinePack, type OfflineRegions } from '../../types/offlinePack';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { downloadOfflinePack, getOfflinePack, packIsBehind, removeOfflinePack, setOfflineAutoUpdate, updateOfflinePackIfBehind } from '../offlinePack';

const pack = (dataAsOf: string, season = 2026, region = 'USNJ'): OfflinePack => ({
  format: OFFLINE_PACK_FORMAT, region, regionName: 'New Jersey', season, builtAt: dataAsOf, dataAsOf, teams: [[4215, 'Mech', null, null]], events: [],
});
const regions = (dataAsOf: string | null, season = 2026, codes = ['USNJ']): OfflineRegions => ({
  season, dataAsOf, detected: null, regions: codes.map((code) => ({ code, name: code, events: 1, teams: 4 })), all: { events: 1, teams: 4 },
});
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

/** The server: its region list, and a pack built at `serverAsOf`. */
function server(serverAsOf: string) {
  api.apiFetch.mockImplementation(async (url: string) => {
    if (url === '/api/offline/regions') return json(regions(serverAsOf));
    if (url.startsWith('/api/offline/pack')) return json(pack(serverAsOf));
    throw new Error(`unexpected ${url}`);
  });
}
const packDownloads = () => api.apiFetch.mock.calls.filter(([u]) => String(u).startsWith('/api/offline/pack')).length;

beforeEach(async () => {
  localStorage.clear();
  api.apiFetch.mockReset();
  await removeOfflinePack();
});

describe('is the pack behind?', () => {
  it('a later sync, or the next season once the region has events', () => {
    expect(packIsBehind(pack('2026-10-19T06:00:00Z'), regions('2026-10-20T06:00:00Z'))).toBe(true);
    expect(packIsBehind(pack('2026-10-20T06:00:00Z'), regions('2026-10-20T06:00:00Z'))).toBe(false);
    expect(packIsBehind(pack('2026-10-20T06:00:00Z'), regions(null))).toBe(false);
    expect(packIsBehind(pack('2026-03-01T06:00:00Z', 2025), regions('2026-10-20T06:00:00Z', 2026, ['USNJ']))).toBe(true);
    // New season, but nothing in New Jersey yet: keep last season's copy.
    expect(packIsBehind(pack('2026-03-01T06:00:00Z', 2025), regions('2026-10-20T06:00:00Z', 2026, ['USPA']))).toBe(false);
    expect(packIsBehind(pack('2026-03-01T06:00:00Z', 2025, 'ALL'), regions('2026-10-20T06:00:00Z', 2026, ['USPA']))).toBe(true);
  });
});

describe('updating on its own', () => {
  it('re-downloads the same region when the server has newer data', async () => {
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    server('2026-10-20T06:00:00Z');
    const got = await updateOfflinePackIfBehind();
    expect(got?.pack.dataAsOf).toBe('2026-10-20T06:00:00Z');
    expect(api.apiFetch).toHaveBeenLastCalledWith('/api/offline/pack?region=USNJ', expect.anything());
  });

  it('checks at most every two hours, unless the connection just came back', async () => {
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    const before = packDownloads();
    expect(await updateOfflinePackIfBehind()).toBeNull(); // current: nothing to do, but checked
    server('2026-10-20T06:00:00Z');
    expect(await updateOfflinePackIfBehind()).toBeNull(); // checked moments ago
    expect(packDownloads()).toBe(before);
    expect((await updateOfflinePackIfBehind({ force: true }))?.pack.dataAsOf).toBe('2026-10-20T06:00:00Z');
  });

  it('does nothing when turned off, or with nothing downloaded', async () => {
    server('2026-10-20T06:00:00Z');
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
    expect(api.apiFetch).not.toHaveBeenCalled();
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    setOfflineAutoUpdate(false);
    const before = packDownloads();
    server('2026-10-20T06:00:00Z');
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
    expect(packDownloads()).toBe(before);
  });

  it('checks again after an early exit (offline, or turned off)', async () => {
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    server('2026-10-20T06:00:00Z');
    const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
    if (online) Object.defineProperty(navigator, 'onLine', online); else delete (navigator as any).onLine;
    setOfflineAutoUpdate(false);
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
    setOfflineAutoUpdate(true);
    // Back online and turned on: this check really runs.
    expect((await updateOfflinePackIfBehind({ force: true }))?.pack.dataAsOf).toBe('2026-10-20T06:00:00Z');
  });

  it("a removal or another region chosen during the download isn't undone", async () => {
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    // The member removes the copy while the update is downloading.
    api.apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/offline/regions') return json(regions('2026-10-20T06:00:00Z'));
      await removeOfflinePack();
      return json(pack('2026-10-20T06:00:00Z'));
    });
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
    expect(await getOfflinePack()).toBeNull();
    // Or picks another region meanwhile: that one stays.
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    api.apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/offline/regions') return json(regions('2026-10-20T06:00:00Z'));
      if (url.includes('region=USPA')) return json(pack('2026-10-20T06:00:00Z', 2026, 'USPA'));
      await downloadOfflinePack('USPA');
      return json(pack('2026-10-20T06:00:00Z'));
    });
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
    expect((await getOfflinePack())?.pack.region).toBe('USPA');
  });

  it("another tab's change it hasn't heard about yet isn't overwritten", async () => {
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    // Another tab replaces the stored copy (written straight to the store; this tab isn't told).
    const otherTab = () => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('control-point-offline', 1);
      open.onsuccess = () => {
        const tx = open.result.transaction('packs', 'readwrite');
        tx.objectStore('packs').put({ pack: pack('2026-10-19T07:00:00Z', 2026, 'USPA'), bytes: 1, savedAt: 'other-tab' }, 'current');
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    api.apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/offline/regions') return json(regions('2026-10-20T06:00:00Z'));
      await otherTab();
      return json(pack('2026-10-20T06:00:00Z'));
    });
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
    const stored = await new Promise<any>((resolve) => {
      const open = indexedDB.open('control-point-offline', 1);
      open.onsuccess = () => { const r = open.result.transaction('packs').objectStore('packs').get('current'); r.onsuccess = () => { open.result.close(); resolve(r.result); }; };
    });
    expect(stored.savedAt).toBe('other-tab');
  });

  it('a failed check is quiet', async () => {
    server('2026-10-19T06:00:00Z');
    await downloadOfflinePack('USNJ');
    api.apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await updateOfflinePackIfBehind({ force: true })).toBeNull();
  });
});
