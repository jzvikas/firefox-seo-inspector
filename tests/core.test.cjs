'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SeoCore = require('../src/lib/seo-core.js');

function healthyFacts(overrides = {}) {
  return Object.assign({
    url: 'https://example.com/products/widget',
    title: 'A useful example product title for search',
    description: 'This is a complete example meta description written to be long enough for the configured SEO inspector checks.',
    viewport: 'width=device-width, initial-scale=1',
    lang: 'en',
    canonical: { count: 1, href: 'https://example.com/products/widget' },
    robots: [{ name: 'robots', content: 'index, follow' }],
    headings: [{ level: 1, text: 'Widget', ref: { selector: 'h1,h2,h3,h4,h5,h6', index: 0 } }, { level: 2, text: 'Details', ref: { selector: 'h1,h2,h3,h4,h5,h6', index: 1 } }],
    images: [{ altPresent: true, alt: 'Widget', widthAttr: '600', heightAttr: '600', naturalWidth: 600, renderedWidth: 400, ref: { selector: 'img', index: 0 } }],
    links: [{ kind: 'http', label: 'More', ref: { selector: 'a[href]', index: 0 } }],
    hreflang: [],
    schemas: [{ valid: true, types: ['Product'], summary: { name: 'Widget', hasOffers: true }, ref: { selector: 'script[type="application/ld+json" i]', index: 0 } }],
  }, overrides);
}

function ids(result) {
  return new Set(result.issues.map((item) => item.id));
}

test('healthy facts produce a perfect configured score', () => {
  const result = SeoCore.evaluateFacts(healthyFacts(), { statusCode: 200, xRobotsTag: [] });
  assert.equal(result.score, 100);
  assert.equal(result.issues.length, 0);
});

test('missing title is critical and missing description is warning', () => {
  const result = SeoCore.evaluateFacts(healthyFacts({ title: '', description: '' }), { statusCode: 200, xRobotsTag: [] });
  assert.ok(ids(result).has('title.missing'));
  assert.ok(ids(result).has('description.missing'));
  assert.equal(result.severityCounts.critical, 1);
  assert.equal(result.severityCounts.warning, 1);
});

test('meta and X-Robots noindex are both detected', () => {
  const facts = healthyFacts({ robots: [{ name: 'robots', content: 'noindex,follow' }] });
  const result = SeoCore.evaluateFacts(facts, { statusCode: 200, xRobotsTag: ['googlebot: noindex'] });
  assert.ok(ids(result).has('robots.meta.noindex'));
  assert.ok(ids(result).has('robots.header.noindex'));
});

test('multiple and cross-page canonicals are flagged', () => {
  const facts = healthyFacts({ canonical: { count: 2, href: 'https://example.com/other' } });
  const result = SeoCore.evaluateFacts(facts, { statusCode: 200, xRobotsTag: [] });
  assert.ok(ids(result).has('canonical.multiple'));
  assert.ok(ids(result).has('canonical.different'));
});

test('heading level jumps and multiple H1 values are flagged with refs', () => {
  const headings = [
    { level: 1, text: 'One', ref: { selector: 'x', index: 0 } },
    { level: 1, text: 'Two', ref: { selector: 'x', index: 1 } },
    { level: 3, text: 'Jump', ref: { selector: 'x', index: 2 } },
  ];
  const result = SeoCore.evaluateFacts(healthyFacts({ headings }), { statusCode: 200, xRobotsTag: [] });
  const map = new Map(result.issues.map((item) => [item.id, item]));
  assert.equal(map.get('headings.h1.multiple').refs.length, 2);
  assert.equal(map.get('headings.jump').refs.length, 1);
});

test('missing alt, missing dimensions, and oversized images are grouped', () => {
  const images = [{ altPresent: false, alt: '', widthAttr: '', heightAttr: '', naturalWidth: 1600, renderedWidth: 300, ref: { selector: 'img', index: 0 } }];
  const result = SeoCore.evaluateFacts(healthyFacts({ images }), { statusCode: 200, xRobotsTag: [] });
  const resultIds = ids(result);
  assert.ok(resultIds.has('images.alt.missing'));
  assert.ok(resultIds.has('images.dimensions.missing'));
  assert.ok(resultIds.has('images.oversized'));
});

test('empty HTTP link labels and javascript links are detected', () => {
  const links = [
    { kind: 'http', label: '', ref: { selector: 'a[href]', index: 0 } },
    { kind: 'javascript', label: 'Do', ref: { selector: 'a[href]', index: 1 } },
  ];
  const result = SeoCore.evaluateFacts(healthyFacts({ links }), { statusCode: 200, xRobotsTag: [] });
  assert.ok(ids(result).has('links.label.missing'));
  assert.ok(ids(result).has('links.javascript'));
});

test('invalid JSON-LD is critical and Product requirements are checked', () => {
  const schemas = [
    { valid: false, types: [], ref: { selector: 'x', index: 0 } },
    { valid: true, types: ['Product'], summary: { name: '', hasOffers: false }, ref: { selector: 'x', index: 1 } },
  ];
  const result = SeoCore.evaluateFacts(healthyFacts({ schemas }), { statusCode: 200, xRobotsTag: [] });
  const resultIds = ids(result);
  assert.ok(resultIds.has('schema.invalid'));
  assert.ok(resultIds.has('schema.product.name'));
  assert.ok(resultIds.has('schema.product.offers'));
});

test('duplicate hreflang values are detected case-insensitively', () => {
  const hreflang = [
    { lang: 'en-US', href: 'https://example.com/en', ref: { selector: 'x', index: 0 } },
    { lang: 'EN-us', href: 'https://example.com/en-2', ref: { selector: 'x', index: 1 } },
  ];
  const result = SeoCore.evaluateFacts(healthyFacts({ hreflang }), { statusCode: 200, xRobotsTag: [] });
  assert.ok(ids(result).has('hreflang.duplicate'));
});

test('HTTP error on the main document is critical', () => {
  const result = SeoCore.evaluateFacts(healthyFacts(), { statusCode: 404, statusLine: 'HTTP/2 404', xRobotsTag: [] });
  assert.ok(ids(result).has('http.error'));
});

test('snapshot diff reports only changed audit fields', () => {
  const report = { facts: healthyFacts(), evaluation: { score: 100, issues: [] } };
  const before = SeoCore.makeSnapshot(report);
  const after = { ...before, title: 'Changed', linkCount: before.linkCount + 1 };
  const diff = SeoCore.diffSnapshots(before, after);
  assert.deepEqual(diff.map((item) => item.field), ['title', 'linkCount']);
});

test('rendered versus raw comparison exposes meaningful changes', () => {
  const rendered = healthyFacts();
  const raw = healthyFacts({ title: 'Raw title', headings: [], links: [] });
  const diff = SeoCore.diffPageFacts(rendered, raw);
  const fields = diff.map((item) => item.field);
  assert.ok(fields.includes('title'));
  assert.ok(fields.includes('H1 count'));
  assert.ok(fields.includes('Link count'));
});

test('link result summary separates redirects, broken, unknown, and OK', () => {
  const result = SeoCore.summarizeLinkResults([
    { status: 200, redirected: false, error: null },
    { status: 200, redirected: true, error: null },
    { status: 404, redirected: false, error: null },
    { status: 0, redirected: false, error: 'timeout' },
  ]);
  assert.deepEqual(result, { ok: 1, broken: 1, redirect: 1, unknown: 1 });
});
