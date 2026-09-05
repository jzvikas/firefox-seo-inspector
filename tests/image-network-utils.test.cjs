'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ImageNetworkUtils = require('../src/lib/image-network-utils.js');

function headers(values) {
  const map = new Map(Object.entries(values || {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get(name) { return map.get(String(name).toLowerCase()) || null; } };
}

test('normalizes HTTP URLs and rejects unsupported schemes', () => {
  assert.equal(ImageNetworkUtils.httpUrl('https://example.com/a.jpg#x'), 'https://example.com/a.jpg');
  assert.equal(ImageNetworkUtils.httpUrl('data:image/png;base64,abc'), null);
  assert.equal(ImageNetworkUtils.httpUrl('javascript:alert(1)'), null);
});

test('parses positive Content-Length only', () => {
  assert.equal(ImageNetworkUtils.contentLength(headers({ 'content-length': '12345' })), 12345);
  assert.equal(ImageNetworkUtils.contentLength(headers({ 'content-length': '0' })), 0);
  assert.equal(ImageNetworkUtils.contentLength(headers({ 'content-length': 'bad' })), 0);
});

test('extracts full size from Content-Range', () => {
  assert.equal(ImageNetworkUtils.totalFromContentRange('bytes 0-0/987654'), 987654);
  assert.equal(ImageNetworkUtils.totalFromContentRange('bytes */1234'), 1234);
  assert.equal(ImageNetworkUtils.totalFromContentRange(''), 0);
});

test('206 Range response uses Content-Range total instead of one-byte Content-Length', () => {
  const result = ImageNetworkUtils.sizeFromRangeResponse(206, headers({
    'content-range': 'bytes 0-0/800000',
    'content-length': '1',
  }));
  assert.deepEqual(result, { sizeBytes: 800000, sizeSource: 'content-range' });
});

test('200 Range fallback can use full Content-Length when server ignores Range', () => {
  const result = ImageNetworkUtils.sizeFromRangeResponse(200, headers({ 'content-length': '450000' }));
  assert.deepEqual(result, { sizeBytes: 450000, sizeSource: 'content-length' });
});

test('206 without Content-Range does not mistake partial Content-Length for full file size', () => {
  const result = ImageNetworkUtils.sizeFromRangeResponse(206, headers({ 'content-length': '1' }));
  assert.deepEqual(result, { sizeBytes: 0, sizeSource: '' });
});

test('Range fallback is requested for failed, unsupported, or size-less successful HEAD', () => {
  assert.equal(ImageNetworkUtils.shouldRangeFallback({ error: 'network', status: 0, sizeBytes: 0 }), true);
  assert.equal(ImageNetworkUtils.shouldRangeFallback({ error: null, status: 405, sizeBytes: 0 }), true);
  assert.equal(ImageNetworkUtils.shouldRangeFallback({ error: null, status: 200, sizeBytes: 0 }), true);
  assert.equal(ImageNetworkUtils.shouldRangeFallback({ error: null, status: 200, sizeBytes: 1000 }), false);
  assert.equal(ImageNetworkUtils.shouldRangeFallback({ error: null, status: 404, sizeBytes: 100 }), false);
});

test('unique URL selection deduplicates, rejects non-HTTP values, and enforces cap', () => {
  const result = ImageNetworkUtils.uniqueUrls([
    'https://example.com/a.jpg#one',
    { src: 'https://example.com/a.jpg#two' },
    { src: 'https://example.com/b.png' },
    'data:image/png;base64,abc',
    'https://example.com/c.webp',
  ], 2);
  assert.deepEqual(result.urls, ['https://example.com/a.jpg', 'https://example.com/b.png']);
  assert.equal(result.capped, true);
});
