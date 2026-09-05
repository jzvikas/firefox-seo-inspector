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

function node(text) {
  return {
    textContent: text || '',
    children: [],
    dataset: {},
    classList: { toggle() {} },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    click() {},
  };
}

test('one renderer exception is isolated and later Inspector panels still render', async () => {
  const panels = new Map();
  const ids = [
    'overview', 'indexability', 'performance', 'content', 'security', 'serp', 'hreflang', 'issues',
    'headings', 'links', 'images', 'product', 'category', 'schema', 'social', 'compare', 'rules',
    'profiles', 'multitab', 'crawler',
  ];
  ids.forEach((id) => panels.set(id, node()));
  const refreshButton = node();
  const copyButton = node();
  const exportButton = node();
  const statusCounts = node();
  const windowListeners = new Map();
  const rendered = [];
  const statuses = [];

  const context = vm.createContext({
    console,
    Promise,
    setTimeout,
    URL: Object.assign(URL, {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {},
    }),
    Blob: function Blob() {},
    ContentConnection,
    state: { report: { evaluation: { issues: [] } }, tabId: 7 },
    statusCounts,
    crawlerState: { running: false },
    document: {
      querySelectorAll() { return []; },
      getElementById(id) {
        if (id === 'refreshButton') return refreshButton;
        if (id === 'copyIssuesButton') return copyButton;
        if (id === 'exportButton') return exportButton;
        return panels.get(id) || null;
      },
      createElement() { return node(); },
    },
    window: {
      addEventListener(type, listener) { windowListeners.set(type, listener); },
    },
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
    setStatus(title, detail) { statuses.push({ title, detail }); },
    el(_tag, className, text) {
      const output = node(String(text || ''));
      output.className = className || '';
      return output;
    },
    refresh: async () => {},
    renderHeader() { rendered.push('header'); },
    renderOverview() { rendered.push('overview'); },
    renderIndexability() { rendered.push('indexability'); },
    renderPerformance() { rendered.push('performance'); },
    renderPerformanceHints() { rendered.push('performance-hints'); },
    renderAssetAudit() { rendered.push('assets'); },
    renderThirdPartyAudit() { rendered.push('third-party'); },
    renderContent() { rendered.push('content'); },
    renderSecurity() { rendered.push('security'); },
    renderSerp() { rendered.push('serp'); },
    renderHreflang() { rendered.push('hreflang'); },
    renderIssues() { rendered.push('issues'); },
    renderHeadings() { rendered.push('headings'); },
    renderLinks() { rendered.push('links'); },
    renderImagesNetwork() { rendered.push('images'); },
    renderProduct() { rendered.push('product'); },
    renderCategory() { rendered.push('category'); throw new Error('category renderer failed'); },
    renderSchema() { rendered.push('schema'); },
    renderSocial() { rendered.push('social'); },
    renderCompare() { rendered.push('compare'); },
    renderRules() { rendered.push('rules'); },
    renderProfiles() { rendered.push('profiles'); },
    renderMultiTab() { rendered.push('multitab'); },
    renderCrawler() { rendered.push('crawler'); },
  });

  vm.runInContext(source('src/sidebar/sidebar-main.js'), context, { filename: 'sidebar-main.js' });
  await Promise.resolve();
  vm.runInContext('renderAll()', context);

  assert.ok(rendered.includes('category'));
  assert.ok(rendered.includes('schema'));
  assert.ok(rendered.includes('crawler'));
  assert.equal(context.state.uiErrors.length, 1);
  assert.equal(context.state.uiErrors[0].section, 'category');
  assert.equal(context.state.runtimeErrors.length, 1);
  assert.match(panels.get('category').children.map((child) => child.textContent).join(' '), /Inspector UI section failed|category renderer failed/);
  assert.match(statusCounts.textContent, /1 Inspector UI section failed/);

  assert.equal(windowListeners.has('unhandledrejection'), true);
  let prevented = false;
  windowListeners.get('unhandledrejection')({
    reason: new Error('async exploded'),
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(context.state.runtimeErrors.length, 2);
  assert.ok(statuses.some((item) => item.title === 'Inspector runtime error'));
});
