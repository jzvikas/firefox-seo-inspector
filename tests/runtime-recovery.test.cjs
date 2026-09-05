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
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function recoveryHarness(options) {
  const opts = options || {};
  const statuses = [];
  const tabMessages = [];
  let renderCalls = 0;
  let ensureCalls = 0;
  const defaultReport = opts.report || {
    facts: { url: 'https://example.test/', robots: [] },
    responseMeta: null,
    evaluation: { indexability: { verdict: 'Indexable' } },
  };
  const state = {
    tabId: null,
    report: null,
    linkResults: new Map(),
    rawReport: null,
    rawDiff: null,
    indexabilityRawDiff: undefined,
    robotsReport: null,
    sitemapReport: null,
    sitemapChecking: false,
    sitemapOperationId: null,
  };
  const context = vm.createContext({
    Map,
    Number,
    Promise,
    ContentConnection: Object.assign({}, ContentConnection, {
      async ensure(_browser, tabId, manifest) {
        ensureCalls += 1;
        if (typeof opts.ensure === 'function') return opts.ensure(tabId, manifest, ensureCalls);
        if (opts.ensureError) throw opts.ensureError;
        return opts.connection || { ok: true, recovered: false, injected: false };
      },
    }),
    state,
    pageUrl: { textContent: '', title: '' },
    setStatus(title, detail) { statuses.push({ title, detail }); },
    renderAll() { renderCalls += 1; },
    activeTab: async () => {
      if (typeof opts.activeTab === 'function') return opts.activeTab();
      return opts.tab === undefined ? { id: 8, url: 'https://example.test/' } : opts.tab;
    },
    browser: {
      tabs: {
        async sendMessage(tabId, message) {
          tabMessages.push({ tabId, message });
          if (typeof opts.tabSendMessage === 'function') return opts.tabSendMessage(tabId, message);
          if (message.type === 'seoInspector.analyze') {
            if (opts.analyzeError) throw opts.analyzeError;
            if (typeof opts.reportForTab === 'function') return opts.reportForTab(tabId);
            return defaultReport;
          }
          return { ok: true };
        },
      },
      runtime: {
        getManifest() { return { content_scripts: [{ js: ['content/content.js'] }] }; },
        async sendMessage(message) {
          if (typeof opts.runtimeSendMessage === 'function') return opts.runtimeSendMessage(message);
          return opts.robotsReport || null;
        },
      },
    },
    Indexability: { analyze() { return { verdict: 'Indexable' }; } },
  });
  context.refresh = async function baseRefresh() {};
  vm.runInContext(source('src/sidebar/sidebar-runtime-recovery.js'), context, { filename: 'sidebar-runtime-recovery.js' });
  return {
    context,
    state,
    statuses,
    tabMessages,
    get renderCalls() { return renderCalls; },
    get ensureCalls() { return ensureCalls; },
  };
}

test('runtime recovery reconnects an HTTP tab and completes the audit without requiring a page reload', async () => {
  const h = recoveryHarness({ connection: { ok: true, recovered: true, injected: true } });
  await vm.runInContext('refresh()', h.context);
  assert.equal(h.ensureCalls, 1);
  assert.equal(h.state.report.facts.url, 'https://example.test/');
  assert.equal(h.renderCalls, 1);
  assert.ok(h.statuses.some((item) => item.title === 'Reconnected to page'));
  assert.deepEqual(h.tabMessages.map((item) => [item.tabId, item.message.type]), [
    [8, 'seoInspector.analyze'],
    [8, 'seoInspector.watch'],
  ]);
});

test('runtime recovery explains unsupported Firefox pages without attempting injection', async () => {
  const h = recoveryHarness({ tab: { id: 4, url: 'about:addons' } });
  await vm.runInContext('refresh()', h.context);
  assert.equal(h.ensureCalls, 0);
  assert.equal(h.state.report, null);
  assert.equal(h.statuses.at(-1).title, 'Firefox page cannot be inspected');
  assert.match(h.statuses.at(-1).detail, /HTTP or HTTPS/);
  assert.equal(h.tabMessages.length, 0);
});

test('runtime recovery reports protected/restricted page access when injection is blocked', async () => {
  const h = recoveryHarness({
    tab: { id: 5, url: 'https://addons.mozilla.org/example' },
    connection: { ok: false, code: 'injection-blocked', error: { name: 'Error', message: 'blocked' } },
  });
  await vm.runInContext('refresh()', h.context);
  assert.equal(h.ensureCalls, 1);
  assert.equal(h.state.report, null);
  assert.equal(h.statuses.at(-1).title, 'Page access unavailable');
  assert.match(h.statuses.at(-1).detail, /did not allow/);
  assert.equal(h.tabMessages.length, 0);
});

test('runtime recovery distinguishes an audit exception from a missing content script', async () => {
  const h = recoveryHarness({
    connection: { ok: true, recovered: false, injected: false },
    analyzeError: new Error('renderer dependency exploded'),
  });
  await vm.runInContext('refresh()', h.context);
  assert.equal(h.ensureCalls, 1);
  assert.equal(h.state.report, null);
  assert.equal(h.statuses.at(-1).title, 'Audit failed');
  assert.match(h.statuses.at(-1).detail, /runtime error/);
  assert.equal(h.state.lastRuntimeError.name, 'Error');
  assert.deepEqual(h.tabMessages.map((item) => item.message.type), ['seoInspector.analyze']);
});

test('older refresh cannot overwrite a newer target tab after an async reconnect delay', async () => {
  const firstEnsureStarted = deferred();
  const releaseFirstEnsure = deferred();
  const tabs = [
    { id: 1, url: 'https://one.example/' },
    { id: 2, url: 'https://two.example/' },
  ];
  let activeCalls = 0;
  const h = recoveryHarness({
    activeTab() {
      const tab = tabs[Math.min(activeCalls, tabs.length - 1)];
      activeCalls += 1;
      return tab;
    },
    async ensure(tabId) {
      if (tabId === 1) {
        firstEnsureStarted.resolve();
        await releaseFirstEnsure.promise;
      }
      return { ok: true, recovered: false, injected: false };
    },
    reportForTab(tabId) {
      return {
        facts: { url: tabId === 1 ? 'https://one.example/' : 'https://two.example/', robots: [] },
        responseMeta: null,
        evaluation: { indexability: { verdict: 'Indexable' } },
      };
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
  assert.match(main, /function safeRender\(section, renderer\)/);
  assert.match(main, /overview:\s*\[renderOverview\]/);
  assert.match(main, /category:\s*\[renderCategory\]/);
  assert.match(main, /function renderPanel\(name, options\)/);
  assert.match(main, /renderPanel\(activePanelName, \{ force: true, skipStatusRefresh: true \}\)/);
  assert.match(main, /window\.addEventListener\('unhandledrejection'/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /refreshSafely\('startup'\)/);
});
