'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function event() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function harness() {
  const runtimeOnMessage = event();
  const tabOnActivated = event();
  const tabOnUpdated = event();
  const tabOnRemoved = event();
  const windowOnFocusChanged = event();
  const windowOnRemoved = event();
  const messages = [];
  const createdWindows = [];
  const updatedWindows = [];
  const storage = {};
  const tabs = new Map([
    [10, { id: 10, url: 'https://example.test/a', active: true, windowId: 1 }],
    [11, { id: 11, url: 'https://example.test/b', active: false, windowId: 1 }],
    [90, { id: 90, url: 'moz-extension://test/sidebar/sidebar.html', active: true, windowId: 99 }],
  ]);
  const windows = new Map([
    [1, { id: 1, type: 'normal', focused: true, tabs: [tabs.get(10), tabs.get(11)] }],
  ]);

  const browser = {
    runtime: {
      onMessage: runtimeOnMessage,
      getURL(value) { return `moz-extension://test/${value}`; },
      async sendMessage(message) { messages.push(message); return undefined; },
    },
    storage: {
      session: {
        async get(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? { [key]: storage[key] } : {}; },
        async set(values) { Object.assign(storage, values); },
      },
    },
    tabs: {
      onActivated: tabOnActivated,
      onUpdated: tabOnUpdated,
      onRemoved: tabOnRemoved,
      async get(tabId) {
        if (!tabs.has(tabId)) throw new Error('missing-tab');
        return tabs.get(tabId);
      },
      async query(query) {
        const win = windows.get(query.windowId);
        if (!win) return [];
        return (win.tabs || []).filter((tab) => !query.active || tab.active);
      },
    },
    windows: {
      onFocusChanged: windowOnFocusChanged,
      onRemoved: windowOnRemoved,
      async get(windowId) {
        if (!windows.has(windowId)) throw new Error('missing-window');
        return windows.get(windowId);
      },
      async getAll() { return Array.from(windows.values()).filter((item) => item.type === 'normal'); },
      async create(options) {
        const created = { id: 99, type: options.type, focused: options.focused, tabs: [tabs.get(90)] };
        windows.set(99, created);
        createdWindows.push(options);
        return created;
      },
      async update(windowId, options) {
        updatedWindows.push({ windowId, options });
        return Object.assign(windows.get(windowId), options);
      },
    },
  };

  const context = vm.createContext({ browser, console, Number, Promise });
  vm.runInContext(source('src/background/window-background.js'), context, { filename: 'window-background.js' });

  async function dispatch(message) {
    for (const listener of runtimeOnMessage.listeners) {
      const value = listener(message, {});
      if (value !== undefined) return value;
    }
    return undefined;
  }

  return {
    browser,
    tabs,
    windows,
    storage,
    messages,
    createdWindows,
    updatedWindows,
    runtimeOnMessage,
    tabOnActivated,
    tabOnUpdated,
    tabOnRemoved,
    windowOnFocusChanged,
    windowOnRemoved,
    dispatch,
  };
}

test('manifest uses a toolbar launcher, neutral branding, and no longer registers a Firefox sidebar', () => {
  const manifest = JSON.parse(source('src/manifest.json'));
  assert.equal(manifest.name, 'SEO Inspector');
  assert.doesNotMatch(manifest.name, /firefox|mozilla/i);
  assert.doesNotMatch(manifest.action.default_title, /firefox|mozilla/i);
  assert.equal(manifest.action.default_popup, 'launcher/launcher.html');
  assert.equal(Object.prototype.hasOwnProperty.call(manifest, 'sidebar_action'), false);
  assert.ok(manifest.background.scripts.includes('background/window-background.js'));
  assert.deepEqual(manifest.permissions, ['storage', 'tabs', 'webRequest']);

  const inspectorHtml = source('src/sidebar/sidebar.html');
  const launcherHtml = source('src/launcher/launcher.html');
  assert.match(inspectorHtml, /<title>SEO Inspector<\/title>/);
  assert.match(launcherHtml, /<title>SEO Inspector<\/title>/);
  assert.doesNotMatch(inspectorHtml.match(/<title>[^<]+<\/title>/)[0], /firefox|mozilla/i);
  assert.doesNotMatch(launcherHtml.match(/<title>[^<]+<\/title>/)[0], /firefox|mozilla/i);
});

test('detached inspector creates one resizable popup window and focuses it on later opens', async () => {
  const h = harness();
  const first = await h.dispatch({ type: 'seoInspector.openWindow', tabId: 10 });
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.windowId, 99);
  assert.equal(first.targetTabId, 10);
  assert.equal(h.createdWindows.length, 1);
  const created = h.createdWindows[0];
  assert.equal(created.url, 'moz-extension://test/sidebar/sidebar.html');
  assert.equal(created.type, 'popup');
  assert.equal(created.focused, true);
  assert.equal(created.width, 1040);
  assert.equal(created.height, 900);

  const second = await h.dispatch({ type: 'seoInspector.openWindow', tabId: 11 });
  assert.equal(second.created, false);
  assert.equal(second.windowId, 99);
  assert.equal(second.targetTabId, 11);
  assert.equal(h.createdWindows.length, 1);
  const update = h.updatedWindows.at(-1);
  assert.equal(update.windowId, 99);
  assert.equal(update.options.focused, true);

  const target = await h.dispatch({ type: 'seoInspector.getTargetTab' });
  assert.equal(target.id, 11);
});

test('detached inspector follows activated normal tabs but ignores its own popup tab', async () => {
  const h = harness();
  await h.dispatch({ type: 'seoInspector.openWindow', tabId: 10 });
  h.messages.length = 0;

  h.tabs.get(10).active = false;
  h.tabs.get(11).active = true;
  h.tabOnActivated.listeners[0]({ tabId: 11, windowId: 1 });
  await tick();
  const target = await h.dispatch({ type: 'seoInspector.getTargetTab' });
  assert.equal(target.id, 11);
  assert.ok(h.messages.some((message) => message.type === 'seoInspector.targetChanged' && message.tabId === 11));

  h.messages.length = 0;
  h.tabOnActivated.listeners[0]({ tabId: 90, windowId: 99 });
  await tick();
  const unchanged = await h.dispatch({ type: 'seoInspector.getTargetTab' });
  assert.equal(unchanged.id, 11);
  assert.equal(h.messages.length, 0);
});

test('detached target adapter requests the background target instead of currentWindow', () => {
  const adapter = source('src/sidebar/sidebar-detached-target.js');
  assert.match(adapter, /seoInspector\.getTargetTab/);
  assert.match(adapter, /seoInspector\.targetChanged/);
  assert.doesNotMatch(adapter, /currentWindow\s*:\s*true/);

  const html = source('src/sidebar/sidebar.html');
  const baseIndex = html.indexOf('sidebar-base.js');
  const adapterIndex = html.indexOf('sidebar-detached-target.js');
  const mainIndex = html.indexOf('sidebar-main.js');
  assert.ok(baseIndex >= 0 && adapterIndex > baseIndex && mainIndex > adapterIndex);
});

test('toolbar launcher passes the current browser tab to the detached-window controller', async () => {
  const sent = [];
  let closed = false;
  const status = { textContent: '' };
  const context = vm.createContext({
    Number,
    Promise,
    document: { getElementById() { return status; } },
    window: { close() { closed = true; } },
    browser: {
      tabs: {
        async query(options) {
          assert.equal(options.active, true);
          assert.equal(options.currentWindow, true);
          return [{ id: 42 }];
        },
      },
      runtime: { async sendMessage(message) { sent.push(message); return { ok: true }; } },
    },
  });
  vm.runInContext(source('src/launcher/launcher.js'), context, { filename: 'launcher.js' });
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'seoInspector.openWindow');
  assert.equal(sent[0].tabId, 42);
  assert.equal(closed, true);
});
