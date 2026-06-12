import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const destDir = 'apps/web/src/assets';

// Resolve installed packages instead of pulling from a CDN.
const assets = [
  { from: 'alpinejs/dist/cdn.min.js', to: 'alpine.min.js' },
  { from: '@alpinejs/mask/dist/cdn.min.js', to: 'alpine-mask.min.js' },
  { from: '@picocss/pico/css/pico.min.css', to: 'pico.min.css' },
];

await mkdir(destDir, { recursive: true });

for (const { from, to } of assets) {
  const dest = `${destDir}/${to}`;
  await copyFile(require.resolve(from), dest);
  console.log(`Vendored ${from} -> ${dest}`);
}
