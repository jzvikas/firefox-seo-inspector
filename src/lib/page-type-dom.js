(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PageTypeDom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function count(doc, selector) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
    try { return doc.querySelectorAll(selector).length; }
    catch (_error) { return 0; }
  }

  function first(doc, selector) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    try { return doc.querySelector(selector); }
    catch (_error) { return null; }
  }

  function all(doc, selector) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    try { return Array.prototype.slice.call(doc.querySelectorAll(selector) || []); }
    catch (_error) { return []; }
  }

  function attr(node, name) {
    return node && typeof node.getAttribute === 'function' ? String(node.getAttribute(name) || '') : '';
  }

  function absolute(value, baseUrl) {
    if (!value) return '';
    try { return new URL(value, baseUrl || undefined).href; }
    catch (_error) { return String(value); }
  }

  function collectListingLinkUrls(doc, baseUrl) {
    const selectors = [
      '[itemtype*="schema.org/Product" i] a[href]',
      '[itemprop="itemListElement" i] a[href]',
    ];
    const output = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const node of all(doc, selector)) {
        const href = absolute(attr(node, 'href'), baseUrl);
        if (!href || seen.has(href)) continue;
        seen.add(href);
        output.push(href);
        if (output.length >= 500) return output;
      }
    }
    return output;
  }

  function collect(doc, baseUrl) {
    const next = first(doc, 'link[rel~="next" i], a[rel~="next" i]');
    const prev = first(doc, 'link[rel~="prev" i], a[rel~="prev" i]');
    return {
      articleElements: count(doc, 'article'),
      searchControls: count(doc, 'input[type="search" i], form[role="search" i], [role="search" i]'),
      productMicrodata: count(doc, '[itemtype*="schema.org/Product" i]'),
      itemListMicrodata: count(doc, '[itemtype*="schema.org/ItemList" i]'),
      listingLinkUrls: collectListingLinkUrls(doc, baseUrl),
      relNext: next ? absolute(attr(next, 'href'), baseUrl) : '',
      relPrev: prev ? absolute(attr(prev, 'href'), baseUrl) : '',
    };
  }

  return { collect, absolute, collectListingLinkUrls };
});
