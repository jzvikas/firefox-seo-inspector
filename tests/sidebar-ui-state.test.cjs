'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sidebar', 'sidebar-runtime-recovery.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'sidebar', 'sidebar.css'), 'utf8');

test('sidebar defines a normalized five-state UI model', () => {
  for (const state of ['empty', 'loading', 'error', 'disabled', 'complete']) {
    assert.match(source, new RegExp(`['\"]${state}['\"]`));
  }
  assert.match(source, /panel\.dataset\.uiState\s*=\s*uiState/);
});

test('loading state is exposed through aria-busy', () => {
  assert.match(source, /setAttribute\('aria-busy',\s*uiState\s*===\s*STATES\.LOADING\s*\?\s*'true'\s*:\s*'false'\)/);
});

test('empty and error messages use live-region semantics', () => {
  assert.match(source, /querySelector\('\.empty, \.issue'\)/);
  assert.match(source, /uiState\s*===\s*STATES\.ERROR\s*\?\s*'alert'\s*:\s*'status'/);
  assert.match(source, /uiState\s*===\s*STATES\.ERROR\s*\?\s*'assertive'\s*:\s*'polite'/);
});

test('panel state stays synchronized after asynchronous renders', () => {
  assert.match(source, /new MutationObserver/);
  assert.match(source, /observer\.observe\([\s\S]*childList:\s*true[\s\S]*subtree:\s*true[\s\S]*characterData:\s*true/);
});

test('generic retry controls receive a stable accessible label', () => {
  assert.match(source, /Retry this inspection/);
});

test('non-complete sidebar states have explicit visual treatments', () => {
  assert.match(styles, /\.panel\[data-ui-state="loading"\]/);
  assert.match(styles, /\.panel\[data-ui-state="error"\]/);
  assert.match(styles, /\.panel\[data-ui-state="disabled"\]/);
  assert.match(styles, /\.panel\[data-ui-state="empty"\]/);
});
