'use strict';

const path = require('path');
const { renderHtml } = require('../../templater');

// Nx generator: inline `<template x-src="…">` includes into every HTML file in
// `htmlDir`, reading the includes from `templatesDir`. Operates on the Nx Tree
// so the changes are flushed to disk by Nx after the generator runs.
module.exports = async function buildTemplates(tree, options) {
  const { htmlDir, templatesDir } = options;

  const resolve = (file) => {
    const full = path.posix.join(templatesDir, file);
    const content = tree.read(full, 'utf-8');
    if (content == null) throw new Error('Template not found: ' + full);
    return { type: file.endsWith('.js') ? 'js' : 'html', content };
  };

  let count = 0;
  for (const name of tree.children(htmlDir)) {
    if (!name.endsWith('.html')) continue;
    const file = path.posix.join(htmlDir, name);
    const html = tree.read(file, 'utf-8');
    if (html == null) continue;
    const rendered = renderHtml(html, resolve);
    if (rendered !== html) {
      tree.write(file, rendered);
      count++;
    }
  }
  console.log(`templater: inlined includes in ${count} file(s) under ${htmlDir}`);
};
