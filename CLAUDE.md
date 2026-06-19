# Tomsy — expense tracker

An **offline-first PWA** for tracking expenses. All data lives in the browser
(no backend): a full Postgres runs client-side via **PGLite** (WASM), persisted
to IndexedDB. Deployed as a static site to GitHub Pages.

Live: https://etomsen.github.io/expenses/ · Stack: **Svelte 5** (no SvelteKit) +
Pico CSS + PGLite, bundled with **Vite** (multi-page), built with **Nx**.

## Monorepo layout

```
apps/
  pwa/      ← the product. Offline-first PWA (this is what's worked on)
  pwa-e2e/  ← Playwright E2E tests for the PWA
  web/      ← legacy: original static frontend that called apps/server (kept, not deployed)
  server/   ← legacy: Express + Postgres (pg) backend (superseded by PGLite in pwa)
tools/      ← plain ESM build scripts (vendor-pglite, gen-precache; copy-app/vendor-assets are legacy web/server)
```

Active development is **`apps/pwa`**. `apps/web` and `apps/server` are the
original client/server design, kept for reference (and still use `tools/copy-app.mjs`
/ `tools/vendor-assets.mjs`).

## apps/pwa

A Vite **multi-page** app: one HTML entry per page, each mounting a Svelte root
component. `base: './'` (relative URLs) so it works under the GitHub Pages
subpath (`/expenses/`) and at `/` locally.

```
vite.config.js     MPA config (5 .html inputs, base './', publicDir ../public, outDir dist/pwa)
src/
  index.html  blotter.html  charts.html  budget.html  budget-transactions.html
              ← minimal entries; each loads pages/<name>.js
  pages/<name>.js   mounts Navbar + the page component + UpdatePrompt into <body>
  lib/
    components/     Svelte UI: Navbar, UpdatePrompt, AddExpense, Blotter, Charts,
                    Budget, BudgetTransactions (one root component per page)
    client/         page-side data access: *.api.js + http.js — call the SW over /api/*
  assets/nav/*.svg  navbar mask icons (imported via Vite, inlined as data URIs)
public/             ← Vite copies VERBATIM to the output root (never bundled)
  app-sw.js         module service worker: precache + cache-first + /api routing
  sw/               interceptors/ (per-resource /api handlers) + store/db.js (PGLite)
  sw.js             classic kill-switch shim (owns the legacy sw.js URL)
  manifest.webmanifest  icons/  assets/pglite/ (VENDORED, gitignored)
project.json        Nx targets: vendor, build, dev, serve, preview
```

### Data layer — PGLite in the service worker, reached over `/api/*`

The page never touches PGLite directly. It runs **inside `app-sw.js`** (a service
worker can serve the DB with no network — see commit history "run PGLite in the
service worker behind /api/\*").

- `public/sw/store/db.js` — the actual data layer: one PGLite instance at
  `idb://expenses` (IndexedDB-backed, offline). Tables `category(category PK,
  supercategory, usage_count)` and `expenses(id, data DATE, amount, currency,
  description, category, supercategory, created_at)`, plus budgets. Categories are
  **seeded only on first launch**; unknown CSV-import categories fall back to
  **`Непонятно`**. `desc` is a reserved SQL word → the column is `description`
  (aliased `AS desc` in SELECTs).
- `public/sw/interceptors/*` — per-resource handlers matched by `app-sw.js` for
  `/api/categories`, `/api/expenses`, `/api/supercategory-totals`, `/api/budgets`,
  `/api/reset`, `/api/import`, `/api/export`. GET responses are cached; writes bust
  that cache.
- `src/lib/client/*.api.js` + `http.js` — the page's typed wrappers around `fetch`
  to those routes. `http.js` `whenReady()` waits until a SW controls the page; the
  api calls await it internally. Import these directly in components — there is **no**
  `window.ExpenseDB` / `__expenseDBReady` global anymore.

### How a page boots

1. The `.html` entry loads `pages/<name>.js` (`type=module`, bundled by Vite).
2. That script imports Pico's CSS and `mount()`s `Navbar`, the page component, and
   `UpdatePrompt` into `document.body` (in that order → header, main, dialogs).
3. Components call the `lib/client/*` api functions; each awaits the SW being ready,
   then hits `/api/*`, which `app-sw.js` answers from PGLite.

### Shared UI (replaces the old templater)

`Navbar.svelte` (nav links + the DB Import/Export/Reset menu and its modals) and
`UpdatePrompt.svelte` (SW registration + update dialog) are plain Svelte components
imported by every page's `pages/<name>.js`. There is **no** build-time HTML
inlining — the old `libs/templater` + `<template x-src>` mechanism is gone. The
navbar marks the active link at runtime (`isCurrent()` reads `location.pathname`).

### Build / serve

`nx build pwa` (output `dist/pwa`):

1. **vendor** — `tools/vendor-pglite.mjs` copies the PGLite runtime
   (index.js, chunks, `pglite.wasm`/`.data`, `initdb.wasm`) into
   `apps/pwa/public/assets/pglite` (gitignored) so Vite copies it verbatim.
2. **vite build** — bundles the Svelte UI + Pico CSS into hashed assets, rewrites
   the 5 `.html` entries, and copies `public/` (the SW, manifest, icons, PGLite) to
   the output root.
3. **gen-precache** — `tools/gen-precache.mjs` walks `dist/pwa` and writes
   `precache.json` (the SW's precache list, including Vite's hashed bundle names),
   excluding `sw.js`, `app-sw.js`, `precache.json`.

`nx dev pwa` runs the Vite dev server (fast iteration). `nx serve` / `nx preview`
depend on `build` and `http-server dist/pwa` on :4300 (the prod path the e2e and
manual verification run against).

### Offline + updates

- `app-sw.js` is cache-first and precaches the app shell **and** the PGLite
  WASM/data so the DB works with no network. It does **not** `skipWaiting()` on
  install.
- `UpdatePrompt.svelte` registers `app-sw.js` (`{ type: 'module' }`), detects a
  waiting worker, and shows "A new version is available…"; confirming posts
  `SKIP_WAITING` and reloads, declining re-prompts next launch.
- `sw.js` is a **classic** kill-switch shim that owns the legacy `sw.js` URL: it
  takes control, drops stale precaches, and steps aside for `app-sw.js`. It exists
  so old clients (which registered `sw.js`) can migrate. User data in IndexedDB is
  untouched.

## apps/pwa-e2e

Playwright E2E tests, structured like the re-finflow reference:

- `playwright.config.ts` — `nxE2EPreset`, Chromium only, `testMatch: '**/*.integrations.ts'`,
  reports under `dist/pwa-e2e/`. Runs against `http://localhost:4300`.
  **`serviceWorkers: 'allow'`** — unlike most apps this PWA's data layer *is* the SW
  (PGLite answers `/api/*`), so the SW must run. Builds the config path from
  `workspaceRoot` (not `__filename`) so it loads under both nx's and Playwright's loaders.
- `src/<feature>/<feature>.po.ts` — page objects (role/text selectors).
- `src/<feature>/<feature>.integrations.ts` — tests (`*.integrations.ts`).
- The `e2e` target is **inferred** by `@nx/playwright/plugin` (see `nx.json` plugins).
  Its web server is `pwa:preview` (a `continuous` target: `build` → `http-server dist/pwa`).

Run: `nx e2e pwa-e2e` (builds the pwa, serves it, runs the tests). Browsers:
`npx playwright install chromium` first (CI does this).

## Deploy

`.github/workflows/deploy-pwa.yml` on push to `master`: `npm ci` → `npx nx build pwa`
→ upload `dist/pwa` to GitHub Pages. It's a project site (served under `/expenses/`);
the app uses only relative paths so it works under that subpath.

## Conventions & gotchas

- **Bump the SW cache** (`const CACHE = 'expenses-pwa-vN'` in `public/app-sw.js`)
  whenever you change anything that gets cached, so clients pick it up.
- UI is **Svelte 5 runes** (`$state`/`$derived`/`$effect`). One root component per
  page; shared chrome is `Navbar`/`UpdatePrompt`. Per-row canvas drawing (budget
  bars) uses a Svelte `use:` action; the charts pie draws after `await tick()`.
- `desc` is a reserved SQL word; the column is `description` (aliased `AS desc`).
- Amount inputs accept `.` or `,` as the decimal separator.
- Keep visible strings/roles stable — the e2e selectors are role/text based (e.g.
  blotter's "Loading expenses…" / "No expenses yet.").
- After verifying in a browser, the workflow has been: `nx build pwa`, serve
  `dist/pwa` with `http-server`, drive it, then commit. Vendored
  `public/assets/pglite` (and `dist/`) are gitignored (regenerated by the build).
  Note: a service worker registered on a `localhost:PORT` during earlier dev can
  serve a stale shell — test on a fresh port or let the `sw.js` shim migrate it.
- Root `package.json` `scripts` still point at the legacy `web` app; use
  `nx build pwa` / `nx serve pwa` / `nx dev pwa` for the real app.
