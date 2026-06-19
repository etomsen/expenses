import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

// Multi-page (MPA) Vite build: one HTML entry per page, each mounting a Svelte
// root component. `base: './'` keeps every asset URL relative so the app works
// under the GitHub Pages subpath ("/expenses/") and at "/" locally.
//
// The service worker (app-sw.js), its interceptors (sw/), the kill-switch shim
// (sw.js), PGLite (assets/pglite), the icons and the web manifest live under
// `public/` — Vite copies them verbatim to the output root and never bundles
// them, so the PGLite-in-service-worker data layer stays exactly as-is.
const here = import.meta.dirname;
const root = resolve(here, 'src');

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(here, 'public'),
  plugins: [svelte()],
  build: {
    outDir: resolve(here, '../../dist/pwa'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        blotter: resolve(root, 'blotter.html'),
        charts: resolve(root, 'charts.html'),
        budget: resolve(root, 'budget.html'),
        'budget-transactions': resolve(root, 'budget-transactions.html'),
      },
    },
  },
});
