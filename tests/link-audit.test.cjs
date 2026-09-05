'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const LinkAudit = require('../src/lib/link-audit.js');

test('normalizes anchor labels for comparisons', () => {
  assert.equal(LinkAudit.normalizeLabel('  Read   More  '), 'read more');
  assert.equal(LinkAudit.normalizeLabel(''), '');
});

test('generic anchor detection is exact after normalization', () => {
  assert.equal(LinkAudit.isGenericAnchor('CLICK HERE'), true);
  assert.equal(LinkAudit.isGenericAnchor('Read more'), true);
  assert.equal(LinkAudit.isGenericAnchor('Read more about shipping'), false);
  assert.equal(LinkAudit.isGenericAnchor(''), false);
});

test('same anchor text pointing to different URLs is grouped', () => {
  const groups = LinkAudit.groupByLabel([
    { kind: 'http', href: 'https://example.com/a', label: 'Details' },
    { kind: 'http', href: 'https://example.com/b', label: ' details ' },
    { kind: 'http', href: 'https://example.com/a#top', label: 'Details' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'details');
  assert.deepEqual(groups[0].urls, ['https://example.com/a', 'https://example.com/b']);
});

test('different anchor text pointing to the same URL is grouped', () => {
  const groups = LinkAudit.groupByUrl([
    { kind: 'http', href: 'https://example.com/a', label: 'Alpha' },
    { kind: 'http', href: 'https://example.com/a#top', label: 'Beta' },
    { kind: 'http', href: 'https://example.com/a', label: ' alpha ' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].url, 'https://example.com/a');
  assert.deepEqual(groups[0].labels, ['alpha', 'beta']);
});

test('analysis reports generic, empty, and anchor consistency groups', () => {
  const report = LinkAudit.analyze([
    { kind: 'http', href: 'https://example.com/a', label: 'Click here' },
    { kind: 'http', href: 'https://example.com/b', label: 'Click here' },
    { kind: 'http', href: 'https://example.com/a', label: 'Product A' },
    { kind: 'http', href: 'https://example.com/c', label: '' },
    { kind: 'mailto', href: 'mailto:test@example.com', label: 'Email' },
  ]);
  assert.equal(report.totalHttp, 4);
  assert.equal(report.generic.length, 2);
  assert.equal(report.empty.length, 1);
  assert.equal(report.sameAnchorDifferentUrls.length, 1);
  assert.equal(report.differentAnchorsSameUrl.length, 1);
});

test('filters external and rel-based link states without network results', () => {
  const links = [
    { kind: 'http', href: 'https://example.com/a', internal: true, nofollow: false, sponsored: false, ugc: false },
    { kind: 'http', href: 'https://other.test/b', internal: false, nofollow: true, sponsored: true, ugc: true },
  ];
  assert.equal(LinkAudit.filterLinks(links, new Map(), 'external').length, 1);
  assert.equal(LinkAudit.filterLinks(links, new Map(), 'nofollow').length, 1);
  assert.equal(LinkAudit.filterLinks(links, new Map(), 'sponsored').length, 1);
  assert.equal(LinkAudit.filterLinks(links, new Map(), 'ugc').length, 1);
});

test('broken and redirecting filters use normalized result URLs', () => {
  const links = [
    { kind: 'http', href: 'https://example.com:443/a#x', internal: true },
    { kind: 'http', href: 'https://example.com/b', internal: true },
  ];
  const results = new Map([
    ['https://example.com/a', { status: 404, error: null, redirected: false }],
    ['https://example.com/b', { status: 200, error: null, redirected: true }],
  ]);
  assert.equal(LinkAudit.filterLinks(links, results, 'broken').length, 1);
  assert.equal(LinkAudit.filterLinks(links, results, 'redirecting').length, 1);
});

test('generic filter returns only HTTP generic anchors', () => {
  const links = [
    { kind: 'http', href: 'https://example.com/a', label: 'Read more' },
    { kind: 'http', href: 'https://example.com/b', label: 'Product details' },
    { kind: 'mailto', href: 'mailto:test@example.com', label: 'Read more' },
  ];
  assert.equal(LinkAudit.filterLinks(links, new Map(), 'generic').length, 1);
});
