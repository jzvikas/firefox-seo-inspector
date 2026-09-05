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

function recoveryHarness(options) {
  const opts = options || {};
  const statuses = [];
  const sentToTab = [];
  let renderCalls = 0;
  let ensureCalls = 0;
  const report = opts.report || {
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
      async ensure() {
        ensureCalls += 1;
        if (opts.ensureError) throw opts.ensureError;
        return opts.connection || { ok: true, recovered: false, injected: false };
      },
    }),
    state,
    pageUrl: { textContent: '', title: '' },
    setStatus(title, detail) { statuses.push({ title, detail }); },
    renderAll() { renderCalls += 1; },
    activeTab: async () => opts.tab === undefined ? { id: 8, url: 'https://example.test/' } : opts.tab,
    sendToTab: async (message) => {
      sentToTab.push(message);
      if (message.type === 'seoInspector.analyze') {
        if (opts.analyzeError) throw opts.analyzeError;
        return report;
      }
      return { ok: true };
    },
    browser: {
      runtime: {
        getManifest() { return { content_scripts: [{ js: ['content/content.js'] }] }; },
        async sendMessage() { return opts.robotsReport || null; },
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
    sentToTab,
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
  assert.deepEqual(h.sentToTab.map((item) => item.type), ['seoInspector.analyze', 'seoInspector.watch']);
});

test('runtime recovery explains unsupported Firefox pages without attempting injection', async () => {
  const h = recoveryHarness({ tab: { id: 4, url: 'about:addons' } });
  await vm.runInContext('refresh()', h.context);
  assert.equal(h.ensureCalls, 0);
  assert.equal(h.state.report, null);
  assert.equal(h.statuses.at(-1).title, 'Firefox page cannot be inspected');
  assert.match(h.statuses.at(-1).detail, /HTTP or HTTPS/);
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
});

test('content bootstrap is guarded against duplicate injection and exposes a ping listener', () => {
  const content = source('src/content/content.js');
  assert.match(content, /__seoInspectorContentBootstrappedV1/);
  assert.match(content, /if \(globalThis\[BOOTSTRAP_KEY\]\) return/);
  assert.match(content, /message\.type === 'seoInspector\.ping'/);
});

test('sidebar main isolates renderer failures and captures unhandled async failures', () => {
  const main = source('src/sidebar/sidebar-main.js');
  assert.match(main, /function safeRender\(section, renderer\)/);
  assert.match(main, /safeRender\('overview', renderOverview\)/);
  assert.match(main, /safeRender\('category', renderCategory\)/);
  assert.match(main, /window\.addEventListener\('unhandledrejection'/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /refreshSafely\('startup'\)/);
});
