// Control Point service worker.
//
// - Page loads (navigations): network first, so a deploy is picked up
//   immediately; the last good copy of the app shell is kept and served when
//   the network is down (competition venues, school Wi-Fi).
// - /assets/* (content-hashed, never change): cache first. On install the
//   files Compete, Tasks and Calendar need are downloaded ahead of time
//   (dist/sw-precache.json), so those pages open with no connection even on
//   a device that never visited them online.
// - Read-only data those pages show (OFFLINE_API below): network first with
//   a short timeout, falling back to the last good copy. The app clears this
//   copy on sign-out and on workspace switch, so one account never sees
//   another's data.
// - Other same-origin static files (icons, fonts, manifest): served from
//   cache while a fresh copy is fetched in the background.
// - Never cached: other /api/* calls, /uploads/* (user files), other origins,
//   and standalone pages that aren't the app (STANDALONE_PAGES).
// Bump CACHE to drop everything cached by an older worker.
// v5: v4 could save the Predict article as the offline app shell.
const CACHE = 'control-point-v5';
const API_CACHE = 'control-point-api-v1';
const SHELL = '/index.html';
// Pages the server serves on their own (not the app). Left to the browser:
// saving one as the offline shell would open it instead of the app offline.
const STANDALONE_PAGES = ['/predict/how-it-works'];
const API_TIMEOUT_MS = 5000;
// Bumped each time the app drops the data copy (sign-out, workspace switch):
// a response that was already on its way for the previous account is then
// thrown away instead of being saved. Saves also wait for a pending clear.
let apiGen = 0;
let clearing = Promise.resolve();

// GET endpoints whose last answer is shown offline (exact path, or prefix
// when it ends in "/").
const OFFLINE_API = [
  '/api/auth/me', '/api/teams', '/api/members', '/api/settings',
  '/api/tasks', '/api/events', '/api/hidden-dates',
  '/api/ftc/', '/api/predict/', '/api/scouting/entries',
];
function isOfflineApi(path) {
  return OFFLINE_API.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Each part catches its own failure, so install keeps waiting for the
      // rest (a failed shell fetch must not cut the page downloads short).
      .then((cache) => Promise.all([
        fetch(new Request('/', { cache: 'reload' })).then((res) => (res.ok ? cache.put(SHELL, res) : undefined)).catch(() => {}),
        // Best effort per file: one missing chunk must not fail the install.
        fetch('/sw-precache.json', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : { files: [] }))
          .then(({ files }) => Promise.all((files || []).map((f) => cache.add(f).catch(() => {}))))
          .catch(() => {}),
      ]))
      .catch(() => { /* offline install: files are cached as they are first used instead */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The app asks for the data copy to be dropped (sign-out, workspace switch).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-api-cache') {
    apiGen++;
    clearing = clearing.then(() => caches.delete(API_CACHE)).catch(() => {});
    event.waitUntil(clearing);
  }
});

function isStaticAsset(url) {
  return /\.(png|jpe?g|svg|ico|webp|woff2?|webmanifest|wasm)$/.test(url.pathname);
}

function markSaved(res) {
  if (!res) return res;
  const headers = new Headers(res.headers);
  headers.set('X-CP-Saved-Copy', '1');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Network first with a timeout; the last good copy when the network fails. */
function networkFirstApi(event, req) {
  const gen = apiGen;
  let saved = null;
  const network = fetch(req).then((res) => {
    // Clone now, before the page starts reading the body.
    if (res.ok) saved = res.clone();
    return res;
  });
  event.waitUntil(
    network
      .then(() => clearing)
      // Only if the account/workspace hasn't changed since the request started.
      .then(() => (saved && gen === apiGen ? caches.open(API_CACHE).then((c) => c.put(req, saved)) : undefined))
      .catch(() => {})
  );
  // The saved copy is marked, so the app can tell it from a live answer
  // (Predict prefers a newer downloaded region pack over an old saved forecast).
  const fallback = () => clearing.then(() => caches.open(API_CACHE)).then((c) => c.match(req)).then(markSaved);
  const timedOut = new Promise((resolve) => setTimeout(resolve, API_TIMEOUT_MS)).then(fallback);
  return Promise.race([
    network.catch(() => fallback().then((cached) => cached || Response.error())),
    // Slow venue Wi-Fi: use the copy after a few seconds if there is one;
    // otherwise keep waiting for the network.
    timedOut.then((cached) => cached || network),
  ]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (isOfflineApi(url.pathname)) event.respondWith(networkFirstApi(event, req));
    return;
  }
  if (url.pathname.startsWith('/uploads/')) return;
  // Compared case-insensitively and without trailing slashes, so no spelling
  // of a standalone page can end up saved as the shell.
  if (STANDALONE_PAGES.includes(url.pathname.toLowerCase().replace(/\/+$/, ''))) return;

  if (req.mode === 'navigate') {
    // Take the offline copy before the page starts reading the body.
    let shellCopy = null;
    const network = fetch(req).then((res) => {
      if (res.ok) shellCopy = res.clone();
      return res;
    });
    event.respondWith(
      network.catch(() => caches.match(SHELL).then((cached) => cached || Response.error()))
    );
    // Keep the worker alive until the offline copy of the shell is saved.
    event.waitUntil(
      network.then(() => (shellCopy ? caches.open(CACHE).then((cache) => cache.put(SHELL, shellCopy)) : undefined)).catch(() => {})
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            // Clone now, before the page starts reading the body.
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, copy)));
          }
          return res;
        });
      })
    );
    return;
  }

  if (isStaticAsset(url)) {
    // Stale-while-revalidate; the refresh is kept alive with waitUntil. The
    // copy is taken before the response is handed to the page.
    const refresh = fetch(req).then((res) => {
      if (!res.ok) return res;
      const copy = res.clone();
      return caches.open(CACHE).then((cache) => cache.put(req, copy)).then(() => res);
    });
    event.waitUntil(refresh.catch(() => {}));
    event.respondWith(
      caches.match(req).then((cached) => cached || refresh.catch(() => Response.error()))
    );
  }
});
