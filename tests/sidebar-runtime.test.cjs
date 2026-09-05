'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'sidebar', name), 'utf8');
}

test('page comparison wrapper boots using the sidebar active tab state', () => {
  let baseRenderCalls = 0;
  const context = vm.createContext({
    URL,
    console,
    state: {
      tabId: 42,
      report: null,
    },
    renderCompare() {
      baseRenderCalls += 1;
    },
    document: {
      getElementById() {
        return null;
      },
    },
    browser: {
      tabs: {
        query: async () => [],
        sendMessage: async () => null,
      },
      runtime: {
        sendMessage: async () => null,
      },
    },
    PageCompare: {},
    PageExtractor: {},
    SeoCore: {},
    Indexability: {},
    SecurityAudit: {},
    DOMParser: function DOMParser() {},
    el() {
      return {};
    },
    badge() {
      return {};
    },
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
  function node() {
    return {
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
      setAttribute() {},
      click() {},
      className: '',
      textContent: '',
      style: {},
    };
  }
  const panel = node();
  const context = vm.createContext({
    URL,
    Blob: function Blob() {},
    console,
    setTimeout,
    clearTimeout,
    document: {
      getElementById(id) { return id === 'multitab' ? panel : null; },
      createElement() { return node(); },
      createTextNode(text) { return { textContent: String(text) }; },
    },
    browser: {
      tabs: {
        query: async () => [],
        sendMessage: async () => null,
      },
    },
    MultiTabAudit: {
      MAX_TABS: 100,
      CONCURRENCY: 6,
      filterRows(rows) { return rows || []; },
      sortRows(rows) { return rows || []; },
      duplicateSummary(rows) { return { rows: rows || [], titles: [], descriptions: [], h1: [] }; },
      toCsv() { return ''; },
      toJson() { return '{}'; },
    },
    clear(target) { target.children.length = 0; },
    el(_tag, _className, text) {
      const output = node();
      output.textContent = text || '';
      return output;
    },
    badge(text) {
      const output = node();
      output.textContent = text;
      return output;
    },
  });
  context.URL.createObjectURL = () => 'blob:test';
  context.URL.revokeObjectURL = () => {};

  vm.runInContext(source('sidebar-multi-tab.js'), context, { filename: 'sidebar-multi-tab.js' });
  assert.doesNotThrow(() => vm.runInContext('renderMultiTab()', context));
  assert.ok(panel.children.length >= 3);
  assert.equal(vm.runInContext('multiTabState.running', context), false);
});
