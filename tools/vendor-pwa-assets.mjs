import { copyFile, mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const srcRoot = 'apps/pwa/src';
const assetsDir = `${srcRoot}/assets`;
const pgliteDir = `${assetsDir}/pglite`;

// Resolve installed packages instead of pulling from a CDN.
const frontendAssets = [
  { from: 'alpinejs/dist/cdn.min.js', to: `${assetsDir}/alpine.min.js` },
  { from: '@alpinejs/mask/dist/cdn.min.js', to: `${assetsDir}/alpine-mask.min.js` },
  { from: '@picocss/pico/css/pico.min.css', to: `${assetsDir}/pico.min.css` },
];

await mkdir(assetsDir, { recursive: true });
await mkdir(pgliteDir, { recursive: true });

for (const { from, to } of frontendAssets) {
  await copyFile(require.resolve(from), to);
  console.log(`Vendored ${from} -> ${to}`);
}

// Vendor the PGLite runtime: the ESM entry, its chunk files, and the WASM +
// data blobs. PGLite resolves the WASM/data relative to index.js via
// import.meta.url, so they all live side by side under assets/pglite.
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

// Generate the service worker precache list by scanning everything under src
// (so hashed PGLite chunk names stay in sync). The SW itself and the manifest
// it generates are excluded.
const EXCLUDE = new Set(['sw.js', 'app-sw.js', 'precache.json']);

async function walk(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walk(`${dir}/${entry.name}`, rel)));
    } else if (!EXCLUDE.has(rel)) {
      files.push(`./${rel}`);
    }
  }
  return files;
}

const precache = (await walk(srcRoot)).sort();
await writeFile(`${srcRoot}/precache.json`, JSON.stringify(precache, null, 2) + '\n');
console.log(`Generated ${srcRoot}/precache.json with ${precache.length} entries`);
