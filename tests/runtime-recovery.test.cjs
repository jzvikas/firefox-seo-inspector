'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ContentConnection = require('../src/lib/content-connection.js');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeRefreshHarness(options) {
  const opts = options || {};
  const statuses = [];
  const tabMessages = [];
  const runtimeMessages = [];
  let renderCalls = 0;
  const tabs = Array.isArray(opts.tabs) ? opts.tabs.slice() : [{ id: 1, url: 'https://example.com/' }];
  let queryIndex = 0;

  const state = {
    tabId: null,
    report: null,
    linkResults: new Map(),
    rawReport: null,
    rawDiff: null,
    indexabilityRawDiff: undefined,
    canonicalChecks: new Map(),
    robotsReport: null,
    sitemapReport: null,
    sitemapChecking: false,
    sitemapOperationId: null,
    issueFilter: 'all',
  };
  const pageUrl = { textContent: '', title: '' };
  const context = vm.createContext({
    URL,
    console,
    Promise,
    Map,
    state,
    pageUrl,
    ContentConnection,
    browser: {
      tabs: {
        async query() {
          const item = tabs[Math.min(queryIndex, tabs.length - 1)] || null;
          queryIndex += 1;
          return item ? [item] : [];
        },
        async sendMessage(tabId, message) {
          tabMessages.push({ tabId, message });
          if (opts.sendMessage) return opts.sendMessage(tabId, message);
          if (message.type === 'seoInspector.ping') return { ok: true, url: tabs[0] && tabs[0].url };
          if (message.type === 'seoInspector.analyze') return {
            facts: { url: tabs[0] && tabs[0].url },
            evaluation: { issues: [], severityCounts: { critical: 0, warning: 0 }, indexability: { indexable: true } },
          };
          return { ok: true };
        },
      },
      runtime: {
        async sendMessage(message) {
          runtimeMessages.push(message);
          if (opts.runtimeSendMessage) return opts.runtimeSendMessage(message);
          return null;
        },
      },
    },
    setStatus(title, detail) { statuses.push({ title, detail }); },
    renderAll() { renderCalls += 1; },
    Indexability: { analyze() { return { indexable: true }; } },
  });
  vm.runInContext(source('src/sidebar/sidebar-runtime-recovery.js'), context, { filename: 'sidebar-runtime-recovery.js' });
  vm.runInContext(source('src/sidebar/sidebar-base.js'), context, { filename: 'sidebar-base.js' });

  return {
    context,
    state,
    pageUrl,
    statuses,
    tabMessages,
    runtimeMessages,
    get renderCalls() { return renderCalls; },
  };
}

test('restricted/non-http pages are reported explicitly without content-script recovery', async () => {
  const h = makeRefreshHarness({ tabs: [{ id: 9, url: 'about:config' }] });
  await vm.runInContext('refresh()', h.context);
  assert.equal(h.state.report, null);
  assert.equal(h.tabMessages.length, 0);
  assert.equal(h.runtimeMessages.length, 0);
  assert.equal(h.renderCalls, 1);
  assert.ok(h.statuses.some((item) => item.title === 'Unsupported page'));
});

test('an HTTP tab with a live content script is analyzed without reinjection', async () => {
  const h = makeRefreshHarness({
    tabs: [{ id: 4, url: 'https://example.com/product' }],
    sendMessage: async (_tabId, message) => {
      if (message.type === 'seoInspector.ping') return { ok: true, url: 'https://example.com/product' };
      if (message.type === 'seoInspector.analyze') return {
        facts: { url: 'https://example.com/product' },
        evaluation: { issues: [], severityCounts: { critical: 0, warning: 0 }, indexability: { indexable: true } },
      };
      return { ok: true };
    },
  });
  await vm.runInContext('refresh()', h.context);
  assert.deepEqual(h.tabMessages.map((item) => item.message.type), ['seoInspector.ping', 'seoInspector.analyze', 'seoInspector.watch']);
  assert.equal(h.runtimeMessages.length, 0);
  assert.equal(h.state.report.facts.url, 'https://example.com/product');
});

test('missing content script is restored locally before analysis', async () => {
  let pingCount = 0;
  const h = makeRefreshHarness({
    tabs: [{ id: 5, url: 'https://example.com/' }],
    sendMessage: async (_tabId, message) => {
      if (message.type === 'seoInspector.ping') {
        pingCount += 1;
        if (pingCount === 1) throw new Error('Receiving end does not exist');
        return { ok: true, url: 'https://example.com/' };
      }
      if (message.type === 'seoInspector.analyze') return {
        facts: { url: 'https://example.com/' },
        evaluation: { issues: [], severityCounts: { critical: 0, warning: 0 }, indexability: { indexable: true } },
      };
      return { ok: true };
    },
    runtimeSendMessage: async (message) => {
      if (message.type === 'seoInspector.ensureContentScript') return { ok: true, injected: true };
      return null;
    },
  });
  await vm.runInContext('refresh()', h.context);
  assert.equal(pingCount, 2);
  assert.ok(h.runtimeMessages.some((item) => item.type === 'seoInspector.ensureContentScript'));
  assert.equal(h.state.report.facts.url, 'https://example.com/');
});

test('restricted injection failure produces a page-access state instead of stale reload advice', async () => {
  const h = makeRefreshHarness({
    tabs: [{ id: 6, url: 'https://addons.mozilla.org/' }],
    sendMessage: async (_tabId, message) => {
      if (message.type === 'seoInspector.ping') throw new Error('Could not establish connection. Receiving end does not exist.');
      return null;
    },
    runtimeSendMessage: async (message) => {
      if (message.type === 'seoInspector.ensureContentScript') return { ok: false, reason: 'restricted', detail: 'Missing host permission for the tab' };
      return null;
    },
  });
  await vm.runInContext('refresh()', h.context);
  assert.equal(h.state.report, null);
  assert.equal(h.renderCalls, 1);
  assert.ok(h.statuses.some((item) => item.title === 'Page access blocked'));
  assert.equal(h.statuses.some((item) => /reload the page after installing/i.test(item.detail || '')), false);
});

test('stale slower refresh cannot overwrite a newer tab report', async () => {
  const firstEnsureStarted = deferred();
  const releaseFirstEnsure = deferred();
  let firstPing = true;
  const h = makeRefreshHarness({
    tabs: [
      { id: 1, url: 'https://one.example/' },
      { id: 2, url: 'https://two.example/' },
    ],
    sendMessage: async (tabId, message) => {
      if (message.type === 'seoInspector.ping' && tabId === 1 && firstPing) {
        firstPing = false;
        throw new Error('Receiving end does not exist');
      }
      if (message.type === 'seoInspector.ping') return { ok: true, url: tabId === 1 ? 'https://one.example/' : 'https://two.example/' };
      if (message.type === 'seoInspector.analyze') return {
        facts: { url: tabId === 1 ? 'https://one.example/' : 'https://two.example/' },
        evaluation: { issues: [], severityCounts: { critical: 0, warning: 0 }, indexability: { indexable: true } },
      };
      return { ok: true };
    },
    runtimeSendMessage: async (message) => {
      if (message.type === 'seoInspector.ensureContentScript' && message.tabId === 1) {
        firstEnsureStarted.resolve();
        await releaseFirstEnsure.promise;
        return { ok: true, injected: true };
      }
      return { ok: true };
    },
  });

  const older = vm.runInContext('refresh()', h.context);
  await firstEnsureStarted.promise;
  const newer = vm.runInContext('refresh()', h.context);
  await newer;

  assert.equal(h.state.tabId, 2);
  assert.equal(h.state.report.facts.url, 'https://two.example/');
  assert.deepEqual(h.tabMessages.map((item) => [item.tabId, item.message.type]), [
    [2, 'seoInspector.analyze'],
    [2, 'seoInspector.watch'],
  ]);

  releaseFirstEnsure.resolve();
  await older;

  assert.equal(h.state.tabId, 2);
  assert.equal(h.state.report.facts.url, 'https://two.example/');
  assert.equal(h.renderCalls, 1);
  assert.deepEqual(h.tabMessages.map((item) => item.tabId), [2, 2]);
});

test('content bootstrap is guarded against duplicate injection and exposes a ping listener', () => {
  const content = source('src/content/content.js');
  assert.match(content, /__seoInspectorContentBootstrappedV1/);
  assert.match(content, /if \(globalThis\[BOOTSTRAP_KEY\]\) return/);
  assert.match(content, /message\.type === 'seoInspector\.ping'/);
});

test('sidebar main isolates lazy renderer failures and captures unhandled async failures', () => {
  const main = source('src/sidebar/sidebar-main.js');
  assert.match(main, /const PANEL_RENDERERS = Object\.freeze/);
  assert.match(main, /overview:\s*\[renderOverview\]/);
  assert.match(main, /category:\s*\[renderCategory\]/);
  assert.match(main, /function safeRender\(section, renderer\)/);
  assert.match(main, /function renderPanel\(name, options\)/);
  assert.match(main, /if \(!safeRender\(name, renderer\)\) ok = false/);
  assert.match(main, /renderPanel\(activePanelName, \{ force: true, skipStatusRefresh: true \}\)/);
  assert.match(main, /window\.addEventListener\('unhandledrejection'/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /refreshSafely\('startup'\)/);
});
