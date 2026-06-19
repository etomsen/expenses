// Talks to the service worker over /api/*. Every call first waits until a
// service worker controls the page (otherwise /api/* would hit the network).

// Resolve /api/* against the app's base directory so the request stays inside
// the service worker's scope. The app may be served under a subpath (e.g.
// GitHub Pages serves it from "/expenses/"); an absolute "/api/..." would
// escape that scope and never be intercepted.
const BASE = location.pathname.replace(/[^/]*$/, '');
export const apiUrl = (path) => BASE + path.replace(/^\//, '');

const ready = (async () => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are required for this app.');
  }
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  }
})();

export function whenReady() {
  return ready;
}

async function request(path, options) {
  await ready;
  const res = await fetch(apiUrl(path), options);
  if (!res.ok) {
    let message = res.statusText || 'HTTP ' + res.status;
    try {
      const body = await res.clone().json();
      if (body && body.error) message = body.error;
    } catch (e) {}
    throw new Error(message);
  }
  return res;
}

export const getJson = (path) => request(path).then((r) => r.json());
export const getText = (path) => request(path).then((r) => r.text());

export const sendJson = (method, path, body) =>
  request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => r.json());

export const sendText = (method, path, text) =>
  request(path, { method, headers: { 'Content-Type': 'text/plain' }, body: text }).then((r) => r.json());

export const qs = (obj = {}) => {
  const p = new URLSearchParams();
  for (const k in obj) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') p.set(k, obj[k]);
  const s = p.toString();
  return s ? '?' + s : '';
};
