'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function compareContext(fetchImpl) {
  let listener = null;
  const context = vm.createContext({
    URL,
    AbortController,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
    browser: {
      runtime: {
        onMessage: { addListener(fn) { listener = fn; } },
      },
    },
  });
  vm.runInContext(source('src/background/compare-background.js'), context, { filename: 'compare-background.js' });
  return { message(value) { return listener(value); } };
}

test('URL A/B comparison cancellation aborts both in-flight requests', async () => {
  const signals = [];
  const { message } = compareContext((_url, init) => {
    signals.push(init.signal);
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  });

  const pending = message({
    type: 'seoInspector.fetchComparePages',
    operationId: 'compare-test',
    urlA: 'https://example.com/a',
    urlB: 'https://example.com/b',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancel = await message({ type: 'seoInspector.cancelComparePages', operationId: 'compare-test' });
  const result = await pending;

  assert.equal(cancel.cancelled, true);
  assert.equal(signals.length, 2);
  assert.equal(signals.every((signal) => signal.aborted), true);
  assert.equal(result.cancelled, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.left.error, 'cancelled');
  assert.equal(result.right.error, 'cancelled');
  assert.equal(result.limits.maxBytesPerUrl, 2 * 1024 * 1024);
  assert.equal(result.limits.requestTimeoutMs, 12000);
  assert.equal(result.limits.scanTimeoutMs, 15000);
});

test('authenticated raw HTML fetch is byte-bounded, timed, cancellable, and tab-pinned', () => {
  const content = source('src/content/content.js');
  assert.match(content, /RAW_SOURCE_MAX_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
  assert.match(content, /RAW_SOURCE_TIMEOUT_MS\s*=\s*12000/);
  assert.match(content, /rawSourceOperations\s*=\s*new Map\(\)/);
  assert.match(content, /credentials:\s*'include'/);
  assert.match(content, /signal:\s*controller\.signal/);
  assert.match(content, /response\.body\.getReader/);
  assert.match(content, /sizeBytes\s*>\s*RAW_SOURCE_MAX_BYTES/);
  assert.match(content, /seoInspector\.cancelRaw/);

  const sidebar = source('src/sidebar/sidebar-content.js');
  assert.match(sidebar, /Cancel raw HTML/);
  assert.match(sidebar, /seoInspector\.cancelRaw/);
  assert.match(sidebar, /browser\.tabs\.sendMessage\(sourceTabId/);
  assert.match(sidebar, /rawSourceStillCurrent\(operationId, sourceTabId, sourceUrl\)/);
  assert.match(sidebar, /state\.tabId === tabId/);
  assert.match(sidebar, /2 MiB/);
  assert.match(sidebar, /12-second timeout/);

  const snapshots = source('src/sidebar/sidebar-snapshots.js');
  assert.match(snapshots, /runRawSourceFetch/);
  assert.match(snapshots, /cancelRawSourceFetch/);
});

test('legacy link and sitemap routes distinguish scan timeout from user cancellation', () => {
  const background = source('src/background/background.js');
  assert.match(background, /LINK_CHECK_SCAN_TIMEOUT_MS\s*=\s*30000/);
  assert.match(background, /checkOneLink\(url, externalSignal\)/);
  assert.match(background, /while \(cursor < unique\.length && !operationController\.signal\.aborted\)/);
  assert.match(background, /cancelled:\s*operationController\.signal\.aborted && !scanTimedOut/);
  assert.match(background, /timedOut:\s*scanTimedOut/);
  assert.doesNotMatch(background, /cancelled-or-timeout/);
});

test('URL comparison UI uses one cancellable bounded background operation', () => {
  const sidebar = source('src/sidebar/sidebar-page-compare.js');
  assert.match(sidebar, /seoInspector\.fetchComparePages/);
  assert.match(sidebar, /seoInspector\.cancelComparePages/);
  assert.match(sidebar, /Cancel URL comparison/);
  assert.match(sidebar, /15-second scan timeout/);
});
