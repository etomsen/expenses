// Module service worker (registered as app-sw.js with { type: 'module' }).
// Two jobs:
//   1. Precache the app shell + PGLite WASM/data for full offline.
//   2. Intercept /api/* and serve it from PGLite (running here, in the SW),
//      caching GET reads and busting that cache on writes.
//
// It lives at app-sw.js (not sw.js) so the classic kill-switch shim can own the
// sw.js URL — see sw.js for why. import() is disallowed in any service worker,
// so the interceptors come in via this top-level (module) import.
import { interceptors } from './sw/interceptors/index.js';

const CACHE = 'expenses-pwa-v43';
const API_CACHE = 'expenses-api';
// Reported to the update prompt (GET_VERSION) so it can show current vs. new.
const VERSION = CACHE.replace('expenses-pwa-', '');

// The app is served under the SW's scope ("/expenses/" on GitHub Pages, "/"
// locally). Client API calls are scope-relative, so strip the scope prefix to
// recover the canonical "/api/..." path the interceptors match on.
const SCOPE_PATH = new URL(self.registration.scope).pathname;

function canonicalPath(url) {
  const rel = url.pathname.startsWith(SCOPE_PATH)
    ? url.pathname.slice(SCOPE_PATH.length)
    : url.pathname.replace(/^\//, '');
  return '/' + rel;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch('precache.json', { cache: 'no-cache' });
      const urls = await res.json();
      await cache.addAll(['./', ...urls]);
      // Do NOT skipWaiting — the update prompt confirms updates (see update-prompt.html).
    })()
  );
});

// Activate immediately only when the page asks us to (the update prompt).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ----- API: route /api/* to the PGLite-backed interceptors -----
async function handleApi(request) {
  const interceptor = interceptors.find((i) => i.match(request));
  if (!interceptor) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (request.method === 'GET') {
      const cache = await caches.open(API_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await interceptor.execute(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }
    // Writes: run, then bust the read cache so the next GET is fresh.
    const response = await interceptor.execute(request);
    if (response.ok) await caches.delete(API_CACHE);
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && err.message) || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ----- Static: cache-first app shell -----
async function handleStatic(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (canonicalPath(url).startsWith('/api/')) {
    // Hand the interceptors a request whose URL is the canonical "/api/..."
    // path (scope prefix stripped), so they match regardless of subpath.
    const canonical = new URL(url);
    canonical.pathname = canonicalPath(url);
    event.respondWith(handleApi(new Request(canonical.href, request)));
    return;
  }

  if (request.method !== 'GET') return;
  event.respondWith(handleStatic(request));
});
