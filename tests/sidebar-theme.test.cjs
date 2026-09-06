'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Theme = require('../src/sidebar/sidebar-theme.js');

function rootMock() {
  const attributes = new Map();
  return {
    style: {},
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
  };
}

test('theme values normalize to system/light/dark only', () => {
  assert.equal(Theme.normalizeTheme('system'), 'system');
  assert.equal(Theme.normalizeTheme('LIGHT'), 'light');
  assert.equal(Theme.normalizeTheme('dark'), 'dark');
  assert.equal(Theme.normalizeTheme('unknown'), 'system');
  assert.equal(Theme.normalizeTheme(null), 'system');
});

test('applyTheme controls color-scheme and explicit theme attribute', () => {
  const root = rootMock();

  assert.equal(Theme.applyTheme('dark', root), 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(root.style.colorScheme, 'dark');

  assert.equal(Theme.applyTheme('light', root), 'light');
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(root.style.colorScheme, 'light');

  assert.equal(Theme.applyTheme('system', root), 'system');
  assert.equal(root.getAttribute('data-theme'), null);
  assert.equal(root.style.colorScheme, 'light dark');
});

test('theme preference persists only through the supplied local storage area', async () => {
  const values = {};
  const storage = {
    async get(key) { return { [key]: values[key] }; },
    async set(next) { Object.assign(values, next); },
  };

  assert.equal(await Theme.writeTheme('dark', storage), 'dark');
  assert.equal(values[Theme.STORAGE_KEY], 'dark');
  assert.equal(await Theme.readTheme(storage), 'dark');

  await Theme.writeTheme('unsupported', storage);
  assert.equal(values[Theme.STORAGE_KEY], 'system');
  assert.equal(await Theme.readTheme(storage), 'system');
});

test('theme preference falls back safely when storage cannot be read', async () => {
  const storage = { async get() { throw new Error('storage unavailable'); } };
  assert.equal(await Theme.readTheme(storage), 'system');
});

test('sidebar loads theme code externally with no inline theme execution', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/sidebar/sidebar.html'), 'utf8');
  assert.match(html, /id="themeSelect"/);
  assert.match(html, /src="sidebar-theme\.js"/);
  assert.match(html, /href="sidebar-theme\.css"/);
  assert.doesNotMatch(html, /<script>\s*SidebarTheme/);
});
