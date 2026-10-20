// The offline region pack on this device (V3.5 phase 6b): downloaded from
// /api/offline/pack, kept in IndexedDB (a full pack is a few MB — too big for
// localStorage), and read by the scouting API when the network is down.
import { apiFetch } from './api';
import { OFFLINE_PACK_FORMAT, type OfflinePack, type OfflineRegions } from '../types/offlinePack';

const DB = 'control-point-offline';
const STORE = 'packs';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Offline storage is not available in this browser.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open offline storage.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('Offline storage failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('Offline storage failed (is the device out of space?).'));
    });
  } finally {
    db.close();
  }
}

/** Saved pack plus its download size, for Settings. */
export interface SavedPack { pack: OfflinePack; bytes: number; savedAt: string }

let memo: Promise<SavedPack | null> | null = null;
const listeners = new Set<(p: SavedPack | null) => void>();
// Bumped whenever the saved copy changes (here or in another tab), so a
// background update can tell the member changed it meanwhile.
let packVersion = 0;
const announce = (p: SavedPack | null) => { packVersion++; memo = Promise.resolve(p); listeners.forEach((l) => l(p)); };

// Other tabs: told when this one saves or removes the pack, so they read it again.
const channel: BroadcastChannel | null = (() => {
  try { return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('control-point-offline-pack') : null; } catch { return null; }
})();
if (channel) channel.onmessage = () => { packVersion++; memo = null; void getOfflinePack().then((p) => listeners.forEach((l) => l(p))); };
const tellOtherTabs = () => { try { channel?.postMessage('changed'); } catch { /* channel closed */ } };

/** The pack on this device (read once, then kept in memory). Never throws. */
export function getOfflinePack(): Promise<SavedPack | null> {
  memo ??= withStore<SavedPack | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<SavedPack | undefined>)
    // A pack in an older layout is ignored (Settings offers a re-download).
    .then((p) => (p?.pack?.format === OFFLINE_PACK_FORMAT ? p : null))
    .catch(() => null);
  return memo;
}

export function onOfflinePackChange(fn: (p: SavedPack | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function fetchOfflineRegions(): Promise<OfflineRegions> {
  const res = await apiFetch('/api/offline/regions');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Could not load offline regions');
  return body as OfflineRegions;
}

/** Download a region ("ALL" = every region) and replace the pack on this device. */
export async function downloadOfflinePack(region: string): Promise<SavedPack> {
  return savePack(await fetchPack(region));
}

/** A region's pack from the server, checked, not saved yet. */
async function fetchPack(region: string): Promise<SavedPack> {
  const res = await apiFetch(`/api/offline/pack?region=${encodeURIComponent(region)}`, { timeoutMs: 120_000 });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'Download failed');
  }
  const text = await res.text();
  const pack = JSON.parse(text) as OfflinePack;
  if (pack?.format !== OFFLINE_PACK_FORMAT || !Array.isArray(pack.teams) || !Array.isArray(pack.events)) throw new Error('The server sent a pack this version of the app can’t read — reload the page.');
  return { pack, bytes: text.length, savedAt: new Date().toISOString() };
}

async function savePack(saved: SavedPack): Promise<SavedPack> {
  await withStore('readwrite', (s) => s.put(saved, KEY));
  announce(saved);
  tellOtherTabs();
  void warmOfflineForecast();
  return saved;
}

/**
 * Load the offline simulator while online, so the service worker keeps a copy
 * (it saves every /assets/ file it serves). Devices that installed the app
 * before the simulator existed never precached it. Only when a pack with
 * ratings is on this device; failures are ignored (try again next time).
 */
export async function warmOfflineForecast(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const saved = await getOfflinePack();
  if (!saved?.pack.predict) return;
  try { await import('../utils/offlineForecast'); } catch { /* offline or a deploy in progress */ }
}

export async function removeOfflinePack(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(KEY));
  announce(null);
  tellOtherTabs();
}

// Keeping the pack current: on by default, per device. The app checks when it
// opens, when the connection comes back, and every two hours while open; the
// server refreshes its FTC data about that often too.
const AUTO_KEY = 'cp-offline-auto-update';
const CHECKED_KEY = 'cp-offline-checked-at';
export const AUTO_CHECK_EVERY_MS = 2 * 60 * 60 * 1000;

export function offlineAutoUpdateOn(): boolean {
  try { return localStorage.getItem(AUTO_KEY) !== 'off'; } catch { return true; }
}
export function setOfflineAutoUpdate(on: boolean): void {
  try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch { /* private mode: stays on */ }
}

/** Is the server's data newer than the pack (a later sync, or the next season)? */
export function packIsBehind(pack: Pick<OfflinePack, 'season' | 'dataAsOf' | 'region'>, regions: Pick<OfflineRegions, 'season' | 'dataAsOf' | 'regions'>): boolean {
  if (regions.season > pack.season) {
    // A new season: only once the pack's region has events in it.
    return pack.region === 'ALL' || regions.regions.some((r) => r.code === pack.region);
  }
  if (regions.season < pack.season || !regions.dataAsOf) return false;
  return !pack.dataAsOf || regions.dataAsOf > pack.dataAsOf;
}

let checking: Promise<SavedPack | null> | null = null;
/**
 * Re-download the pack on this device when the server has newer data. Quiet:
 * returns the new pack, or null when there's nothing to do (no pack, turned
 * off, offline, checked recently, already current, or the member changed or
 * removed the copy meanwhile) or the check failed.
 */
export function updateOfflinePackIfBehind({ force = false }: { force?: boolean } = {}): Promise<SavedPack | null> {
  if (checking) return checking;
  const run = (async (): Promise<SavedPack | null> => {
    try {
      if (!offlineAutoUpdateOn()) return null;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
      const saved = await getOfflinePack();
      if (!saved) return null;
      const version = packVersion;
      if (!force) {
        let last = 0;
        try { last = Number(localStorage.getItem(CHECKED_KEY)) || 0; } catch { /* no storage: check */ }
        if (Date.now() - last < AUTO_CHECK_EVERY_MS) return null;
      }
      const regions = await fetchOfflineRegions();
      try { localStorage.setItem(CHECKED_KEY, String(Date.now())); } catch { /* fine */ }
      if (!packIsBehind(saved.pack, regions)) return null;
      const fresh = await fetchPack(saved.pack.region);
      // Removed, replaced or updated while this ran (Settings, another tab): leave it.
      if (packVersion !== version) return null;
      return await savePack(fresh);
    } catch {
      return null;
    }
  })();
  // Cleared once this run settles (also when it returned early), never before
  // it was stored, so the next check always runs.
  checking = run;
  void run.finally(() => { if (checking === run) checking = null; });
  return run;
}
