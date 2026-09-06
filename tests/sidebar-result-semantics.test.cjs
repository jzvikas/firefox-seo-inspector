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
  assert.match(js, /data\.resultKind|dataset\.resultKind/);
  assert.match(js, /'fact'/);
  assert.match(js, /'warning'/);
  assert.match(js, /'recommendation'/);
  assert.match(js, /Critical rule failure/);
  assert.match(js, /Rule warning/);
  assert.match(js, /Observed page facts/);
  assert.match(js, /Recommendation/);
});

test('semantic result kinds have visible labels without relying on color alone', () => {
  assert.match(css, /data-result-kind="fact"/);
  assert.match(css, /content:\s*"Observed"/);
  assert.match(css, /data-result-kind="recommendation"/);
  assert.match(css, /content:\s*"Recommendation"/);
  assert.match(css, /data-result-kind="warning"/);
  assert.match(css, /content:\s*"Rule warning"/);
  assert.match(css, /content:\s*"Critical rule failure"/);
});
