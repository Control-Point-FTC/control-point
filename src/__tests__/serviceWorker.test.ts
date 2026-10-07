// Runs public/sw.js against fake caches and a fake network: precaching on
// install, network-first API data with an offline fallback, clearing that
// data on request, and leaving other API calls alone.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  /** Dispatch an event: what the page gets, separately from background work. */
  const dispatch = (type: string, extra: any = {}) => {
    const waits: Promise<any>[] = [];
    let responded: Promise<Response> | undefined;
    const e = { ...extra, waitUntil: (p: Promise<any>) => waits.push(p), respondWith: (p: Promise<Response>) => { responded = p; } };
    listeners[type](e);
    return { response: responded, done: () => Promise.all(waits) };
  };
  const fire = async (type: string, extra: any = {}) => {
    const d = dispatch(type, extra);
    const res = d.response ? await d.response : undefined;
    await d.done();
    return res;
  };
  // A plain stand-in for FetchEvent.request (url, method, mode).
  const get = (path: string, mode = 'cors') => fire('fetch', { request: { url: ORIGIN + path, method: 'GET', mode } });
  const start = (path: string) => dispatch('fetch', { request: { url: ORIGIN + path, method: 'GET', mode: 'cors' } });
  return { caches, fire, get, start };
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

  it('a response for the previous account that arrives after a clear is not saved', async () => {
    let release: (r: Response) => void = () => {};
    const sw = boot((req) => (new URL(req.url).pathname === '/api/tasks' ? new Promise((r) => { release = r; }) : network(req)));
    const pending = sw.start('/api/tasks');
    await sw.fire('message', { data: { type: 'clear-api-cache' } }); // signed out / switched meanwhile
    release(json({ old: 'account' }));
    await pending.response;
    await pending.done();
    expect(await (await sw.caches.get('control-point-api-v1'))?.match('/api/tasks')).toBeUndefined();
  });

  describe('slow venue Wi-Fi (5 s fallback)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('serves the saved copy after 5 s while the network hangs', async () => {
      const sw = boot(network);
      await sw.get('/api/events'); // saved copy
      const hang = boot(() => new Promise(() => {}));
      // Same device: hand the saved copy to the worker whose network hangs.
      hang.caches.set('control-point-api-v1', sw.caches.get('control-point-api-v1')!);
      const p = hang.start('/api/events').response!;
      let got: Response | undefined;
      p.then((r) => { got = r; });
      await vi.advanceTimersByTimeAsync(4900);
      expect(got).toBeUndefined();
      await vi.advanceTimersByTimeAsync(200);
      expect(got && (await got.json()).path).toBe('/api/events');
    });

    it('with no saved copy it keeps waiting for the network', async () => {
      let release: (r: Response) => void = () => {};
      const sw = boot(() => new Promise((r) => { release = r; }));
      let got: Response | undefined;
      sw.start('/api/events').response!.then((r) => { got = r; });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(got).toBeUndefined();
      release(json({ fresh: true }));
      await vi.advanceTimersByTimeAsync(0);
      expect(got && (await got.json()).fresh).toBe(true);
    });
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
