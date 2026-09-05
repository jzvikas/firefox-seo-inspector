'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CategoryPageAudit = require('../src/lib/category-page-audit.js');

function facts(overrides) {
  return Object.assign({
    url: 'https://example.test/shoes',
    canonical: { count: 1, href: 'https://example.test/shoes' },
    robots: [],
    textWordCount: 320,
    pageSignals: {
      itemListMicrodata: 1,
      productMicrodata: 12,
      listingLinkUrls: Array.from({ length: 12 }, (_, index) => `https://example.test/product/${index + 1}`),
      relNext: 'https://example.test/shoes?page=2',
      relPrev: '',
    },
    links: [],
    schemas: [],
  }, overrides || {});
}

const categoryType = {
  primary: 'category',
  label: 'Category / listing',
  confidence: 'high',
  traits: { faceted: false, pagination: false },
};

test('returns non-applicable result for an unrelated generic page', () => {
  const result = CategoryPageAudit.inspect(facts({
    pageSignals: { itemListMicrodata: 0, productMicrodata: 0, listingLinkUrls: [], relNext: '', relPrev: '' },
  }), { primary: 'generic', traits: { faceted: false, pagination: false } });
  assert.equal(result.applicable, false);
  assert.deepEqual(result.issues, []);
});

test('healthy category summarizes listing item evidence without false warnings', () => {
  const result = CategoryPageAudit.inspect(facts(), categoryType);
  assert.equal(result.applicable, true);
  assert.equal(result.listing.itemCount, 12);
  assert.equal(result.canonical.self, true);
  assert.equal(result.pagination.detected, true);
  assert.equal(result.summary.critical, 0);
  assert.equal(result.summary.warning, 0);
});

test('faceted self-canonical indexable category warns about index-bloat risk', () => {
  const result = CategoryPageAudit.inspect(facts({
    url: 'https://example.test/shoes?color=black&sort=price',
    canonical: { count: 1, href: 'https://example.test/shoes?color=black&sort=price' },
  }), {
    primary: 'category',
    traits: { faceted: true, pagination: false },
  });
  assert.equal(result.facets.detected, true);
  assert.equal(result.facets.filterParams[0].name, 'color');
  assert.equal(result.facets.sortParams[0].name, 'sort');
  assert.ok(result.issues.some((item) => item.id === 'category.facets.index_bloat'));
});

test('faceted category canonicalized to clean base avoids the index-bloat warning', () => {
  const result = CategoryPageAudit.inspect(facts({
    url: 'https://example.test/shoes?brand=acme',
    canonical: { count: 1, href: 'https://example.test/shoes' },
  }), {
    primary: 'category',
    traits: { faceted: true, pagination: false },
  });
  assert.equal(result.canonical.cleanBase, 'https://example.test/shoes');
  assert.equal(result.issues.some((item) => item.id === 'category.facets.index_bloat'), false);
  assert.equal(result.issues.some((item) => item.id === 'category.canonical.different'), false);
});

test('page two canonicalized to page one and missing rel prev is diagnosed', () => {
  const result = CategoryPageAudit.inspect(facts({
    url: 'https://example.test/shoes?page=2',
    canonical: { count: 1, href: 'https://example.test/shoes' },
    pageSignals: {
      itemListMicrodata: 1,
      productMicrodata: 10,
      listingLinkUrls: ['https://example.test/product/1'],
      relNext: 'https://example.test/shoes?page=3',
      relPrev: '',
    },
  }), {
    primary: 'category',
    traits: { faceted: false, pagination: true },
  });
  assert.equal(result.pagination.pageNumber, 2);
  assert.ok(result.issues.some((item) => item.id === 'category.pagination.canonical_first_page'));
  assert.ok(result.issues.some((item) => item.id === 'category.pagination.prev_missing'));
});

test('empty and thin listings are diagnosed conservatively', () => {
  const empty = CategoryPageAudit.inspect(facts({
    textWordCount: 60,
    pageSignals: { itemListMicrodata: 1, productMicrodata: 0, listingLinkUrls: [], relNext: '', relPrev: '' },
  }), categoryType);
  assert.ok(empty.issues.some((item) => item.id === 'category.items.empty'));

  const thin = CategoryPageAudit.inspect(facts({
    textWordCount: 70,
    pageSignals: { itemListMicrodata: 1, productMicrodata: 2, listingLinkUrls: ['https://example.test/p/1'], relNext: '', relPrev: '' },
  }), categoryType);
  assert.ok(thin.issues.some((item) => item.id === 'category.items.thin'));
});

test('many parameterized internal links keep bounded highlight refs', () => {
  const links = Array.from({ length: 12 }, (_, index) => ({
    href: `https://example.test/shoes?filter_color=${index}`,
    label: `Filter ${index}`,
    internal: true,
    kind: 'http',
    ref: { selector: 'a[href]', index },
  }));
  const result = CategoryPageAudit.inspect(facts({ links }), categoryType);
  const warning = result.issues.find((item) => item.id === 'category.facets.internal_links');
  assert.ok(warning);
  assert.equal(warning.refs.length, 12);
});

test('parameter classifier separates filter, sort, pagination, tracking, and session keys', () => {
  assert.equal(CategoryPageAudit.classifyParam('filter_color'), 'filter');
  assert.equal(CategoryPageAudit.classifyParam('sort'), 'sort');
  assert.equal(CategoryPageAudit.classifyParam('page'), 'pagination');
  assert.equal(CategoryPageAudit.classifyParam('utm_source'), 'tracking');
  assert.equal(CategoryPageAudit.classifyParam('PHPSESSID'), 'session');
  assert.equal(CategoryPageAudit.classifyParam('q'), 'other');
});
