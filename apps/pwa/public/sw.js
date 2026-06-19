// Legacy migration shim — intentionally a CLASSIC script (no import/export), so
// it parses under ANY existing registration. Older clients registered this URL
// as a classic worker (and briefly as a module worker); when the browser checks
// this URL for an update it re-parses it with that original type. A module
// worker (top-level `import`) fails to parse as classic ("Cannot use import
// statement outside a module"), which left those clients permanently unable to
// update. This shim has no imports, so the update finally succeeds.
//
// Its only job is to step aside for the real module worker (app-sw.js): take
// control, drop the stale precache so the next navigation loads fresh HTML, and
// let that fresh page register app-sw.js. User data lives in IndexedDB and is
// left untouched.
self.addEventListener('install', () => self.skipWaiting());

// Identify ourselves to the update prompt so it can migrate silently (no
// "update available" dialog for a transient shim) instead of looping.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage({ version: 'shim' });
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// No fetch handler: every request goes to the network so clients pick up the
// latest HTML/assets. Once the fresh page registers app-sw.js, this shim is
// replaced.
