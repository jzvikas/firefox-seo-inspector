'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/sidebar/sidebar.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/sidebar/sidebar-result-semantics.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/sidebar/sidebar-result-semantics.css'), 'utf8');

test('sidebar loads the local result-semantics assets', () => {
  assert.match(html, /sidebar-result-semantics\.css/);
  assert.match(html, /sidebar-result-semantics\.js/);
  assert.doesNotMatch(js, /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\//i);
});

test('result semantics distinguish observations, rule warnings, and recommendations', () => {
  assert.match(js, /dataset\.resultKind/);
  assert.match(js, /'fact'/);
  assert.match(js, /'warning'/);
  assert.match(js, /'recommendation'/);
  assert.match(js, /Critical rule failure/);
  assert.match(js, /Rule warning/);
  assert.match(js, /Observed/);
  assert.match(js, /Recommendation/);
  assert.match(js, /result-kind-label/);
  assert.match(js, /setAttribute\('role', 'group'\)/);
  assert.match(js, /setAttribute\('aria-label', labelText\)/);
});

test('semantic result kinds have visible text labels without relying on color alone', () => {
  assert.match(css, /\.result-kind-label/);
  assert.match(css, /data-result-kind="recommendation"/);
  assert.match(css, /\.issue > \.result-kind-label/);
  assert.doesNotMatch(css, /content:\s*["']/);
});
