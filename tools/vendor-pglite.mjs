import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Vendor the PGLite runtime into the pwa's `public/` so Vite copies it verbatim
// to the build output (it must NOT be bundled — it runs unprocessed inside the
// service worker). PGLite resolves its WASM/data relative to index.js via
// import.meta.url, so the entry, its chunks, and the WASM/data blobs all live
// side by side under public/assets/pglite.
const pgliteDir = 'apps/pwa/public/assets/pglite';
await mkdir(pgliteDir, { recursive: true });

// require.resolve gives dist/index.cjs (the package "require" entry); its
// directory is the dist folder holding the runtime files.
const pgliteDist = path.dirname(require.resolve('@electric-sql/pglite'));
const distFiles = await readdir(pgliteDist);
const runtimeFiles = distFiles.filter(
  (f) =>
    f === 'index.js' ||
    f === 'pglite.wasm' ||
    f === 'pglite.data' ||
    f === 'initdb.wasm' ||
    (f.startsWith('chunk-') && f.endsWith('.js'))
);

for (const f of runtimeFiles) {
  await copyFile(`${pgliteDist}/${f}`, `${pgliteDir}/${f}`);
  console.log(`Vendored @electric-sql/pglite/dist/${f} -> ${pgliteDir}/${f}`);
}
