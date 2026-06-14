# @tomsy/templater

A tiny build-time HTML templater, packaged as an **Nx generator**. It inlines
shared fragments (a navbar, `<head>` scripts, …) into pages so the same markup
doesn't have to be copy-pasted across `index.html`, `blotter.html`, etc.

It runs at build time and produces fully self-contained HTML — no runtime fetch,
which keeps the PWA's offline behaviour simple.

## How it works

In a page, drop a placeholder where the shared content should go:

```html
<!-- inlines templates/navbar.html as-is -->
<template x-src="navbar.html"></template>

<!-- inlines templates/db-ready.js wrapped in <script>…</script> -->
<template x-src="db-ready.js"></template>
```

At build time the generator replaces every `<template x-src="FILE">…</template>`
with the contents of `FILE`, resolved from the templates directory:

- **`.html`** → inlined verbatim.
- **`.js`** → inlined wrapped in a `<script>` tag.

Includes may themselves contain `x-src` includes (resolved recursively, up to a
small depth limit). The matcher only touches `<template>` tags that have an
`x-src` attribute, so Alpine's own `<template x-for>` / `<template x-if>` are
left untouched.

> Note: `x-src` is **not** an Alpine directive — it's just an inert marker the
> build replaces. A page served without building would show empty `<template>`s,
> so the dev `serve` target builds first (see below).

## Layout

```
libs/templater/
  generators.json                         # registers the "build-templates" generator
  package.json                            # name: @tomsy/templater, "generators": "./generators.json"
  src/
    templater.js                          # core: renderHtml(html, resolve)
    generators/build-templates/
      generator.js                        # Nx generator (operates on the Nx Tree)
      schema.json                         # options: htmlDir, templatesDir
```

The library is linked as an npm **workspace** (root `package.json` →
`"workspaces": ["libs/*"]`), so `npm install` / `npm ci` symlink it into
`node_modules/@tomsy/templater` and Nx can resolve the generator — locally and
in CI.

## Usage

### In the build (how `apps/pwa` uses it)

`apps/pwa/project.json` runs the generator after copying sources to `dist`:

```jsonc
"build": {
  "executor": "nx:run-commands",
  "dependsOn": ["vendor"],
  "options": {
    "parallel": false,
    "commands": [
      "node tools/copy-app.mjs apps/pwa/src dist/pwa",
      "nx generate @tomsy/templater:build-templates --htmlDir=dist/pwa --templatesDir=apps/pwa/templates --no-interactive"
    ]
  }
}
```

So the flow is: `vendor` (assets) → `copy-app` (src → `dist/pwa`, placeholders
intact) → **templater** (inlines placeholders in `dist/pwa` in place).

Templates live in `apps/pwa/templates/` (a sibling of `src/`, so they are *not*
copied into `dist` or served).

### Running it manually

```bash
nx generate @tomsy/templater:build-templates \
  --htmlDir=dist/pwa \
  --templatesDir=apps/pwa/templates
```

| Option         | Description                                                   |
| -------------- | ------------------------------------------------------------ |
| `htmlDir`      | Directory of `.html` files to process **in place**.          |
| `templatesDir` | Directory the `x-src` filenames are resolved against.        |

Both paths are relative to the workspace root (the Nx Tree only sees files
inside the workspace).

## Adding a new shared fragment

1. Create the file under `apps/pwa/templates/`, e.g. `footer.html`.
2. Reference it from any page: `<template x-src="footer.html"></template>`.
3. Build (`nx build pwa`). The placeholder is replaced with the fragment.

### Active nav links

The shared `navbar.html` can't know which page renders it, so the current link
is marked at runtime instead of build time. Its Alpine component exposes:

```js
isCurrent(file) {
  const path = location.pathname.split('/').pop() || 'index.html';
  return path === file ? 'page' : null;
}
```

and each link binds `:aria-current="isCurrent('blotter.html')"`.

## Dev note

Because placeholders are resolved at build time, the `serve` target
`dependsOn: ["build"]` and serves `dist/pwa`. Editing `src/` or `templates/`
requires a rebuild to take effect.
