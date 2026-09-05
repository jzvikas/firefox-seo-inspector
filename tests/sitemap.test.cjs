'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SitemapXml = require('../src/lib/sitemap.js');

test('parses urlset entries with lastmod', () => {
  const parsed = SitemapXml.parse(`<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc><lastmod>2026-09-01</lastmod></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`, 'https://example.com/sitemap.xml');
  assert.equal(parsed.type, 'urlset');
  assert.equal(parsed.entries.length, 2);
  assert.deepEqual(parsed.entries[0], { loc: 'https://example.com/a', lastmod: '2026-09-01' });
  assert.equal(parsed.warnings.length, 0);
});

test('parses sitemap indexes and resolves relative child URLs', () => {
  const parsed = SitemapXml.parse(`
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>/products.xml</loc><lastmod>2026-09-02</lastmod></sitemap>
  <sitemap><loc>https://cdn.example.net/images.xml</loc></sitemap>
</sitemapindex>`, 'https://example.com/sitemap-index.xml');
  assert.equal(parsed.type, 'sitemapindex');
  assert.deepEqual(parsed.entries, [
    { loc: 'https://example.com/products.xml', lastmod: '2026-09-02' },
    { loc: 'https://cdn.example.net/images.xml', lastmod: '' },
  ]);
});

test('decodes XML entities and CDATA in loc values', () => {
  const parsed = SitemapXml.parse(`
<urlset>
  <url><loc><![CDATA[https://example.com/search?a=1&b=2]]></loc></url>
  <url><loc>https://example.com/search?a=1&amp;b=3</loc></url>
</urlset>`, 'https://example.com/sitemap.xml');
  assert.equal(parsed.entries[0].loc, 'https://example.com/search?a=1&b=2');
  assert.equal(parsed.entries[1].loc, 'https://example.com/search?a=1&b=3');
});

test('findEntry ignores fragments and default ports but keeps URL semantics exact', () => {
  const parsed = SitemapXml.parse(`
<urlset>
  <url><loc>https://example.com:443/product?a=1</loc><lastmod>2026-09-03</lastmod></url>
</urlset>`, 'https://example.com/sitemap.xml');
  const found = SitemapXml.findEntry(parsed, 'https://example.com/product?a=1#details');
  assert.ok(found);
  assert.equal(found.lastmod, '2026-09-03');
  assert.equal(SitemapXml.findEntry(parsed, 'https://example.com/product?a=2'), null);
});

test('unknown sitemap root is reported without inventing entries', () => {
  const parsed = SitemapXml.parse('<html><body>not a sitemap</body></html>', 'https://example.com/sitemap.xml');
  assert.equal(parsed.type, 'unknown');
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.warnings.length, 1);
});

test('entries missing loc are skipped with warnings', () => {
  const parsed = SitemapXml.parse('<urlset><url><lastmod>2026-01-01</lastmod></url></urlset>', 'https://example.com/sitemap.xml');
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.warnings.length, 1);
});
