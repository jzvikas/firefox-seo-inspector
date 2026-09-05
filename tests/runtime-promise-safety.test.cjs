'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function jsFiles(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name: path.join(relativeDir, name).replace(/\\/g, '/'), source: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function asyncFunctionNames(files) {
  const names = new Set();
  for (const file of files) {
    const matcher = /async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let match;
    while ((match = matcher.exec(file.source))) names.add(match[1]);
  }
  return names;
}

test('event listeners do not return known async tasks without an explicit rejection handler', () => {
  const files = [...jsFiles('src/sidebar'), ...jsFiles('src/background')];
  const asyncNames = asyncFunctionNames(files);
  const unsafe = [];

  for (const file of files) {
    // Covers concise callbacks such as: addEventListener('click', () => saveThing()).
    // Returning a Promise from a DOM/WebExtension event callback does not by itself
    // make the rejection observable or safe, so user/event-driven tasks must attach
    // an explicit catch (or use a containing helper that does so).
    const matcher = /(?:addEventListener|addListener)\s*\([^,]+,\s*\([^)]*\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\([^;]*?\)\s*(\.catch\s*\([^;]*?\))?\s*\);/gs;
    let match;
    while ((match = matcher.exec(file.source))) {
      const callee = match[1];
      if (!asyncNames.has(callee)) continue;
      if (match[2]) continue;
      const line = file.source.slice(0, match.index).split('\n').length;
      unsafe.push(`${file.name}:${line} -> ${callee}()`);
    }
  }

  assert.deepEqual(unsafe, [], `Promise-returning event callbacks need explicit rejection handling:\n${unsafe.join('\n')}`);
});

test('Rules user actions route unexpected task failures into the Inspector runtime boundary', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/sidebar/sidebar-rules.js'), 'utf8');
  assert.match(source, /saveRulesFromEditor\(\)\.catch\(\(error\) => handleAsyncUiFailure\('rules-save', error\)\)/);
  assert.match(source, /resetRulesToDefaults\(\)\.catch\(\(error\) => handleAsyncUiFailure\('rules-reset', error\)\)/);
  assert.match(source, /loadRulesUiConfig\(\)\.catch\(\(error\) => handleAsyncUiFailure\('rules-load', error\)\)/);
});
