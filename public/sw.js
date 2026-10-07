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
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) => cache.match(req).then((cached) => {
        const fresh = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached || Response.error());
        return cached || fresh;
      }))
    );
  }
});
