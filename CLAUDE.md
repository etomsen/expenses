# Tomsy — expense tracker

An **offline-first PWA** for tracking expenses. All data lives in the browser
(no backend): a full Postgres runs client-side via **PGLite** (WASM), persisted
to IndexedDB. Deployed as a static site to GitHub Pages.

Live: https://etomsen.github.io/expenses/ · Stack: Alpine.js + Pico CSS +
PGLite, no bundler (vanilla ES modules, vendored deps), built with **Nx**.

## Monorepo layout

```
apps/
  pwa/      ← the product. Offline-first PWA (this is what's worked on)
  pwa-e2e/  ← Playwright E2E tests for the PWA
  web/      ← legacy: original static frontend that called apps/server (kept, not deployed)
  server/   ← legacy: Express + Postgres (pg) backend (superseded by PGLite in pwa)
libs/
  templater/  ← Nx generator that inlines <template x-src> includes at build time
tools/        ← plain ESM build scripts (vendor assets, copy app)
```

Active development is **`apps/pwa`** + **`libs/templater`**. `apps/web` and
`apps/server` are the original client/server design, kept for reference.

## apps/pwa

```
src/
  index.html      Add-expense form
  blotter.html    Expense table: filter by category/supercategory, edit/delete, mobile styles
  charts.html     Pie chart (custom <canvas>, no library) of spend by supercategory
  db.js           PGLite database module (schema + all queries) — the data layer
  app.js          ES module: imports db.js, sets window.ExpenseDB, resolves the readiness promise
  sw.js           Service worker: precache + cache-first offline + update-prompt support
  manifest.webmanifest, icons/
  assets/         VENDORED (gitignored) — alpine, pico, pglite; produced by the vendor step
  precache.json   GENERATED (gitignored) — list of files the SW precaches
templates/        Build-time includes (NOT served): navbar.html, db-ready.js, update-prompt.html
project.json      Nx targets: vendor, build, serve
```

### Data layer (`db.js`)

- One PGLite instance at `idb://expenses` (IndexedDB-backed, survives reloads, fully offline).
- Tables: `category(category PK, supercategory, usage_count)` and
  `expenses(id, data DATE, amount, currency, description, category, supercategory, created_at)`
  with indexes on `data`, `supercategory`, `category`.
- Categories are **seeded only on first launch** (when the table is empty) from a
  hardcoded list mirroring the source spreadsheet; unknown CSV-import categories
  fall back to **`Непонятно`**. `usage_count` orders the Add-form dropdown by frequency.
- Exports: `ready`, `listCategories`, `listExpenses({category, supercategory})`,
  `supercategoryTotals`, `insertExpense`, `updateExpense`, `deleteExpense`,
  `importCsv`, `exportCsv`, `resetDatabase`. Import/export CSV round-trip losslessly
  (quote-aware parser; `кафе и рестораны`→`Кофе и рестораны` alias).

### How a page boots

1. `<head>` runs `db-ready.js` (a templated `<script>`) which creates
   `window.__expenseDBReady` (a promise) + `window.__resolveExpenseDB`.
2. `app.js` (a `type=module`) imports `db.js` — importing it kicks off PGLite
   init — then sets `window.ExpenseDB` and resolves `__expenseDBReady`.
3. Page Alpine components do `await window.__expenseDBReady` then `await db.ready`
   before querying. Pages talk to the DB **only** through `window.ExpenseDB` / the
   resolved module — never import `db.js` directly in inline Alpine (the specifier
   wouldn't resolve there).

### Templater (`libs/templater`)

Shared markup (navbar, head scripts) lives once in `apps/pwa/templates/` and is
pulled into pages with `<template x-src="navbar.html"></template>`. At build the
`build-templates` Nx generator inlines them (`.html` verbatim, `.js` wrapped in
`<script>`). It's linked via npm **workspaces** (`"workspaces": ["libs/*"]`) so
`npm ci` resolves `@tomsy/templater` in CI. See `libs/templater/README.md`.

The shared `navbar.html` marks the active link at runtime (`isCurrent()` reads
`location.pathname`) since one file serves every page.

### Build / serve

`nx build pwa`: **vendor** (`tools/vendor-pwa-assets.mjs` → copies alpine/pico/pglite
into `src/assets`, regenerates `precache.json`) → **copy-app** (`src` → `dist/pwa`)
→ **templater** (`nx generate @tomsy/templater:build-templates`, inlines includes in
`dist/pwa`). `serve` depends on `build` and serves `dist/pwa` (placeholders only
resolve at build time, so editing `src`/`templates` needs a rebuild).

### Offline + updates (`sw.js`)

- Cache-first; precaches the app shell **and** the PGLite WASM/data so the DB
  works with no network.
- Does **not** `skipWaiting()` on install. `update-prompt.html` (included via the
  navbar on every page) detects a waiting worker and shows
  "Update is available. Do you want to update?"; confirming posts `SKIP_WAITING`
  and reloads, declining keeps the current version and re-prompts next launch.

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

- **Bump the SW cache** (`const CACHE = 'expenses-pwa-vN'` in `sw.js`) whenever you
  change anything that gets cached, so clients pick it up.
- Alpine components are written **inline** in `x-data` on each page (no
  `Alpine.data` registration — `app.js` loads PGLite and may run after Alpine starts).
- An inline `x-data` attribute can't contain a literal `"` — build quote chars with
  `String.fromCharCode(34)` (see the blotter total heading).
- `desc` is a reserved SQL word; the column is `description` (aliased `AS desc` in SELECTs).
- Amount inputs accept `.` or `,` as the decimal separator.
- After verifying in a browser, the workflow has been: build to `dist/pwa`, serve
  with `http-server`, drive it, then commit. Vendored `assets/` and `precache.json`
  are gitignored (regenerated by the build).
- Root `package.json` `scripts` still point at the legacy `web` app; use
  `nx build pwa` / `nx serve pwa` for the real app.
