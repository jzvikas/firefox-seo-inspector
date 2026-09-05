'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'crawler-background.js'), 'utf8');

function headers(values) {
  const map = new Map(Object.entries(values || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get(name) { return map.get(String(name).toLowerCase()) || null; } };
}

function contextWithFetch(fetchImpl) {
  let listener = null;
  const context = vm.createContext({
    URL,
    AbortController,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
    browser: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
  });
  vm.runInContext(source, context, { filename: 'crawler-background.js' });
  return { context, message(message) { return listener(message); } };
}

test('crawler fetch is credential-free no-referrer bounded GET', async () => {
  let options = null;
  const { message } = contextWithFetch(async (_url, init) => {
    options = init;
    return {
      url: 'https://example.com/final', status: 200, statusText: 'OK', redirected: true,
      headers: headers({ 'content-type': 'text/html', 'content-length': '13', 'x-robots-tag': 'index' }),
      body: null,
      async arrayBuffer() { return new TextEncoder().encode('<h1>ok</h1>').buffer; },
    };
  });
  const result = await message({ type: 'seoInspector.crawler.fetch', scanId: 'scan-a', url: 'https://example.com/start' });
  assert.equal(options.method, 'GET');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.equal(options.redirect, 'follow');
  assert.ok(options.signal);
  assert.equal(result.status, 200);
  assert.equal(result.redirected, true);
  assert.equal(result.responseMeta.xRobotsTag[0], 'index');
  assert.match(result.text, /<h1>ok<\/h1>/);
});

test('crawler cancel aborts in-flight requests for the matching scan', async () => {
  let capturedSignal = null;
  const { message } = contextWithFetch((_url, init) => {
    capturedSignal = init.signal;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  });
  const pending = message({ type: 'seoInspector.crawler.fetch', scanId: 'scan-b', url: 'https://example.com/' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancel = await message({ type: 'seoInspector.crawler.cancel', scanId: 'scan-b' });
  const result = await pending;
  assert.equal(cancel.cancelled, 1);
  assert.equal(capturedSignal.aborted, true);
  assert.equal(result.error, 'cancelled');
});

test('crawler cancellation is scoped by scan id', async () => {
  const signals = new Map();
  const { message } = contextWithFetch((url, init) => {
    signals.set(url, init.signal);
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
      }, { once: true });
    });
  });
  const first = message({ type: 'seoInspector.crawler.fetch', scanId: 'first', url: 'https://example.com/1' });
  const second = message({ type: 'seoInspector.crawler.fetch', scanId: 'second', url: 'https://example.com/2' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await message({ type: 'seoInspector.crawler.cancel', scanId: 'first' });
  const firstResult = await first;
  assert.equal(firstResult.error, 'cancelled');
  assert.equal(signals.get('https://example.com/1').aborted, true);
  assert.equal(signals.get('https://example.com/2').aborted, false);
  await message({ type: 'seoInspector.crawler.cancel', scanId: 'second' });
  await second;
});
