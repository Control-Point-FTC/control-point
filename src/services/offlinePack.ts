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
const announce = (p: SavedPack | null) => { memo = Promise.resolve(p); listeners.forEach((l) => l(p)); };

// Other tabs: told when this one saves or removes the pack, so they read it again.
const channel: BroadcastChannel | null = (() => {
  try { return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('control-point-offline-pack') : null; } catch { return null; }
})();
if (channel) channel.onmessage = () => { memo = null; void getOfflinePack().then((p) => listeners.forEach((l) => l(p))); };
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
  const res = await apiFetch(`/api/offline/pack?region=${encodeURIComponent(region)}`, { timeoutMs: 120_000 });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'Download failed');
  }
  const text = await res.text();
  const pack = JSON.parse(text) as OfflinePack;
  if (pack?.format !== OFFLINE_PACK_FORMAT || !Array.isArray(pack.teams) || !Array.isArray(pack.events)) throw new Error('The server sent a pack this version of the app can’t read — reload the page.');
  const saved: SavedPack = { pack, bytes: text.length, savedAt: new Date().toISOString() };
  await withStore('readwrite', (s) => s.put(saved, KEY));
  announce(saved);
  tellOtherTabs();
  return saved;
}

export async function removeOfflinePack(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(KEY));
  announce(null);
  tellOtherTabs();
}
