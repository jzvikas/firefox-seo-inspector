'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function node() {
  return {
    textContent: '',
    dataset: {},
    classList: { toggle() {} },
    addEventListener() {},
    appendChild() {},
    removeChild() {},
    click() {},
    firstChild: null,
  };
}

async function flushAsyncUi() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test('inactive Inspector panels render lazily and heavy panels load only on demand', async () => {
  const calls = new Map();
  const heavyRequests = [];
  const count = (name) => calls.set(name, (calls.get(name) || 0) + 1);
  const panels = new Map();
  const ids = [
    'overview', 'indexability', 'performance', 'content', 'security', 'serp', 'hreflang', 'issues',
    'headings', 'links', 'images', 'product', 'category', 'schema', 'social', 'compare', 'rules',
    'profiles', 'multitab', 'crawler',
  ];
  ids.forEach((id) => panels.set(id, node()));
  const buttons = new Map([
    ['refreshButton', node()],
    ['copyIssuesButton', node()],
    ['exportButton', node()],
  ]);
  const statusCounts = node();

  const context = vm.createContext({
    console,
    Promise,
    Map,
    Set,
    setTimeout,
    URL: Object.assign(URL, {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {},
    }),
    Blob: function Blob() {},
    state: {
      report: {
        facts: { url: 'https://example.com/' },
        evaluation: { issues: [] },
        heavyAudit: { performance: false, content: false, security: false },
      },
      tabId: 5,
    },
    statusCounts,
    crawlerState: { running: false },
    currentActiveTab: { id: 5, url: 'https://example.com/' },
    document: {
      querySelectorAll() { return []; },
      getElementById(id) { return buttons.get(id) || panels.get(id) || null; },
      createElement() { return node(); },
    },
    window: { addEventListener() {} },
    navigator: { clipboard: { async writeText() {} } },
    browser: {
      tabs: {
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
        onRemoved: { addListener() {} },
        async sendMessage(tabId, message) {
          if (message && message.type === 'seoInspector.analyzeHeavy') {
            heavyRequests.push({ tabId, groups: Array.isArray(message.groups) ? message.groups.slice() : [] });
            return {
              url: 'https://example.com/',
              groups: { performance: true },
              pageContext: {},
              performance: { summary: {} },
              performanceHints: {},
              assetAudit: {},
              thirdPartyAudit: {},
            };
          }
          return { ok: true };
        },
      },
      runtime: {
        onMessage: { addListener() {} },
        async sendMessage() { return { ok: true }; },
      },
    },
    setStatus() {},
    el() { return node(); },
    clear() {},
    refresh: async () => {},
    renderHeader() { count('header'); },
    renderOverview() { count('overview'); },
    renderIndexability() { count('indexability'); },
    renderPerformance() { count('performance'); },
    renderPerformanceHints() { count('performance-hints'); },
    renderAssetAudit() { count('assets'); },
    renderThirdPartyAudit() { count('third-party'); },
    renderContent() { count('content'); },
    renderSecurity() { count('security'); },
    renderSerp() { count('serp'); },
    renderHreflang() { count('hreflang'); },
    renderIssues() { count('issues'); },
    renderHeadings() { count('headings'); },
    renderLinks() { count('links'); },
    renderImagesNetwork() { count('images'); },
    renderProduct() { count('product'); },
    renderCategory() { count('category'); },
    renderSchema() { count('schema'); },
    renderSocial() { count('social'); },
    renderCompare() { count('compare'); },
    renderRules() { count('rules'); },
    renderProfiles() { count('profiles'); },
    renderMultiTab() { count('multitab'); },
    renderCrawler() { count('crawler'); },
  });

  vm.runInContext(source('src/sidebar/sidebar-main.js'), context, { filename: 'sidebar-main.js' });
  await Promise.resolve();

  vm.runInContext('renderAll()', context);
  assert.equal(calls.get('overview'), 1);
  assert.equal(calls.get('performance') || 0, 0);
  assert.equal(heavyRequests.length, 0);
  assert.equal(calls.get('compare') || 0, 0);
  assert.equal(calls.get('crawler') || 0, 0);

  vm.runInContext("activateTab('performance')", context);
  assert.equal(calls.get('performance') || 0, 0, 'heavy renderer waits for the explicit heavy audit result');
  assert.equal(heavyRequests.length, 1);
  assert.equal(heavyRequests[0].tabId, 5);
  assert.equal(heavyRequests[0].groups.join(','), 'performance');
  await flushAsyncUi();
  assert.equal(calls.get('performance'), 1);
  assert.equal(calls.get('performance-hints'), 1);
  assert.equal(calls.get('assets'), 1);
  assert.equal(calls.get('third-party'), 1);

  vm.runInContext("activateTab('performance')", context);
  assert.equal(heavyRequests.length, 1, 'cached heavy data is reused for the current page');
  assert.equal(calls.get('performance'), 1);
  assert.equal(calls.get('performance-hints'), 1);
  assert.equal(calls.get('assets'), 1);
  assert.equal(calls.get('third-party'), 1);

  vm.runInContext("markPanelDirty('performance'); activateTab('performance')", context);
  assert.equal(heavyRequests.length, 1, 'rerendering a dirty panel does not refetch unchanged heavy data');
  assert.equal(calls.get('performance'), 2);
  assert.equal(calls.get('performance-hints'), 2);
  assert.equal(calls.get('assets'), 2);
  assert.equal(calls.get('third-party'), 2);

  const beforeOverview = calls.get('overview');
  vm.runInContext('renderAll()', context);
  assert.equal(calls.get('overview'), beforeOverview);
  assert.equal(calls.get('performance'), 3);
  assert.equal(heavyRequests.length, 1);
  assert.equal(calls.get('compare') || 0, 0);
  assert.equal(calls.get('crawler') || 0, 0);
});
