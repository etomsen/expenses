'use strict';

// Replace `<template x-src="FILE">…</template>` placeholders with the contents
// of FILE. `.html` files are inlined as-is; `.js` files are wrapped in a
// `<script>` tag. `resolve(file)` must return `{ type: 'html' | 'js', content }`.
function renderHtml(html, resolve) {
  const re = /<template\s+x-src="([^"]+)"\s*>[\s\S]*?<\/template>/g;
  let out = html;
  // Loop so an included template may itself contain `x-src` includes.
  for (let depth = 0; depth < 10 && /<template\s+x-src=/.test(out); depth++) {
    out = out.replace(re, (_match, file) => {
      const r = resolve(file);
      const body = r.content.replace(/\s+$/, '');
      return r.type === 'js' ? '<script>\n' + body + '\n</script>' : body;
    });
  }
  return out;
}

module.exports = { renderHtml };
