(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SitemapXml = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function decodeXml(value) {
    return String(value || '')
      .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
      .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .trim();
  }

  function tagValue(block, tag) {
    const expression = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = expression.exec(String(block || ''));
    return match ? decodeXml(match[1]) : '';
  }

  function absoluteUrl(value, baseUrl) {
    if (!value) return '';
    try {
      const url = new URL(value, baseUrl || undefined);
      url.hash = '';
      return url.href;
    } catch (_error) {
      return String(value).trim();
    }
  }

  function parse(text, baseUrl) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const warnings = [];
    let type = 'unknown';
    if (/<(?:[a-z0-9_-]+:)?sitemapindex\b/i.test(source)) type = 'sitemapindex';
    else if (/<(?:[a-z0-9_-]+:)?urlset\b/i.test(source)) type = 'urlset';
    else warnings.push('Sitemap root is not urlset or sitemapindex.');

    const entries = [];
    if (type === 'sitemapindex') {
      const expression = /<(?:[a-z0-9_-]+:)?sitemap\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?sitemap>/gi;
      let match;
      while ((match = expression.exec(source))) {
        const loc = absoluteUrl(tagValue(match[1], 'loc'), baseUrl);
        if (!loc) {
          warnings.push('A sitemap entry is missing loc.');
          continue;
        }
        entries.push({ loc, lastmod: tagValue(match[1], 'lastmod') });
      }
    } else if (type === 'urlset') {
      const expression = /<(?:[a-z0-9_-]+:)?url\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?url>/gi;
      let match;
      while ((match = expression.exec(source))) {
        const loc = absoluteUrl(tagValue(match[1], 'loc'), baseUrl);
        if (!loc) {
          warnings.push('A URL entry is missing loc.');
          continue;
        }
        entries.push({ loc, lastmod: tagValue(match[1], 'lastmod') });
      }
    }

    return { type, entries, warnings };
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = '';
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
      return url.href;
    } catch (_error) {
      return String(value || '').trim();
    }
  }

  function findEntry(parsed, targetUrl) {
    const target = normalizeUrl(targetUrl);
    if (!target) return null;
    for (const entry of (parsed && parsed.entries) || []) {
      if (normalizeUrl(entry.loc) === target) return entry;
    }
    return null;
  }

  return {
    parse,
    findEntry,
    decodeXml,
    tagValue,
    absoluteUrl,
    normalizeUrl,
  };
});
