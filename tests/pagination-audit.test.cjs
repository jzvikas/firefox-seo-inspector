'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaginationAudit = require('../src/lib/pagination-audit.js');

test('pageSignal recognizes query and path pagination without inventing offset page numbers', () => {
  assert.deepEqual(PaginationAudit.pageSignal('https://example.test/shoes?page=3'), { detected: true, number: 3, source: 'page', raw: '3' });
  assert.deepEqual(PaginationAudit.pageSignal('https://example.test/shoes/page/4/'), { detected: true, number: 4, source: 'path', raw: '4' });
  assert.deepEqual(PaginationAudit.pageSignal('https://example.test/shoes?offset=24'), { detected: true, number: null, source: 'offset', raw: '24' });
  assert.equal(PaginationAudit.pageSignal('https://example.test/shoes').detected, false);
});

test('familyKey strips only pagination while preserving facet semantics and normalizing query order', () => {
  assert.equal(
    PaginationAudit.familyKey('https://example.test/shoes?page=2&color=black&sort=price'),
    'https://example.test/shoes?color=black&sort=price',
  );
  assert.equal(
    PaginationAudit.familyKey('https://example.test/shoes/page/3/?sort=price&color=black'),
    'https://example.test/shoes?color=black&sort=price',
  );
  assert.notEqual(
    PaginationAudit.familyKey('https://example.test/shoes?page=2&color=black'),
    PaginationAudit.familyKey('https://example.test/shoes?page=2&color=red'),
  );
});

test('pagination duplicate groups only compare distinct URLs in the same pagination family', () => {
  const rows = [
    { url: 'https://example.test/shoes', title: 'Shoes', description: 'Browse shoes', available: true, tabId: 1 },
    { url: 'https://example.test/shoes?page=2', title: 'Shoes', description: 'Browse shoes', available: true, tabId: 2 },
    { url: 'https://example.test/shoes?page=3', title: 'Shoes page 3', description: 'Browse shoes', available: true, tabId: 3 },
    { url: 'https://example.test/hats?page=2', title: 'Shoes', description: 'Browse shoes', available: true, tabId: 4 },
  ];
  const titles = PaginationAudit.duplicateGroups(rows, 'title');
  const descriptions = PaginationAudit.duplicateGroups(rows, 'description');
  assert.equal(titles.length, 1);
  assert.deepEqual(titles[0].urls, ['https://example.test/shoes', 'https://example.test/shoes?page=2']);
  assert.equal(descriptions.length, 1);
  assert.equal(descriptions[0].count, 3);
});

test('annotateRows marks pagination metadata duplicates independently', () => {
  const result = PaginationAudit.annotateRows([
    { url: 'https://example.test/cat', title: 'Same', description: 'D1', available: true },
    { url: 'https://example.test/cat?page=2', title: 'Same', description: 'D2', available: true },
    { url: 'https://example.test/other', title: 'Same', description: 'D1', available: true },
  ]);
  assert.equal(result.rows[0].duplicatePaginationTitle, true);
  assert.equal(result.rows[1].duplicatePaginationTitle, true);
  assert.equal(result.rows[2].duplicatePaginationTitle, false);
  assert.equal(result.descriptions.length, 0);
});

test('pagination network summary classifies broken redirects unknown and exposes bounded refs', () => {
  const links = [
    { href: 'https://example.test/cat?page=2', label: '2', ref: { selector: 'a', index: 0 } },
    { href: 'https://example.test/cat?page=3', label: '3', ref: { selector: 'a', index: 1 } },
    { href: 'https://example.test/cat?page=4', label: '4', ref: { selector: 'a', index: 2 } },
  ];
  const report = PaginationAudit.summarizeLinkResults(links, [
    { url: links[0].href, status: 404, finalUrl: links[0].href, redirected: false, error: null },
    { url: links[1].href, status: 200, finalUrl: 'https://example.test/cat?page=30', redirected: true, error: null },
    { url: links[2].href, status: 0, finalUrl: links[2].href, redirected: false, error: 'timeout' },
  ]);
  assert.equal(report.checked, 3);
  assert.equal(report.broken, 1);
  assert.equal(report.redirect, 1);
  assert.equal(report.unknown, 1);
  assert.deepEqual(report.brokenRefs, [{ selector: 'a', index: 0 }]);
});
