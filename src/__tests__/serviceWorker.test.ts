// Runs public/sw.js against fake caches and a fake network: precaching on
// install, network-first API data with an offline fallback, clearing that
// data on request, and leaving other API calls alone.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { precacheList } from '../../scripts/sw-precache.mjs';

const SW = readFileSync(join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://cp.test';

class FakeCache {
  store = new Map<string, Response>();
  async put(req: any, res: Response) { this.store.set(typeof req === 'string' ? new URL(req, ORIGIN).href : req.url, res); }
  async match(req: any) { const r = this.store.get(typeof req === 'string' ? new URL(req, ORIGIN).href : req.url); return r ? r.clone() : undefined; }
  async add(path: string) { const res = await (globalThis as any).__fetch(new Request(new URL(path, ORIGIN).href)); if (!res.ok) throw new Error('bad'); await this.put(path, res); }
  async keys() { return [...this.store.keys()].map((u) => new Request(u)); }
}

function boot(network: (req: Request) => Promise<Response>) {
  const caches = new Map<string, FakeCache>();
  const cacheStorage = {
    open: async (n: string) => { if (!caches.has(n)) caches.set(n, new FakeCache()); return caches.get(n)!; },
    delete: async (n: string) => caches.delete(n),
    keys: async () => [...caches.keys()],
    match: async (req: any) => { for (const c of caches.values()) { const r = await c.match(req); if (r) return r; } return undefined; },
  };
  const listeners: Record<string, (e: any) => void> = {};
  const self: any = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, fn: any) => { listeners[t] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetchFn = (input: any, init?: any) => network(typeof input === 'string' ? new Request(new URL(input, ORIGIN).href, init) : new Request(input.url));
  (globalThis as any).__fetch = fetchFn;
  // In a worker, relative URLs resolve against the worker's origin.
  const SWRequest = function (input: any, init?: any) { return new Request(new URL(input, ORIGIN).href, init); } as any;
  new Function('self', 'caches', 'fetch', 'Request', SW)(self, cacheStorage, fetchFn, SWRequest);
  const fire = async (type: string, extra: any = {}) => {
    const waits: Promise<any>[] = [];
    let responded: Promise<Response> | undefined;
    const e = { ...extra, waitUntil: (p: Promise<any>) => waits.push(p), respondWith: (p: Promise<Response>) => { responded = p; } };
    listeners[type](e);
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    return res;
  };
  // A plain stand-in for FetchEvent.request (url, method, mode).
  const get = (path: string, mode = 'cors') => fire('fetch', { request: { url: ORIGIN + path, method: 'GET', mode } });
  return { caches, fire, get };
}

const json = (body: any) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('service worker (offline Compete)', () => {
  let online: boolean;
  let hits: string[];
  const network = async (req: Request) => {
    hits.push(new URL(req.url).pathname);
    if (!online) throw new TypeError('Failed to fetch');
    const p = new URL(req.url).pathname;
    if (p === '/sw-precache.json') return json({ files: ['/assets/TeamStatsPage-a.js', '/assets/index-b.css'] });
    if (p === '/') return new Response('<html>shell</html>', { status: 200 });
    if (p.startsWith('/assets/')) return new Response('chunk ' + p, { status: 200 });
    return json({ path: p, at: hits.length });
  };
  beforeEach(() => { online = true; hits = []; });

  it('downloads the offline pages on install', async () => {
    const sw = boot(network);
    await sw.fire('install');
    const cache = sw.caches.get('control-point-v4')!;
    expect(await cache.match('/assets/TeamStatsPage-a.js')).toBeTruthy();
    expect(await cache.match('/index.html')).toBeTruthy();
    // Offline: the precached chunk still loads.
    online = false;
    expect(await (await sw.get('/assets/TeamStatsPage-a.js'))!.text()).toBe('chunk /assets/TeamStatsPage-a.js');
  });

  it('serves the last good copy of Compete data offline, fresh data online', async () => {
    const sw = boot(network);
    const first = await (await sw.get('/api/ftc/scout/team?season=2025'))!.json();
    online = false;
    const offline = await (await sw.get('/api/ftc/scout/team?season=2025'))!.json();
    expect(offline).toEqual(first);
    online = true;
    const fresh = await (await sw.get('/api/ftc/scout/team?season=2025'))!.json();
    expect(fresh.at).toBeGreaterThan(first.at);
  });

  it('signed-in boot works offline (/api/auth/me), and the copy is dropped on request', async () => {
    const sw = boot(network);
    await sw.get('/api/auth/me');
    online = false;
    expect((await sw.get('/api/auth/me'))!.ok).toBe(true);
    await sw.fire('message', { data: { type: 'clear-api-cache' } });
    const after = await sw.get('/api/auth/me');
    expect(after!.type).toBe('error');
  });

  it('leaves other API calls and uploads to the network', async () => {
    const sw = boot(network);
    expect(await sw.get('/api/notifications')).toBeUndefined();
    expect(await sw.get('/api/scouting/sync')).toBeUndefined();
    expect(await sw.get('/uploads/a.png')).toBeUndefined();
  });
});

describe('precache list', () => {
  it('follows static imports and CSS of the entry and the offline pages, not lazy-only chunks', () => {
    const manifest = {
      'index.html': { file: 'assets/index-1.js', isEntry: true, imports: ['_vendor.js'], css: ['assets/index-1.css'] },
      '_vendor.js': { file: 'assets/vendor-react-2.js' },
      'src/modern/pages/stats/TeamStatsPage.tsx': { file: 'assets/TeamStatsPage-3.js', imports: ['_shared.js'] },
      '_shared.js': { file: 'assets/shared-4.js', css: ['assets/shared-4.css'] },
      'src/modern/pages/cad/CadPage.tsx': { file: 'assets/CadPage-5.js' },
    };
    expect(precacheList(manifest, ['src/modern/pages/stats/TeamStatsPage.tsx'])).toEqual([
      '/assets/TeamStatsPage-3.js', '/assets/index-1.css', '/assets/index-1.js', '/assets/shared-4.css', '/assets/shared-4.js', '/assets/vendor-react-2.js',
    ]);
  });
});
