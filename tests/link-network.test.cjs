'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const LinkNetwork = require('../src/lib/link-network.js');

test('normalizes HTTP URLs and rejects unsupported schemes', () => {
  assert.equal(LinkNetwork.normalizeUrl('https://example.com:443/a#x'), 'https://example.com/a');
  assert.equal(LinkNetwork.normalizeUrl('http://example.com:80/a'), 'http://example.com/a');
  assert.equal(LinkNetwork.normalizeUrl('mailto:test@example.com'), '');
  assert.equal(LinkNetwork.normalizeUrl('javascript:void(0)'), '');
});

test('URL selection deduplicates and enforces a configurable cap', () => {
  const result = LinkNetwork.selectUrls([
    'https://example.com/a#x',
    'https://example.com/a',
    'https://example.com/b',
    'https://example.com/c',
    'mailto:test@example.com',
  ], 2);
  assert.deepEqual(result.urls, ['https://example.com/a', 'https://example.com/b']);
  assert.equal(result.capped, true);
});

test('status classification distinguishes OK redirect broken and unknown', () => {
  assert.equal(LinkNetwork.statusKind({ status: 200, redirected: false, error: null }), 'ok');
  assert.equal(LinkNetwork.statusKind({ status: 200, redirected: true, error: null }), 'redirect');
  assert.equal(LinkNetwork.statusKind({ status: 302, redirected: false, error: null }), 'redirect');
  assert.equal(LinkNetwork.statusKind({ status: 404, redirected: false, error: null }), 'broken');
  assert.equal(LinkNetwork.statusKind({ status: 0, redirected: false, error: 'timeout' }), 'unknown');
});

test('result map uses normalized requested URLs', () => {
  const map = LinkNetwork.resultMap([
    { url: 'https://example.com:443/a#x', status: 200 },
  ]);
  assert.equal(map.get('https://example.com/a').status, 200);
});

test('summary explicitly counts internal links that point to redirects', () => {
  const links = [
    { kind: 'http', href: 'https://example.com/a', internal: true },
    { kind: 'http', href: 'https://example.com/b', internal: false },
    { kind: 'http', href: 'https://example.com/c', internal: true },
    { kind: 'mailto', href: 'mailto:test@example.com', internal: false },
  ];
  const results = [
    { url: 'https://example.com/a', status: 200, redirected: true, error: null },
    { url: 'https://example.com/b', status: 200, redirected: true, error: null },
    { url: 'https://example.com/c', status: 404, redirected: false, error: null },
  ];
  assert.deepEqual(LinkNetwork.summarize(links, results), {
    checked: 3,
    ok: 0,
    redirect: 2,
    internalRedirect: 1,
    broken: 1,
    unknown: 0,
  });
});

test('summary counts network failures as unknown without inventing redirects', () => {
  const links = [{ kind: 'http', href: 'https://example.com/a', internal: true }];
  const results = [{ url: 'https://example.com/a', status: 0, redirected: false, error: 'cancelled' }];
  const summary = LinkNetwork.summarize(links, results);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.redirect, 0);
  assert.equal(summary.internalRedirect, 0);
});
