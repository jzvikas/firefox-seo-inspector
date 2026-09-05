'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function fakeDocument() {
  return {
    head: {
      prepend() {},
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return { setAttribute() {} };
    },
  };
}

test('URL comparison resolves custom rules and expectations for each target hostname', async () => {
  const stored = {
    'customRules:v1': {
      thresholds: { titleMax: 60 },
    },
    'domainProfiles:v1': {
      version: 1,
      profiles: {
        'example.com': {
          hostname: 'example.com',
          rules: { thresholds: { titleMax: 77 } },
          expected: { schemaTypes: ['Product'] },
        },
      },
    },
  };

  const context = vm.createContext({
    URL,
    console,
    state: { tabId: 1, report: null },
    pageCompareState: { loading: false, sourceTabId: null, sourceUrl: '', mode: '' },
    renderCompare() {},
    pageCompareCurrentUrl() { return ''; },
    pageCompareIsHttpUrl() { return true; },
    fetchComparableUrl: async () => null,
    fetchedCompareError() { return ''; },
    PageCompare: { compareReports() { return {}; } },
    appendPageComparison() {},
    DOMParser: function DOMParser() {
      this.parseFromString = () => fakeDocument();
    },
    PageExtractor: {
      extract(_doc, url) {
        return { url: url.href, schemas: [], hreflang: [], openGraph: {}, textWordCount: 0 };
      },
    },
    SeoCore: {
      evaluateFacts() {
        return { issues: [], score: 100, severityCounts: { critical: 0, warning: 0, info: 0 } };
      },
    },
    Indexability: { analyze() { return { verdict: 'Indexable' }; } },
    SecurityAudit: { collect() { return {}; } },
    browser: {
      storage: {
        local: {
          async get() { return stored; },
        },
      },
    },
    document: { getElementById() { return null; } },
  });

  vm.runInContext(source('src/lib/custom-rules.js'), context, { filename: 'custom-rules.js' });
  vm.runInContext(source('src/lib/domain-profiles.js'), context, { filename: 'domain-profiles.js' });
  vm.runInContext(source('src/lib/page-type.js'), context, { filename: 'page-type.js' });
  vm.runInContext(source('src/lib/page-type-dom.js'), context, { filename: 'page-type-dom.js' });
  vm.runInContext(source('src/sidebar/sidebar-page-compare-wrapper.js'), context, { filename: 'sidebar-page-compare-wrapper.js' });

  const profiled = await vm.runInContext(`reportFromFetchedCompare({
    text: '<html></html>',
    url: 'https://example.com/item',
    status: 200,
    responseMeta: { url: 'https://example.com/item', statusCode: 200 }
  })`, context);
  const globalOnly = await vm.runInContext(`reportFromFetchedCompare({
    text: '<html></html>',
    url: 'https://other.example/item',
    status: 200,
    responseMeta: { url: 'https://other.example/item', statusCode: 200 }
  })`, context);

  assert.equal(profiled.customRules.thresholds.titleMax, 77);
  assert.equal(profiled.domainProfile.hostname, 'example.com');
  assert.equal(profiled.pageType.primary, 'generic');
  assert.ok(profiled.evaluation.issues.some((item) => item.id === 'profile.schema.expected'));
  assert.equal(globalOnly.customRules.thresholds.titleMax, 60);
  assert.equal(globalOnly.domainProfile, null);
  assert.equal(globalOnly.pageType.primary, 'generic');
  assert.equal(globalOnly.evaluation.issues.some((item) => item.id === 'profile.schema.expected'), false);
});
