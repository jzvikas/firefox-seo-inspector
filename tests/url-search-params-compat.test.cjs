'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PageType = require('../src/lib/page-type.js');
const ProductPageAudit = require('../src/lib/product-page-audit.js');
const CategoryPageAudit = require('../src/lib/category-page-audit.js');
const PaginationAudit = require('../src/lib/pagination-audit.js');

function withBrokenUrlSearchParamsIterators(callback) {
  const originalEntries = URLSearchParams.prototype.entries;
  const originalKeys = URLSearchParams.prototype.keys;
  URLSearchParams.prototype.entries = function entriesWithoutIterator() {
    return { next() { return { done: true, value: undefined }; } };
  };
  URLSearchParams.prototype.keys = function keysWithoutIterator() {
    return { next() { return { done: true, value: undefined }; } };
  };
  try {
    return callback();
  } finally {
    URLSearchParams.prototype.entries = originalEntries;
    URLSearchParams.prototype.keys = originalKeys;
  }
}

test('URL parsing does not depend on iterable URLSearchParams entries/keys', () => {
  withBrokenUrlSearchParamsIterators(() => {
    const signals = PageType.urlSignals('https://example.test/catalog?q=boots&page=2&filter_brand=acme');
    assert.deepEqual(signals.searchParams, ['q']);
    assert.deepEqual(signals.paginationParams, ['page']);
    assert.deepEqual(signals.filterParams, ['filter_brand']);

    assert.deepEqual(ProductPageAudit.variantParamNames('https://example.test/item?variant=blue&sku=ABC'), ['variant', 'sku']);
    assert.equal(ProductPageAudit.stripVariantParams('https://example.test/item?variant=blue&keep=1'), 'https://example.test/item?keep=1');

    const params = CategoryPageAudit.classifyUrlParams('https://example.test/list?brand=acme&page=3&utm_source=test');
    assert.deepEqual(params.map((item) => [item.name, item.kind]), [
      ['brand', 'filter'],
      ['page', 'pagination'],
      ['utm_source', 'tracking'],
    ]);
    assert.deepEqual(CategoryPageAudit.paginationParam('https://example.test/list?page=3'), { name: 'page', number: 3 });
    assert.equal(CategoryPageAudit.stripPagination('https://example.test/list?page=3&brand=acme'), 'https://example.test/list?brand=acme');

    assert.deepEqual(PaginationAudit.pageSignal('https://example.test/list?page=4&brand=acme'), {
      detected: true,
      number: 4,
      source: 'page',
      raw: '4',
    });
    assert.equal(PaginationAudit.familyKey('https://example.test/list?page=4&brand=acme'), 'https://example.test/list?brand=acme');
  });
});

test('pagination preserves first matching query signal without iterator early-return semantics', () => {
  withBrokenUrlSearchParamsIterators(() => {
    assert.deepEqual(PaginationAudit.pageSignal('https://example.test/list?page=bad&p=7'), {
      detected: true,
      number: null,
      source: 'page',
      raw: 'bad',
    });
  });
});

test('runtime source avoids URLSearchParams entries/keys iterator calls', () => {
  const root = path.join(__dirname, '..', 'src');
  const offenders = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (/\.searchParams\.(?:entries|keys)\s*\(/.test(source)) {
        offenders.push(path.relative(path.join(__dirname, '..'), full));
      }
    }
  }
  walk(root);
  assert.deepEqual(offenders, []);
});
