'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PageCompare = require('../src/lib/page-compare.js');

function report(overrides) {
  const base = {
    facts: {
      url: 'https://example.com/a',
      title: 'Title A',
      description: 'Description',
      canonical: { href: 'https://example.com/a', count: 1 },
      robots: [{ content: 'index,follow' }],
      headings: [{ level: 1, text: 'Main' }, { level: 2, text: 'Section' }],
      links: [
        { kind: 'http', internal: true, href: 'https://example.com/p', nofollow: false, sponsored: false, ugc: false },
        { kind: 'http', internal: false, href: 'https://outside.example/q', nofollow: true, sponsored: false, ugc: false },
      ],
      images: [
        { src: 'https://example.com/a.jpg', altPresent: true, widthAttr: '100', heightAttr: '100' },
        { src: 'https://example.com/b.jpg', altPresent: false, widthAttr: '', heightAttr: '' },
      ],
      schemas: [{ valid: true, types: ['Product'] }],
      hreflang: [{ lang: 'en', href: 'https://example.com/a' }],
    },
    evaluation: {
      score: 95,
      issues: [{ id: 'one', severity: 'warning' }],
      indexability: { verdict: 'Indexable' },
    },
    responseMeta: {
      statusCode: 200,
      xRobotsTag: [],
      contentType: ['text/html'],
      contentLanguage: ['en'],
      cacheControl: ['public'],
    },
    securityAudit: {
      headers: [
        { key: 'csp', state: 'present', value: "default-src 'self'" },
        { key: 'hsts', state: 'present', value: 'max-age=31536000' },
      ],
    },
  };
  return Object.assign(base, overrides || {});
}

test('summarize builds bounded side-by-side facts across required categories', () => {
  const summary = PageCompare.summarize(report());
  assert.equal(summary.title, 'Title A');
  assert.deepEqual(summary.headings.h1, ['Main']);
  assert.equal(summary.links.internal, 1);
  assert.equal(summary.links.external, 1);
  assert.equal(summary.links.nofollow, 1);
  assert.equal(summary.images.missingAlt, 1);
  assert.equal(summary.images.missingDimensions, 1);
  assert.deepEqual(summary.schema.types, ['Product']);
  assert.equal(summary.hreflang.count, 1);
  assert.equal(summary.headers.csp.state, 'present');
  assert.equal(summary.issues.warning, 1);
});

test('compareReports exposes deterministic rows and changed count', () => {
  const left = report();
  const right = report();
  right.facts = Object.assign({}, right.facts, { title: 'Title B' });
  const comparison = PageCompare.compareReports(left, right);
  const title = comparison.rows.find((item) => item.category === 'Metadata' && item.field === 'Title');
  assert.equal(title.equal, false);
  assert.equal(title.leftDisplay, 'Title A');
  assert.equal(title.rightDisplay, 'Title B');
  assert.equal(comparison.summary.changed >= 1, true);
  assert.equal(comparison.changed.every((item) => item.equal === false), true);
});

test('equal reports produce zero changed rows', () => {
  const current = report();
  const comparison = PageCompare.compareReports(current, JSON.parse(JSON.stringify(current)));
  assert.equal(comparison.summary.changed, 0);
  assert.equal(comparison.summary.equal, comparison.summary.rows);
});

test('header comparison includes SEO and security response headers', () => {
  const left = report();
  const right = report();
  right.responseMeta = Object.assign({}, right.responseMeta, { xRobotsTag: ['noindex'] });
  right.securityAudit = { headers: [{ key: 'csp', state: 'missing', value: '' }] };
  const rows = PageCompare.compareReports(left, right).changed;
  assert.ok(rows.some((item) => item.field === 'X-Robots-Tag'));
  assert.ok(rows.some((item) => item.field === 'Content-Security-Policy'));
});

test('issue comparison uses counts and stable IDs rather than messages', () => {
  const left = report();
  const right = report();
  right.evaluation = {
    score: 80,
    indexability: { verdict: 'Noindex' },
    issues: [
      { id: 'two', severity: 'critical', message: 'message can vary' },
      { id: 'one', severity: 'warning', message: 'different copy' },
    ],
  };
  const comparison = PageCompare.compareReports(left, right);
  assert.ok(comparison.changed.some((item) => item.field === 'Critical issues'));
  assert.ok(comparison.changed.some((item) => item.field === 'Issue IDs'));
});

test('detail inventories are capped and disclose omitted item count', () => {
  const values = Array.from({ length: PageCompare.MAX_DETAIL_ITEMS + 5 }, (_, index) => `item-${index}`);
  const capped = PageCompare.capList(values);
  assert.equal(capped.length, PageCompare.MAX_DETAIL_ITEMS + 1);
  assert.equal(capped[capped.length - 1], '… +5 more');
});

test('long detail text is bounded for sidebar rendering', () => {
  const value = 'x'.repeat(PageCompare.MAX_DETAIL_TEXT + 50);
  const capped = PageCompare.capText(value);
  assert.equal(capped.length, PageCompare.MAX_DETAIL_TEXT);
  assert.ok(capped.endsWith('…'));
});

test('schema types are deduplicated and sorted', () => {
  assert.deepEqual(PageCompare.schemaTypes([
    { types: ['Product', 'Offer'] },
    { types: ['Product'] },
  ]), ['Offer', 'Product']);
});
