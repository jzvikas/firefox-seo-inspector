'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PerformanceAudit = require('../src/lib/performance-audit.js');

const PAGE = 'https://example.com/products/1';

function resource(name, initiatorType, duration, transferSize, encodedBodySize) {
  return {
    name,
    initiatorType,
    startTime: 10,
    duration,
    transferSize,
    encodedBodySize,
    decodedBodySize: encodedBodySize ? encodedBodySize * 2 : 0,
  };
}

function navigation(overrides) {
  return Object.assign({
    name: PAGE,
    initiatorType: 'navigation',
    type: 'navigate',
    nextHopProtocol: 'h2',
    redirectCount: 1,
    requestStart: 100,
    responseStart: 250,
    responseEnd: 300,
    domainLookupStart: 20,
    domainLookupEnd: 30,
    connectStart: 30,
    secureConnectionStart: 35,
    connectEnd: 60,
    domContentLoadedEventEnd: 700,
    loadEventEnd: 900,
    duration: 920,
    transferSize: 12000,
    encodedBodySize: 10000,
    decodedBodySize: 20000,
  }, overrides || {});
}

test('classifies common resource types from initiator and extension', () => {
  assert.equal(PerformanceAudit.resourceKind(resource('https://example.com/app.js', 'script')), 'javascript');
  assert.equal(PerformanceAudit.resourceKind(resource('https://example.com/site.css', 'link')), 'css');
  assert.equal(PerformanceAudit.resourceKind(resource('https://example.com/p.webp', 'img')), 'image');
  assert.equal(PerformanceAudit.resourceKind(resource('https://cdn.example.com/font.woff2', 'link')), 'font');
  assert.equal(PerformanceAudit.resourceKind(resource('https://example.com/api', 'fetch')), 'fetch');
});

test('resource bytes prefer transfer size and fall back to encoded size', () => {
  assert.deepEqual(PerformanceAudit.resourceBytes({ transferSize: 500, encodedBodySize: 400, decodedBodySize: 900 }), {
    transfer: 500,
    encoded: 400,
    decoded: 900,
    best: 500,
    source: 'transferSize',
  });
  assert.equal(PerformanceAudit.resourceBytes({ transferSize: 0, encodedBodySize: 400 }).best, 400);
  assert.equal(PerformanceAudit.resourceBytes({ transferSize: 0, encodedBodySize: 0 }).best, 0);
});

test('third-party detection compares origins rather than host strings', () => {
  assert.equal(PerformanceAudit.isThirdParty('https://example.com/app.js', PAGE), false);
  assert.equal(PerformanceAudit.isThirdParty('https://cdn.example.com/app.js', PAGE), true);
  assert.equal(PerformanceAudit.isThirdParty('not-a-url', PAGE), false);
});

test('resource serialization keeps timing, type, size, and third-party state', () => {
  const item = PerformanceAudit.serializeResource(
    resource('https://cdn.example.com/app.js#x', 'script', 42.34, 8000, 7000),
    PAGE,
  );
  assert.equal(item.url, 'https://cdn.example.com/app.js');
  assert.equal(item.kind, 'javascript');
  assert.equal(item.thirdParty, true);
  assert.equal(item.duration, 42.3);
  assert.equal(item.sizeBytes, 8000);
  assert.equal(item.sizeSource, 'transferSize');
});

test('resource summary counts requests, known bytes, types, and third parties', () => {
  const summary = PerformanceAudit.summarizeResources([
    { kind: 'document', sizeBytes: 1000, thirdParty: false },
    { kind: 'javascript', sizeBytes: 2000, thirdParty: false },
    { kind: 'image', sizeBytes: 3000, thirdParty: true },
    { kind: 'font', sizeBytes: 0, thirdParty: true },
  ]);
  assert.equal(summary.requestCount, 4);
  assert.equal(summary.totalBytes, 6000);
  assert.equal(summary.knownSizeCount, 3);
  assert.equal(summary.unknownSizeCount, 1);
  assert.equal(summary.kinds.image.bytes, 3000);
  assert.equal(summary.thirdParty.count, 2);
  assert.equal(summary.thirdParty.bytes, 3000);
});

test('navigation timing calculates TTFB and major document phases', () => {
  const timing = PerformanceAudit.navigationTiming(navigation());
  assert.equal(timing.ttfb, 150);
  assert.equal(timing.responseDownload, 50);
  assert.equal(timing.dns, 10);
  assert.equal(timing.connect, 30);
  assert.equal(timing.tls, 25);
  assert.equal(timing.domContentLoaded, 700);
  assert.equal(timing.load, 900);
  assert.equal(timing.total, 920);
  assert.equal(timing.protocol, 'h2');
});

test('navigation resource represents the HTML request without double counting', () => {
  const nav = navigation();
  const timing = PerformanceAudit.navigationTiming(nav);
  const item = PerformanceAudit.navigationResource(nav, PAGE, timing);
  assert.equal(item.kind, 'document');
  assert.equal(item.url, PAGE);
  assert.equal(item.sizeBytes, 12000);
  assert.equal(item.duration, 920);
  assert.equal(item.thirdParty, false);
});

test('DOM stats count elements and deepest element level iteratively', () => {
  const leaf = { children: [] };
  const nested = { children: [leaf] };
  const sibling = { children: [] };
  const root = { children: [nested, sibling] };
  assert.deepEqual(PerformanceAudit.domStats({ documentElement: root }), {
    nodeCount: 4,
    maxDepth: 3,
  });
  assert.deepEqual(PerformanceAudit.domStats(null), { nodeCount: 0, maxDepth: 0 });
});

test('collect includes HTML and subresources in request and byte totals', () => {
  const entries = [
    resource('https://example.com/app.js', 'script', 120, 20000, 19000),
    resource('https://cdn.example.com/hero.webp', 'img', 300, 50000, 48000),
  ];
  const perf = {
    getEntriesByType(type) {
      if (type === 'resource') return entries;
      if (type === 'navigation') return [navigation()];
      return [];
    },
  };
  const result = PerformanceAudit.collect({ documentElement: { children: [] } }, perf, PAGE);
  assert.equal(result.summary.requestCount, 3);
  assert.equal(result.summary.totalBytes, 82000);
  assert.equal(result.summary.kinds.document.count, 1);
  assert.equal(result.summary.kinds.javascript.count, 1);
  assert.equal(result.summary.kinds.image.count, 1);
  assert.equal(result.resources[0].kind, 'document');
});

test('collect ranks largest and slowest independently', () => {
  const entries = [
    resource('https://example.com/large.js', 'script', 50, 100000, 90000),
    resource('https://example.com/slow.css', 'link', 900, 1000, 900),
  ];
  const perf = {
    getEntriesByType(type) {
      if (type === 'resource') return entries;
      if (type === 'navigation') return [navigation({ duration: 100, loadEventEnd: 100 })];
      return [];
    },
  };
  const result = PerformanceAudit.collect({ documentElement: { children: [] } }, perf, PAGE);
  assert.equal(result.largest[0].url, 'https://example.com/large.js');
  assert.equal(result.slowest[0].url, 'https://example.com/slow.css');
});

test('collect preserves unknown sizes instead of estimating transferred bytes', () => {
  const perf = {
    getEntriesByType(type) {
      if (type === 'resource') return [resource('https://third.test/a.js', 'script', 10, 0, 0)];
      if (type === 'navigation') return [];
      return [];
    },
  };
  const result = PerformanceAudit.collect({ documentElement: { children: [] } }, perf, PAGE);
  assert.equal(result.summary.totalBytes, 0);
  assert.equal(result.summary.knownSizeCount, 0);
  assert.equal(result.summary.unknownSizeCount, 1);
});

test('collect caps subresource timing entries at the configured safety limit', () => {
  const entries = Array.from({ length: PerformanceAudit.RESOURCE_LIMIT + 1 }, (_, index) => (
    resource(`https://example.com/r${index}.js`, 'script', 1, 1, 1)
  ));
  const perf = {
    getEntriesByType(type) {
      return type === 'resource' ? entries : [];
    },
  };
  const result = PerformanceAudit.collect({ documentElement: { children: [] } }, perf, PAGE);
  assert.equal(result.capped, true);
  assert.equal(result.resources.length, PerformanceAudit.RESOURCE_LIMIT);
  assert.equal(result.summary.requestCount, PerformanceAudit.RESOURCE_LIMIT);
});
