'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const MultiTabAudit = require('../src/lib/multi-tab-audit.js');
const CrawlerLite = require('../src/lib/crawler-lite.js');

function source(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'sidebar', name), 'utf8');
}

function fakeNode() {
  return {
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    setAttribute() {},
    click() {},
    className: '',
    textContent: '',
    title: '',
    value: '',
    checked: false,
    disabled: false,
    style: {},
  };
}

function commonUi(panelId, panel) {
  return {
    document: {
      getElementById(id) { return id === panelId ? panel : null; },
      createElement() { return fakeNode(); },
      createTextNode(text) { return { textContent: String(text) }; },
    },
    clear(target) { target.children.length = 0; },
    el(_tag, _className, text) { const output = fakeNode(); output.textContent = text || ''; return output; },
    badge(text) { const output = fakeNode(); output.textContent = text; return output; },
  };
}

function multiTabVm(options) {
  const opts = options || {};
  const panel = fakeNode();
  const ui = commonUi('multitab', panel);
  const context = vm.createContext(Object.assign({
    URL,
    Blob: function Blob() {},
    console,
    setTimeout,
    clearTimeout,
    browser: {
      tabs: {
        query: opts.query || (async () => []),
        sendMessage: opts.sendMessage || (async () => null),
      },
    },
    MultiTabAudit,
  }, ui));
  context.URL.createObjectURL = () => 'blob:test';
  context.URL.revokeObjectURL = () => {};
  vm.runInContext(source('sidebar-multi-tab.js'), context, { filename: 'sidebar-multi-tab.js' });
  return { context, panel };
}

function crawlerVm() {
  const panel = fakeNode();
  const ui = commonUi('crawler', panel);
  const resources = {
    'https://example.com/': { requestedUrl: 'https://example.com/', url: 'https://example.com/', status: 200, redirected: false, error: null, responseMeta: { statusCode: 200 } },
    'https://example.com/b': { requestedUrl: 'https://example.com/b', url: 'https://example.com/b', status: 200, redirected: false, error: null, responseMeta: { statusCode: 200 } },
  };
  const context = vm.createContext(Object.assign({
    URL,
    Blob: function Blob() {},
    console,
    setTimeout,
    clearTimeout,
    Math,
    Date,
    state: { report: { facts: { url: 'https://example.com/' } } },
    CrawlerLite,
    browser: {
      runtime: {
        sendMessage: async (message) => {
          if (message.type === 'seoInspector.crawler.cancel') return { cancelled: 0 };
          return resources[message.url] || { requestedUrl: message.url, url: message.url, status: 404, error: null, responseMeta: { statusCode: 404 } };
        },
      },
    },
    reportFromFetchedCompare: async (resource) => ({
      facts: {
        url: resource.url,
        title: 'Shared title',
        description: resource.url.endsWith('/b') ? 'B description' : 'A description',
        headings: [{ level: 1, text: 'Shared H1' }],
        canonical: { href: resource.url },
        robots: [],
        links: resource.url === 'https://example.com/' ? [{ kind: 'http', href: 'https://example.com/b' }] : [],
      },
      responseMeta: resource.responseMeta,
      evaluation: { score: 100, issues: [], severityCounts: { critical: 0, warning: 0 }, indexability: { verdict: 'Indexable' } },
    }),
  }, ui));
  context.URL.createObjectURL = () => 'blob:test';
  context.URL.revokeObjectURL = () => {};
  vm.runInContext(source('sidebar-crawler.js'), context, { filename: 'sidebar-crawler.js' });
  return { context, panel };
}

test('page comparison wrapper boots using the sidebar active tab state', () => {
  let baseRenderCalls = 0;
  const context = vm.createContext({
    URL,
    console,
    state: { tabId: 42, report: null },
    renderCompare() { baseRenderCalls += 1; },
    document: { getElementById() { return null; } },
    browser: { tabs: { query: async () => [], sendMessage: async () => null }, runtime: { sendMessage: async () => null } },
    PageCompare: {}, PageExtractor: {}, SeoCore: {}, Indexability: {}, SecurityAudit: {},
    DOMParser: function DOMParser() {}, el() { return {}; }, badge() { return {}; },
  });
  vm.runInContext(source('sidebar-page-compare.js'), context, { filename: 'sidebar-page-compare.js' });
  vm.runInContext(source('sidebar-page-compare-wrapper.js'), context, { filename: 'sidebar-page-compare-wrapper.js' });
  assert.doesNotThrow(() => vm.runInContext('renderCompare()', context));
  assert.equal(baseRenderCalls, 1);
  assert.equal(vm.runInContext('currentActiveTab.id', context), 42);
  context.state.tabId = 77;
  assert.equal(vm.runInContext('currentActiveTab.id', context), 77);
});

test('multi-tab sidebar renderer boots without starting a scan', () => {
  const { context, panel } = multiTabVm();
  assert.doesNotThrow(() => vm.runInContext('renderMultiTab()', context));
  assert.ok(panel.children.length >= 3);
  assert.equal(vm.runInContext('multiTabState.running', context), false);
});

test('multi-tab runtime scans open tabs and annotates duplicate metadata', async () => {
  const tabs = [
    { id: 11, url: 'https://example.com/a', title: 'A', windowId: 1 },
    { id: 12, url: 'https://example.com/b', title: 'B', windowId: 1 },
    { id: 13, url: 'about:config', title: 'Ignored', windowId: 1 },
  ];
  const { context } = multiTabVm({
    query: async () => tabs,
    sendMessage: async (tabId) => ({
      facts: {
        url: tabId === 11 ? 'https://example.com/a' : 'https://example.com/b', title: 'Shared title',
        description: tabId === 11 ? 'Description A' : 'Description B', headings: [{ level: 1, text: 'Shared H1' }],
        canonical: { href: tabId === 11 ? 'https://example.com/a' : 'https://example.com/b' }, robots: [],
      },
      responseMeta: { statusCode: 200 },
      evaluation: { score: 100, issues: [], severityCounts: { critical: 0, warning: 0 }, indexability: { verdict: 'Indexable' } },
    }),
  });
  await vm.runInContext('runMultiTabAudit()', context);
  assert.equal(vm.runInContext('multiTabState.running', context), false);
  assert.equal(vm.runInContext('multiTabState.total', context), 2);
  assert.equal(vm.runInContext('multiTabState.processed', context), 2);
  assert.equal(vm.runInContext('multiTabState.rows.length', context), 2);
  assert.equal(vm.runInContext('multiTabState.duplicates.titles.length', context), 1);
  assert.equal(vm.runInContext('multiTabState.duplicates.h1.length', context), 1);
});

test('crawler renderer boots without starting network work', () => {
  const { context, panel } = crawlerVm();
  assert.doesNotThrow(() => vm.runInContext('renderCrawler()', context));
  assert.ok(panel.children.length >= 3);
  assert.equal(vm.runInContext('crawlerState.running', context), false);
});

test('crawler runtime discovers the next depth and annotates duplicates', async () => {
  const { context } = crawlerVm();
  vm.runInContext("crawlerState.seedUrl='https://example.com/'; crawlerState.options=CrawlerLite.normalizeOptions({urlLimit:10,depthLimit:1,sameHostnameOnly:true});", context);
  await vm.runInContext('runCrawler()', context);
  assert.equal(vm.runInContext('crawlerState.running', context), false);
  assert.equal(vm.runInContext('crawlerState.processed', context), 2);
  assert.equal(vm.runInContext('crawlerState.rows.length', context), 2);
  assert.equal(vm.runInContext('crawlerState.rows.some((row) => row.depth === 1 && row.url === "https://example.com/b")', context), true);
  assert.equal(vm.runInContext('crawlerState.duplicates.titles.length', context), 1);
  assert.equal(vm.runInContext('crawlerState.duplicates.h1.length', context), 1);
});
