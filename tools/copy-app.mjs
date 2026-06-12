import { cp, rm } from 'node:fs/promises';

const [src, dest] = process.argv.slice(2);

if (!src || !dest) {
  console.error('Usage: node copy-app.mjs <src> <dest>');
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
