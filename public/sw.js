// Control Point service worker.
//
// - Page loads (navigations): network first, so a deploy is picked up
//   immediately; the last good copy of the app shell is kept and served when
//   the network is down (competition venues, school Wi-Fi).
// - /assets/* (content-hashed, never change): cache first.
// - Other same-origin static files (icons, fonts, manifest): served from
//   cache while a fresh copy is fetched in the background.
// - Never cached: /api/* (live data), /uploads/* (user files), other origins.
// Bump CACHE to drop everything cached by an older worker.
const CACHE = 'control-point-v3';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => fetch(new Request('/', { cache: 'reload' })).then((res) => (res.ok ? cache.put(SHELL, res) : undefined)))
      .catch(() => { /* offline install: the shell is cached on the first navigation instead */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return /\.(png|jpe?g|svg|ico|webp|woff2?|webmanifest|wasm)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

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
          if (res.ok) event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, res.clone())));
          return res;
        });
      })
    );
    return;
  }

  if (isStaticAsset(url)) {
    // Stale-while-revalidate; the refresh is kept alive with waitUntil.
    const refresh = fetch(req).then((res) => {
      if (res.ok) return caches.open(CACHE).then((cache) => cache.put(req, res.clone())).then(() => res);
      return res;
    });
    event.waitUntil(refresh.catch(() => {}));
    event.respondWith(
      caches.match(req).then((cached) => cached || refresh.catch(() => Response.error()))
    );
  }
});
