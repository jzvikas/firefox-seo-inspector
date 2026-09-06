'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'sidebar', 'sidebar.css'), 'utf8');

test('sidebar keeps keyboard focus visibly identifiable', () => {
  assert.match(css, /:where\(button, input, select, summary\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s);
  assert.match(css, /outline-offset:\s*2px/);
  assert.match(css, /\.tab:focus-visible\s*\{[^}]*z-index:\s*1/s);
});

test('sidebar protects horizontal content at constrained widths', () => {
  assert.match(css, /\.tabs\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.table-wrap\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.footer\s*\{[^}]*flex-wrap:\s*wrap/s);
});

test('narrow Firefox sidebar collapses dense rows and controls', () => {
  const narrow = css.match(/@media\s*\(max-width:\s*340px\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(narrow, 'expected narrow-sidebar media query');
  assert.match(narrow[1], /\.row\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(narrow[1], /\.url\s*\{[^}]*max-width:\s*62vw/s);
  assert.match(narrow[1], /\.toolbar input, \.toolbar select\s*\{[^}]*flex:\s*1 1 140px/s);
});
