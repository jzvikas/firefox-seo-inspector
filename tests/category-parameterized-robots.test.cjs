'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CategoryPageAudit = require('../src/lib/category-page-audit.js');

function facts() {
  return {
    url: 'https://example.test/shoes?color=black',
    canonical: { count: 1, href: 'https://example.test/shoes?color=black' },
    robots: [],
    schemas: [],
    links: [],
    textWordCount: 300,
    pageSignals: {
      itemListMicrodata: 1,
      productMicrodata: 12,
      listingLinkUrls: Array.from({ length: 12 }, (_, index) => `https://example.test/product/${index + 1}`),
      relNext: '',
      relPrev: '',
    },
  };
}

const pageType = { primary: 'category', label: 'Category / listing', confidence: 'high', traits: { faceted: true, pagination: false } };

test('X-Robots-Tag noindex suppresses index-bloat warning on self-canonical faceted URL', () => {
  const result = CategoryPageAudit.inspect(facts(), pageType, { xRobotsTag: ['noindex, follow'] });
  assert.equal(result.indexability.noindex, true);
  assert.deepEqual(result.indexability.xRobotsTag, ['noindex, follow']);
  assert.equal(result.issues.some((item) => item.id === 'category.facets.index_bloat'), false);
});

test('indexable self-canonical faceted URL still receives index-bloat warning', () => {
  const result = CategoryPageAudit.inspect(facts(), pageType, { xRobotsTag: ['index, follow'] });
  assert.equal(result.indexability.noindex, false);
  assert.equal(result.issues.some((item) => item.id === 'category.facets.index_bloat'), true);
});

test('parameterized URL reports conflicting meta and header robots directives', () => {
  const value = facts();
  value.robots = [{ content: 'index,follow' }];
  const result = CategoryPageAudit.inspect(value, pageType, { xRobotsTag: ['noindex'] });
  assert.equal(result.indexability.index, true);
  assert.equal(result.indexability.noindex, true);
  assert.ok(result.issues.some((item) => item.id === 'category.params.robots_conflict'));
});

test('tracking/session-like self canonical is not warned as indexable duplicate when noindex is effective', () => {
  const value = facts();
  value.url = 'https://example.test/shoes?utm_source=test&sessionid=abc';
  value.canonical = { count: 1, href: value.url };
  const result = CategoryPageAudit.inspect(value, pageType, { xRobotsTag: ['noindex'] });
  assert.equal(result.issues.some((item) => item.id === 'category.params.noncontent_canonical'), false);
});
