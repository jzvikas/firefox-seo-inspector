'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('every refresh releases page-scoped on-demand state before collecting a new report', () => {
  const recovery = read('src/sidebar/sidebar-runtime-recovery.js');
  const release = recovery.indexOf("typeof releasePageScopedState === 'function'");
  const raw = recovery.indexOf('state.rawReport = null');
  const links = recovery.indexOf('state.linkResults = new Map()');
  assert.ok(release >= 0);
  assert.ok(raw > release);
  assert.ok(links > release);
});

test('page-scoped lifecycle cancels active network operations and drops retained result objects', () => {
  const main = read('src/sidebar/sidebar-main.js');
  assert.match(main, /function releasePageScopedState\(\)/);

  for (const message of [
    'seoInspector.cancelLinks',
    'seoInspector.cancelImages',
    'seoInspector.cancelHreflang',
    'seoInspector.cancelCanonicalChain',
    'seoInspector.cancelSitemapMembership',
    'seoInspector.cancelRaw',
    'seoInspector.cancelComparePages',
  ]) {
    assert.match(main, new RegExp(message.replace('.', '\\.')));
  }

  assert.match(main, /linkCheckState\.report = null/);
  assert.match(main, /resetImageNetworkState\(''\)/);
  assert.match(main, /resetHreflangState\(''\)/);
  assert.match(main, /categoryPaginationNetworkState\.results = new Map\(\)/);
  assert.match(main, /canonicalChainState\.report = null/);
  assert.match(main, /sitemapMembershipState\.report = null/);
  assert.match(main, /rawSourceUiState\.operationId = ''/);
  assert.match(main, /pageCompareState\.result = null/);
});

test('closing the inspected tab and unloading the Inspector both run page cleanup', () => {
  const main = read('src/sidebar/sidebar-main.js');
  assert.match(main, /browser\.tabs\.onRemoved\.addListener/);
  assert.match(main, /if \(tabId !== state\.tabId\) return;\s*releasePageScopedState\(\);/);
  assert.match(main, /window\.addEventListener\('unload',[\s\S]*?releasePageScopedState\(\);/);
});

test('background operation registries still delete controllers after completion', () => {
  const expectations = [
    ['src/background/link-background.js', /linkNetworkOperations\.delete\(operationId\)/],
    ['src/background/image-background.js', /imageOperations\.delete\(operationId\)/],
    ['src/background/compare-background.js', /compareOperations\.delete\(operationId\)/],
    ['src/background/hreflang-background.js', /hreflangOperations\.delete\(operationId\)/],
    ['src/background/canonical-background.js', /canonicalOperations\.delete\(operationId\)/],
    ['src/background/crawler-background.js', /crawlerUnregister\(scanId, controller\)/],
  ];
  expectations.forEach(([file, pattern]) => assert.match(read(file), pattern, file));
});

test('session-wide link cache remains bounded rather than becoming page-retained state', () => {
  const links = read('src/background/link-background.js');
  assert.match(links, /CACHE_MAX\s*:\s*1000/);
  assert.match(links, /linkCache\.delete/);
});
