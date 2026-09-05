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
    click() {},
  };
}

test('inactive Inspector panels render lazily and only rerender when dirty', async () => {
  const calls = new Map();
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
    setTimeout,
    URL: Object.assign(URL, {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {},
    }),
    Blob: function Blob() {},
    state: { report: { evaluation: { issues: [] } }, tabId: 5 },
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
        async sendMessage() { return { ok: true }; },
      },
      runtime: {
        onMessage: { addListener() {} },
        async sendMessage() { return { ok: true }; },
      },
    },
    setStatus() {},
    el() { return node(); },
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
  assert.equal(calls.get('compare') || 0, 0);
  assert.equal(calls.get('crawler') || 0, 0);

  vm.runInContext("activateTab('performance')", context);
  assert.equal(calls.get('performance'), 1);
  assert.equal(calls.get('performance-hints'), 1);
  assert.equal(calls.get('assets'), 1);
  assert.equal(calls.get('third-party'), 1);

  vm.runInContext("activateTab('performance')", context);
  assert.equal(calls.get('performance'), 1);
  assert.equal(calls.get('performance-hints'), 1);
  assert.equal(calls.get('assets'), 1);
  assert.equal(calls.get('third-party'), 1);

  vm.runInContext("markPanelDirty('performance'); activateTab('performance')", context);
  assert.equal(calls.get('performance'), 2);
  assert.equal(calls.get('performance-hints'), 2);
  assert.equal(calls.get('assets'), 2);
  assert.equal(calls.get('third-party'), 2);

  const beforeOverview = calls.get('overview');
  vm.runInContext('renderAll()', context);
  assert.equal(calls.get('overview'), beforeOverview);
  assert.equal(calls.get('performance'), 3);
  assert.equal(calls.get('compare') || 0, 0);
  assert.equal(calls.get('crawler') || 0, 0);
});
