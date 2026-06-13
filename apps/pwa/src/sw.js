// Service worker: precache the full app shell (including the PGLite WASM +
// data files) so the app — and its in-browser Postgres database — work with
// no network at all. The precache list is generated at build time into
// precache.json, which keeps the hashed PGLite chunk filenames in sync.
const CACHE = 'expenses-pwa-v15';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch('precache.json', { cache: 'no-cache' });
      const urls = await res.json();
      // Always include the navigation entry point.
      await cache.addAll(['./', ...urls]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Cache-first: fully offline once installed.
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        // Cache successful same-origin responses for next time.
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Offline and not cached: fall back to the app shell for navigations.
        if (request.mode === 'navigate') {
          const shell = await cache.match('index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
