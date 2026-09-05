'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CategoryPageAudit = require('../src/lib/category-page-audit.js');
const PageType = require('../src/lib/page-type.js');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function fakeNode(tag) {
  return {
    tagName: tag || 'div',
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    setAttribute() {},
    className: '',
    textContent: '',
    type: '',
  };
}

function flattenText(node, output) {
  const result = output || [];
  if (!node) return result;
  if (node.textContent) result.push(String(node.textContent));
  for (const child of node.children || []) flattenText(child, result);
  return result;
}

function categoryReport() {
  const facts = {
    url: 'https://shop.test/shoes?color=black',
    canonical: { count: 1, href: 'https://shop.test/shoes' },
    robots: [],
    schemas: [],
    links: Array.from({ length: 11 }, (_, index) => ({
      href: `https://shop.test/shoes?filter_size=${index + 35}`,
      label: `Size ${index + 35}`,
      kind: 'http',
      internal: true,
      ref: { selector: 'a[href]', index },
    })),
    textWordCount: 240,
    pageSignals: {
      itemListMicrodata: 1,
      productMicrodata: 8,
      listingLinkUrls: Array.from({ length: 8 }, (_, index) => `https://shop.test/product/${index + 1}`),
      relPrev: '',
      relNext: 'https://shop.test/shoes?page=2',
    },
  };
  const pageType = { primary: 'category', label: 'Category / listing', confidence: 'high', traits: { faceted: true, pagination: false } };
  return { facts, pageType, categoryAudit: CategoryPageAudit.inspect(facts, pageType) };
}

function harness(report) {
  const panel = fakeNode('section');
  const sent = [];
  const context = vm.createContext({
    CategoryPageAudit,
    PageType,
    state: { report },
    document: {
      getElementById(id) { return id === 'category' ? panel : null; },
      createElement(tag) { return fakeNode(tag); },
    },
    clear(node) { node.children.length = 0; },
    el(tag, className, text) {
      const node = fakeNode(tag);
      node.className = className || '';
      node.textContent = text === undefined || text === null ? '' : String(text);
      return node;
    },
    badge(text, className) {
      const node = fakeNode('span');
      node.className = className || '';
      node.textContent = String(text);
      return node;
    },
    addRow(container, label, value) {
      const node = fakeNode('div');
      node.textContent = `${label}: ${value}`;
      container.appendChild(node);
    },
    sendToTab(message) { sent.push(message); return Promise.resolve({ highlighted: 1 }); },
  });
  vm.runInContext(source('src/sidebar/sidebar-category.js'), context, { filename: 'sidebar-category.js' });
  return { context, panel, sent };
}

test('category sidebar renders canonical listing facets pagination and issues', () => {
  const h = harness(categoryReport());
  assert.doesNotThrow(() => vm.runInContext('renderCategory()', h.context));
  const text = flattenText(h.panel).join('\n');
  assert.match(text, /Category\/listing audit/);
  assert.match(text, /Canonical/);
  assert.match(text, /Faceted navigation/);
  assert.match(text, /Pagination/);
  assert.match(text, /Current URL parameters/);
  assert.match(text, /Category\/listing issues/);
  assert.match(text, /color/);
  assert.match(text, /8 listing items/);
  assert.match(text, /Many parameterized internal links/);
});

test('category sidebar is quiet on unrelated pages', () => {
  const report = {
    facts: {
      url: 'https://example.test/article',
      canonical: { count: 1, href: 'https://example.test/article' },
      robots: [],
      schemas: [],
      links: [],
      textWordCount: 500,
      pageSignals: { itemListMicrodata: 0, productMicrodata: 0, listingLinkUrls: [], relPrev: '', relNext: '' },
    },
    pageType: { primary: 'article', label: 'Article / blog', confidence: 'high', traits: { faceted: false, pagination: false } },
  };
  const h = harness(report);
  vm.runInContext('renderCategory()', h.context);
  const text = flattenText(h.panel).join('\n');
  assert.match(text, /not applicable/i);
  assert.match(text, /Article \/ blog/);
});

test('content report integration stores category audit for rendered and raw reports', () => {
  const content = source('src/content/content.js');
  assert.match(content, /const categoryAudit = CategoryPageAudit\.inspect\(facts, pageType\);/);
  assert.ok((content.match(/\bcategoryAudit,\n/g) || []).length >= 2);
});
