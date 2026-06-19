import { readdir, writeFile } from 'node:fs/promises';

// Generate the service worker precache list by scanning the final build output
// (so Vite's hashed bundle names and the vendored PGLite chunks stay in sync).
// Runs AFTER `vite build`, over dist/pwa. The SW itself and the manifest it
// generates are excluded.
const [dist] = process.argv.slice(2);
if (!dist) {
  console.error('Usage: node gen-precache.mjs <distDir>');
  process.exit(1);
}

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

const precache = (await walk(dist)).sort();
await writeFile(`${dist}/precache.json`, JSON.stringify(precache, null, 2) + '\n');
console.log(`Generated ${dist}/precache.json with ${precache.length} entries`);
