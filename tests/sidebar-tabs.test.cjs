'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/sidebar/sidebar.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src/sidebar/sidebar-tabs.js'), 'utf8');

test('accessible tab controller is loaded after the main sidebar controller', () => {
  const mainIndex = html.indexOf('<script src="sidebar-main.js"></script>');
  const tabsIndex = html.indexOf('<script src="sidebar-tabs.js"></script>');
  assert.ok(mainIndex >= 0, 'sidebar-main.js must be loaded');
  assert.ok(tabsIndex > mainIndex, 'sidebar-tabs.js must load after sidebar-main.js so click activation is already wired');
});

test('sidebar tabs expose ARIA tab semantics and roving focus', () => {
  assert.match(source, /setAttribute\('role', 'tablist'\)/);
  assert.match(source, /setAttribute\('role', 'tab'\)/);
  assert.match(source, /setAttribute\('role', 'tabpanel'\)/);
  assert.match(source, /setAttribute\('aria-selected'/);
  assert.match(source, /setAttribute\('aria-controls'/);
  assert.match(source, /setAttribute\('aria-labelledby'/);
  assert.match(source, /tab\.tabIndex = selected \? 0 : -1/);
  assert.match(source, /panel\.hidden = !selected/);
});

test('sidebar tabs support standard directional and boundary keyboard navigation', () => {
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']) {
    assert.ok(source.includes(`event.key === '${key}'`), `${key} must be handled`);
  }
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /tab\.click\(\)/);
  assert.match(source, /tab\.focus\(\)/);
});
