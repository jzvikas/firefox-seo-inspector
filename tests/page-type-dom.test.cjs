'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PageTypeDom = require('../src/lib/page-type-dom.js');

function node(href) {
  return { getAttribute(name) { return name === 'href' ? href || '' : ''; } };
}

function fakeDoc(counts, singles, lists) {
  const countMap = counts || {};
  const singleMap = singles || {};
  const listMap = lists || {};
  return {
    querySelectorAll(selector) {
      if (Object.prototype.hasOwnProperty.call(listMap, selector)) return listMap[selector];
      return { length: Number(countMap[selector]) || 0 };
    },
    querySelector(selector) {
      return singleMap[selector] || null;
    },
  };
}

test('collect returns bounded semantic counts, listing links, and pagination links', () => {
  const doc = fakeDoc({
    article: 1,
    'input[type="search" i], form[role="search" i], [role="search" i]': 2,
    '[itemtype*="schema.org/Product" i]': 3,
    '[itemtype*="schema.org/ItemList" i]': 1,
  }, {
    'link[rel~="next" i], a[rel~="next" i]': node('/page/2'),
    'link[rel~="prev" i], a[rel~="prev" i]': node('/page/0'),
  }, {
    '[itemtype*="schema.org/Product" i] a[href]': [node('/p/1'), node('/p/2')],
    '[itemprop="itemListElement" i] a[href]': [node('/p/2'), node('/p/3')],
  });
  const result = PageTypeDom.collect(doc, 'https://example.test/page/1');
  assert.deepEqual(result, {
    articleElements: 1,
    searchControls: 2,
    productMicrodata: 3,
    itemListMicrodata: 1,
    listingLinkUrls: [
      'https://example.test/p/1',
      'https://example.test/p/2',
      'https://example.test/p/3',
    ],
    relNext: 'https://example.test/page/2',
    relPrev: 'https://example.test/page/0',
  });
});

test('collect degrades safely when document query APIs are unavailable', () => {
  assert.deepEqual(PageTypeDom.collect(null, 'https://example.test/'), {
    articleElements: 0,
    searchControls: 0,
    productMicrodata: 0,
    itemListMicrodata: 0,
    listingLinkUrls: [],
    relNext: '',
    relPrev: '',
  });
});

test('absolute preserves invalid fallback text and resolves relative HTTP URLs', () => {
  assert.equal(PageTypeDom.absolute('/next', 'https://example.test/a'), 'https://example.test/next');
  assert.equal(PageTypeDom.absolute('%%%not-a-url', ''), '%%%not-a-url');
});
