// Control Point service worker — basic offline support.
// Caches the app shell so the app loads fast and works offline-ish.
// Bump to drop cached static files (e.g. after the app icons change).
const CACHE = 'control-point-v2';

self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return;
  // Only handle GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        // Cache successful static responses
        if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.match(/\.(png|jpg|svg|woff2?|css|js)$/))) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback: serve index.html for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        throw new Error('offline');
      });
    })
  );
});
