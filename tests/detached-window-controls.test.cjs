'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buttonHarness() {
  const listeners = {};
  const attributes = {};
  const button = {
    textContent: '',
    title: '',
    disabled: false,
    hidden: false,
    setAttribute(name, value) { attributes[name] = String(value); },
    addEventListener(name, listener) { listeners[name] = listener; },
  };
  const boundsListeners = [];
  const updates = [];
  const current = { id: 99, state: 'normal' };
  const browser = {
    windows: {
      onBoundsChanged: { addListener(listener) { boundsListeners.push(listener); } },
      async getCurrent() { return Object.assign({}, current); },
      async update(windowId, options) {
        assert.equal(windowId, 99);
        updates.push(options);
        current.state = options.state;
        return Object.assign({}, current);
      },
    },
  };
  const context = vm.createContext({
    browser,
    document: { getElementById(id) { return id === 'windowSizeButton' ? button : null; } },
    Number,
    Promise,
  });
  vm.runInContext(source('src/sidebar/sidebar-window-controls.js'), context, { filename: 'sidebar-window-controls.js' });
  return { button, attributes, listeners, boundsListeners, updates, current };
}

test('detached inspector exposes a local maximize control in its header', () => {
  const html = source('src/sidebar/sidebar.html');
  assert.match(html, /id="windowSizeButton"[^>]+title="Maximize window"/);
  assert.match(html, /<script src="sidebar-window-controls\.js"><\/script>/);
});

test('maximize control toggles the popup between maximized and normal states', async () => {
  const h = buttonHarness();
  await tick();

  assert.equal(h.button.hidden, false);
  assert.equal(h.button.title, 'Maximize window');
  assert.equal(h.button.textContent, '□');
  assert.equal(h.attributes['aria-label'], 'Maximize window');
  assert.equal(h.attributes['aria-pressed'], 'false');

  h.listeners.click();
  await tick();
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].state, 'maximized');
  assert.equal(h.button.title, 'Restore window');
  assert.equal(h.button.textContent, '❐');
  assert.equal(h.attributes['aria-label'], 'Restore window');
  assert.equal(h.attributes['aria-pressed'], 'true');
  assert.equal(h.button.disabled, false);

  h.listeners.click();
  await tick();
  assert.equal(h.updates.length, 2);
  assert.equal(h.updates[1].state, 'normal');
  assert.equal(h.button.title, 'Maximize window');
  assert.equal(h.attributes['aria-pressed'], 'false');
});

test('maximize control tracks external bounds/state changes for the inspector window only', async () => {
  const h = buttonHarness();
  await tick();
  assert.equal(h.boundsListeners.length, 1);

  h.boundsListeners[0]({ id: 50, state: 'maximized' });
  assert.equal(h.button.title, 'Maximize window');

  h.boundsListeners[0]({ id: 99, state: 'maximized' });
  assert.equal(h.button.title, 'Restore window');
  assert.equal(h.attributes['aria-pressed'], 'true');

  h.boundsListeners[0]({ id: 99, state: 'normal' });
  assert.equal(h.button.title, 'Maximize window');
  assert.equal(h.attributes['aria-pressed'], 'false');
});
