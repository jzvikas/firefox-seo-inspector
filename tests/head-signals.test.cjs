'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const HeadSignals = require('../src/lib/head-signals.js');

test('decodes common named and numeric HTML entities', () => {
  assert.equal(HeadSignals.decodeHtml('a&amp;b &#x17D; &#382;'), 'a&b Ž ž');
});

test('parses quoted, single-quoted, and unquoted attributes', () => {
  assert.deepEqual(
    HeadSignals.parseAttributes('<link rel="alternate" hreflang=lt href=\'/lt/\' disabled>'),
    { rel: 'alternate', hreflang: 'lt', href: '/lt/', disabled: '' },
  );
});

test('extracts canonical, hreflang, and robots signals from head', () => {
  const result = HeadSignals.parse(`<!doctype html><html><head>
    <link rel="canonical" href="/product">
    <link rel="alternate stylesheet" hreflang="lt-LT" href="/lt/product">
    <link rel="alternate" hreflang="x-default" href="/product">
    <meta name="robots" content="index, follow">
    <meta NAME="GOOGLEBOT" CONTENT="noindex">
  </head><body></body></html>`, 'https://example.com/en/product');
  assert.deepEqual(result.canonical, ['https://example.com/product']);
  assert.deepEqual(result.hreflang, [
    { lang: 'lt-LT', href: 'https://example.com/lt/product' },
    { lang: 'x-default', href: 'https://example.com/product' },
  ]);
  assert.deepEqual(result.robots, [
    { name: 'robots', content: 'index, follow' },
    { name: 'googlebot', content: 'noindex' },
  ]);
});

test('ignores link and meta elements after the closing head', () => {
  const result = HeadSignals.parse('<html><head><link rel="canonical" href="/a"></head><body><link rel="canonical" href="/b"><meta name="robots" content="noindex"></body></html>', 'https://example.com/');
  assert.deepEqual(result.canonical, ['https://example.com/a']);
  assert.deepEqual(result.robots, []);
});

test('decodes entities in hreflang URLs', () => {
  const result = HeadSignals.parse('<head><link rel="alternate" hreflang="en" href="/page?a=1&amp;b=2"></head>', 'https://example.com/');
  assert.equal(result.hreflang[0].href, 'https://example.com/page?a=1&b=2');
});

test('returns empty arrays when no relevant head signals exist', () => {
  assert.deepEqual(HeadSignals.parse('<html><head><title>Page</title></head></html>', 'https://example.com/'), {
    canonical: [],
    hreflang: [],
    robots: [],
  });
});
