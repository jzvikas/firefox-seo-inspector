'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Regression = require('../src/lib/regression.js');

function baseReport() {
  return {
    facts: {
      url: 'https://example.com/page#section',
      title: 'Healthy title',
      description: 'Healthy description',
      canonical: { href: 'https://example.com/page', count: 1 },
      robots: [{ content: 'index,follow' }],
      headings: [{ level: 1, text: 'Main heading' }, { level: 2, text: 'Section' }],
      links: [{ kind: 'http', internal: true, href: 'https://example.com/a' }, { kind: 'http', internal: false, href: 'https://other.example/b' }],
      images: [{ altPresent: true, widthAttr: '100', heightAttr: '100', naturalWidth: 100, renderedWidth: 100 }],
      schemas: [{ valid: true, types: ['Product'] }],
      hreflang: [{ lang: 'en', href: 'https://example.com/page' }],
    },
    evaluation: {
      score: 100,
      issues: [],
      indexability: { verdict: 'Indexable', indexable: true, reasons: [{ code: 'indexable' }] },
    },
    responseMeta: {
      statusCode: 200,
      statusLine: 'OK',
      xRobotsTag: [],
      contentType: ['text/html'],
      contentLanguage: ['en'],
      cacheControl: ['public,max-age=60'],
    },
    performance: {
      dom: { nodeCount: 500, maxDepth: 12 },
      navigation: { ttfb: 200, total: 1500 },
      summary: {
        requestCount: 40,
        totalBytes: 500000,
        knownSizeCount: 35,
        thirdParty: { count: 10, bytes: 150000 },
      },
    },
    securityAudit: {
      transport: { https: true },
      mixed: { active: 0, passive: 0 },
      headers: [
        { key: 'csp', state: 'present', value: "default-src 'self'" },
        { key: 'hsts', state: 'present', value: 'max-age=31536000' },
      ],
      issues: [],
    },
  };
}

function snap(overrides) {
  return Object.assign(Regression.makeSnapshot(baseReport(), {
    linkResults: [{ status: 200, url: 'https://example.com/a' }],
    imageNetworkResults: [{ status: 200, url: 'https://example.com/i.jpg' }],
  }), overrides || {});
}

function byId(result, id) {
  return result.changes.find((item) => item.id === id);
}

test('snapshot v2 captures stable SEO, network, performance, and security summaries', () => {
  const snapshot = snap();
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.url, 'https://example.com/page');
  assert.equal(snapshot.indexability.verdict, 'Indexable');
  assert.deepEqual(snapshot.headings.counts, { h1: 1, h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 });
  assert.equal(snapshot.links.checked, 1);
  assert.equal(snapshot.images.missingAlt, 0);
  assert.deepEqual(snapshot.schema.types, ['Product']);
  assert.equal(snapshot.performance.ttfb, 200);
  assert.equal(snapshot.security.headers.csp.state, 'present');
});

test('network result summary separates broken redirects and unknown states', () => {
  assert.deepEqual(Regression.summarizeNetworkResults([
    { status: 200 },
    { status: 301, redirected: true },
    { status: 404 },
    { error: 'timeout' },
  ]), { checked: 4, broken: 1, redirect: 1, unknown: 1 });
});

test('losing title and indexability is classified as a regression', () => {
  const before = snap();
  const after = snap({ title: '', indexability: { verdict: 'Noindex', indexable: false, reasons: ['robots.meta.noindex'] } });
  const result = Regression.analyze(before, after);
  assert.equal(byId(result, 'metadata.title').direction, 'regression');
  assert.equal(byId(result, 'indexability.verdict').direction, 'regression');
  assert.equal(byId(result, 'indexability.verdict').severity, 'critical');
});

test('adding noindex robots directive is critical regression', () => {
  const before = snap({ robots: ['index,follow'] });
  const after = snap({ robots: ['noindex,follow'] });
  const item = byId(Regression.analyze(before, after), 'indexability.robots');
  assert.equal(item.direction, 'regression');
  assert.equal(item.severity, 'critical');
});

test('broken link regression is compared only when both snapshots have checked links', () => {
  const before = snap();
  const after = snap();
  before.links = Object.assign({}, before.links, { checked: 10, broken: 1 });
  after.links = Object.assign({}, after.links, { checked: 10, broken: 3 });
  assert.equal(byId(Regression.analyze(before, after), 'links.broken').direction, 'regression');
  before.links.checked = 0;
  assert.equal(byId(Regression.analyze(before, after), 'links.broken'), undefined);
});

test('image issue increases and invalid schema increases are regressions', () => {
  const before = snap();
  const after = snap();
  after.images = Object.assign({}, after.images, { missingAlt: 2 });
  after.schema = Object.assign({}, after.schema, { invalid: 1 });
  const result = Regression.analyze(before, after);
  assert.equal(byId(result, 'images.missingAlt').direction, 'regression');
  assert.equal(byId(result, 'schema.invalid').severity, 'critical');
});

test('healthy HTTP status changing to error is critical regression', () => {
  const before = snap();
  const after = snap();
  after.http = Object.assign({}, after.http, { statusCode: 500 });
  const item = byId(Regression.analyze(before, after), 'http.status');
  assert.equal(item.direction, 'regression');
  assert.equal(item.severity, 'critical');
});

test('performance changes must exceed both absolute and relative noise thresholds', () => {
  const before = snap();
  const small = snap();
  small.performance = Object.assign({}, small.performance, { ttfb: 230, requestCount: 44 });
  assert.equal(byId(Regression.analyze(before, small), 'performance.ttfb'), undefined);
  assert.equal(byId(Regression.analyze(before, small), 'performance.requestCount'), undefined);

  const slow = snap();
  slow.performance = Object.assign({}, slow.performance, { ttfb: 350, requestCount: 55 });
  assert.equal(byId(Regression.analyze(before, slow), 'performance.ttfb').direction, 'regression');
  assert.equal(byId(Regression.analyze(before, slow), 'performance.requestCount').direction, 'regression');
});

test('security header loss and new mixed content are regressions', () => {
  const before = snap();
  const after = snap();
  after.security = JSON.parse(JSON.stringify(after.security));
  after.security.headers.csp = { state: 'missing', value: '' };
  after.security.mixedActive = 2;
  const result = Regression.analyze(before, after);
  assert.equal(byId(result, 'security.header.csp').direction, 'regression');
  assert.equal(byId(result, 'security.mixed-active').severity, 'critical');
});

test('security and broken-link fixes are reported as improvements', () => {
  const before = snap();
  const after = snap();
  before.links = Object.assign({}, before.links, { checked: 10, broken: 3 });
  after.links = Object.assign({}, after.links, { checked: 10, broken: 0 });
  before.security = JSON.parse(JSON.stringify(before.security));
  before.security.headers.csp = { state: 'missing', value: '' };
  const result = Regression.analyze(before, after);
  assert.equal(byId(result, 'links.broken').direction, 'improvement');
  assert.equal(byId(result, 'security.header.csp').direction, 'improvement');
});

test('legacy v1 snapshots remain comparable without fabricated v2 regressions', () => {
  const before = {
    version: 1,
    title: 'Old',
    description: 'Description',
    canonical: 'https://example.com/page',
    robots: [],
    h1: ['H1'],
    headingCount: 1,
    linkCount: 2,
    imageCount: 1,
    schemaTypes: ['Product'],
    hreflangCount: 1,
    score: 100,
  };
  const after = snap({ title: 'New' });
  const result = Regression.analyze(before, after);
  assert.ok(byId(result, 'metadata.title'));
  assert.equal(result.changes.some((item) => item.category === 'Performance'), false);
  assert.equal(result.changes.some((item) => item.category === 'Security'), false);
});

test('regression result exposes direction summary counts', () => {
  const before = snap();
  const after = snap({ title: '' });
  after.images = Object.assign({}, after.images, { missingAlt: 1 });
  const result = Regression.analyze(before, after);
  assert.equal(result.summary.regressions >= 2, true);
  assert.equal(result.summary.regressions, result.regressions.length);
  assert.equal(result.summary.improvements, result.improvements.length);
});
