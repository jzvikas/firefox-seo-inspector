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
