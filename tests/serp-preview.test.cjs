'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SerpPreview = require('../src/lib/serp-preview.js');

test('normalizes whitespace before measuring text', () => {
  assert.equal(SerpPreview.safeText('  Hello\n  world  '), 'Hello world');
});

test('wide characters measure wider than narrow characters', () => {
  const wide = SerpPreview.estimateTextWidth('MMMMMMMMMM', 20);
  const narrow = SerpPreview.estimateTextWidth('iiiiiiiiii', 20);
  assert.ok(wide > narrow * 2);
});

test('short desktop title fits the configured preview width', () => {
  const result = SerpPreview.analyze({
    title: 'Useful product page title',
    description: 'A concise description for the search result preview.',
    url: 'https://example.com/products/widget',
  }, 'desktop');
  assert.equal(result.title.truncated, false);
  assert.equal(result.title.missing, false);
  assert.equal(result.warnings.length, 0);
});

test('very long title is reported as likely truncated', () => {
  const result = SerpPreview.analyze({
    title: 'Very long search result title '.repeat(8),
    description: 'Short description.',
    url: 'https://example.com/page',
  }, 'desktop');
  assert.equal(result.title.truncated, true);
  assert.ok(result.title.overflowPx > 0);
  assert.ok(result.warnings.some((item) => item.code === 'title-truncated'));
});

test('very long description exceeds the estimated line capacity', () => {
  const result = SerpPreview.analyze({
    title: 'Normal title',
    description: 'Long descriptive copy '.repeat(80),
    url: 'https://example.com/page',
  }, 'mobile');
  assert.equal(result.description.truncated, true);
  assert.ok(result.description.estimatedLines > result.description.lines);
  assert.ok(result.warnings.some((item) => item.code === 'description-truncated'));
});

test('missing title and description generate explicit warnings', () => {
  const result = SerpPreview.analyze({ url: 'https://example.com/' }, 'desktop');
  assert.equal(result.title.missing, true);
  assert.equal(result.description.missing, true);
  assert.deepEqual(result.warnings.map((item) => item.code), ['title-missing', 'description-missing']);
});

test('URL presentation decodes path segments and limits breadcrumb depth', () => {
  const value = SerpPreview.urlPresentation('https://example.com/shop/%C5%A1lepet%C4%97s/juodos/details?size=42#reviews');
  assert.equal(value.host, 'example.com');
  assert.equal(value.path, '/shop/%C5%A1lepet%C4%97s/juodos/details?size=42');
  assert.equal(value.breadcrumb, 'example.com › shop › šlepetės › juodos');
});

test('unknown device falls back to desktop profile', () => {
  const result = SerpPreview.analyze({ title: 'Title', description: 'Description', url: 'https://example.com/' }, 'tablet');
  assert.equal(result.device, 'desktop');
  assert.equal(result.profile.titleMaxPx, SerpPreview.PROFILES.desktop.titleMaxPx);
});
