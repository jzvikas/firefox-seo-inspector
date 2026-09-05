'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PageType = require('../src/lib/page-type.js');

function facts(overrides) {
  return Object.assign({
    url: 'https://example.test/content',
    schemas: [],
    openGraph: {},
    textWordCount: 120,
    pageSignals: {},
  }, overrides || {});
}

function schema(types) {
  return { valid: true, types: Array.isArray(types) ? types : [types] };
}

test('HTTP error has highest precedence and is high confidence', () => {
  const result = PageType.detect(facts({
    url: 'https://example.test/',
    schemas: [schema('Product')],
  }), { statusCode: 404 });
  assert.equal(result.primary, PageType.TYPES.ERROR);
  assert.equal(result.confidence, 'high');
  assert.match(result.evidence[0].detail, /404/);
});

test('root path is detected as homepage even when generic listing signals exist', () => {
  const result = PageType.detect(facts({
    url: 'https://example.test/',
    schemas: [schema('ItemList')],
  }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.HOMEPAGE);
  assert.equal(result.confidence, 'high');
});

test('Product schema creates a high-confidence product classification', () => {
  const result = PageType.detect(facts({ schemas: [schema(['Product', 'BreadcrumbList'])] }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.PRODUCT);
  assert.equal(result.confidence, 'high');
  assert.equal(result.candidateScores.product, 7);
});

test('og:type product is a medium-confidence platform-neutral product signal', () => {
  const result = PageType.detect(facts({ openGraph: { 'og:type': 'product' } }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.PRODUCT);
  assert.equal(result.confidence, 'medium');
});

test('Article structured data wins article classification', () => {
  const result = PageType.detect(facts({ schemas: [schema('BlogPosting')] }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.ARTICLE);
  assert.equal(result.confidence, 'high');
});

test('semantic article plus substantial text can classify an article without schema', () => {
  const result = PageType.detect(facts({ textWordCount: 850, pageSignals: { articleElements: 1 } }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.ARTICLE);
  assert.equal(result.confidence, 'medium');
});

test('CollectionPage and ItemList identify category/listing pages', () => {
  const collection = PageType.detect(facts({ schemas: [schema('CollectionPage')] }), { statusCode: 200 });
  const listing = PageType.detect(facts({ schemas: [schema('ItemList')] }), { statusCode: 200 });
  assert.equal(collection.primary, PageType.TYPES.CATEGORY);
  assert.equal(collection.confidence, 'high');
  assert.equal(listing.primary, PageType.TYPES.CATEGORY);
  assert.equal(listing.confidence, 'medium');
});

test('multiple Product schema blocks provide category evidence but a single Product remains product', () => {
  const result = PageType.detect(facts({ schemas: [schema('Product'), schema('Product'), schema('Product')] }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.PRODUCT);
  assert.ok(result.candidateScores.category >= 3);
  assert.ok(result.candidateScores.product > result.candidateScores.category);
});

test('search path and query parameters identify search result pages', () => {
  const pathResult = PageType.detect(facts({ url: 'https://example.test/search/shoes' }), { statusCode: 200 });
  const queryResult = PageType.detect(facts({ url: 'https://example.test/catalog?q=boots' }), { statusCode: 200 });
  assert.equal(pathResult.primary, PageType.TYPES.SEARCH);
  assert.equal(queryResult.primary, PageType.TYPES.SEARCH);
  assert.equal(pathResult.confidence, 'medium');
  assert.equal(queryResult.confidence, 'medium');
});

test('SearchResultsPage schema beats Product blocks commonly present in results', () => {
  const result = PageType.detect(facts({
    schemas: [schema('SearchResultsPage'), schema('Product')],
  }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.SEARCH);
  assert.ok(result.candidateScores.search > result.candidateScores.product);
});

test('filter parameters add a faceted trait without replacing the primary type', () => {
  const result = PageType.detect(facts({
    url: 'https://example.test/shoes?brand=acme&color=black',
    schemas: [schema('CollectionPage')],
  }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.CATEGORY);
  assert.equal(result.traits.faceted, true);
  assert.ok(result.detected.includes(PageType.TYPES.FACETED));
  assert.match(PageType.display(result), /Faceted/);
});

test('pagination parameters and paths add the pagination trait', () => {
  const queryResult = PageType.detect(facts({ url: 'https://example.test/news?page=2' }), { statusCode: 200 });
  const pathResult = PageType.detect(facts({ url: 'https://example.test/news/page/3/' }), { statusCode: 200 });
  assert.equal(queryResult.traits.pagination, true);
  assert.equal(pathResult.traits.pagination, true);
  assert.ok(queryResult.detected.includes(PageType.TYPES.PAGINATION));
});

test('rel next/prev DOM signal adds pagination trait without depending on URL shape', () => {
  const result = PageType.detect(facts({ pageSignals: { relNext: 'https://example.test/news/next' } }), { statusCode: 200 });
  assert.equal(result.traits.pagination, true);
});

test('generic content is the bounded fallback when no stronger signal exists', () => {
  const result = PageType.detect(facts(), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.GENERIC);
  assert.equal(result.confidence, 'low');
  assert.equal(result.evidence[0].signal, 'fallback');
});

test('homepage query search is search rather than homepage', () => {
  const result = PageType.detect(facts({ url: 'https://example.test/?query=boots' }), { statusCode: 200 });
  assert.equal(result.primary, PageType.TYPES.SEARCH);
});

test('URL parser keeps pagination/filter signals deterministic and ignores page=1', () => {
  const parsed = PageType.urlSignals('https://example.test/catalog?page=1&filter_brand=x&sort=price#top');
  assert.deepEqual(parsed.paginationParams, []);
  assert.deepEqual(parsed.filterParams, ['filter_brand', 'sort']);
});

test('schema type counts are case-normalized and ignore invalid JSON-LD records', () => {
  const counts = PageType.schemaTypeCounts(facts({
    schemas: [schema('Product'), schema('product'), { valid: false, types: ['Product'] }],
  }));
  assert.equal(counts.product, 2);
});
