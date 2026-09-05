'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ProductPageAudit = require('../src/lib/product-page-audit.js');
const PageType = require('../src/lib/page-type.js');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function fakeNode(tag) {
  return {
    tagName: tag || 'div',
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    insertBefore(child, before) {
      const index = this.children.indexOf(before);
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
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

function productReport() {
  const facts = {
    url: 'https://shop.test/product/shoe',
    canonical: { count: 1, href: 'https://shop.test/product/shoe' },
    robots: [],
    schemas: [
      {
        valid: true,
        parsed: {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Shoe',
          image: 'https://cdn.test/shoe.jpg',
          sku: 'SKU-1',
          gtin13: '1234567890123',
          brand: { '@type': 'Brand', name: 'Brand' },
          offers: { '@type': 'Offer', price: '20', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
        },
      },
      { valid: true, parsed: { '@type': 'BreadcrumbList' } },
    ],
  };
  const pageType = { primary: 'product', label: 'Product', confidence: 'high', traits: { faceted: false, pagination: false } };
  return { facts, pageType, productAudit: ProductPageAudit.inspect(facts, pageType) };
}

function harness(report) {
  const panel = fakeNode('section');
  let activated = '';
  const context = vm.createContext({
    ProductPageAudit,
    PageType,
    state: { report },
    document: {
      getElementById(id) { return id === 'product' ? panel : null; },
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
    activateTab(name) { activated = name; },
  });
  vm.runInContext(source('src/sidebar/sidebar-product.js'), context, { filename: 'sidebar-product.js' });
  return { context, panel, activated: () => activated };
}

test('product sidebar renders summary fields canonical stock issues and hints', () => {
  const h = harness(productReport());
  assert.doesNotThrow(() => vm.runInContext('renderProduct()', h.context));
  const text = flattenText(h.panel).join('\n');
  assert.match(text, /Product page audit/);
  assert.match(text, /Product structured-data fields/);
  assert.match(text, /Canonical and variants/);
  assert.match(text, /Availability/);
  assert.match(text, /Product issues/);
  assert.match(text, /Shoe/);
  assert.match(text, /SKU-1/);
  assert.match(text, /EUR/);
});

test('product sidebar is quiet on non-product pages', () => {
  const report = {
    facts: { url: 'https://example.test/article', canonical: { count: 1, href: 'https://example.test/article' }, robots: [], schemas: [] },
    pageType: { primary: 'article', label: 'Article / blog', confidence: 'high', traits: { faceted: false, pagination: false } },
  };
  const h = harness(report);
  vm.runInContext('renderProduct()', h.context);
  const text = flattenText(h.panel).join('\n');
  assert.match(text, /not applicable/i);
  assert.match(text, /Article \/ blog/);
});

test('content report integration stores product audit for rendered and raw reports', () => {
  const content = source('src/content/content.js');
  assert.match(content, /const productAudit = ProductPageAudit\.inspect\(facts, pageType\);/);
  assert.ok((content.match(/\bproductAudit,\n/g) || []).length >= 2);
});
