'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SitemapMembership = require('../src/lib/sitemap-membership.js');

const PAGE = 'https://example.com/product';
const CANONICAL = 'https://example.com/canonical-product';

test('normalizes fragments and default ports', () => {
  assert.equal(
    SitemapMembership.normalizeUrl('https://example.com:443/product#details'),
    PAGE,
  );
});

test('unique target list deduplicates a self canonical', () => {
  assert.deepEqual(SitemapMembership.uniqueTargets(PAGE, `${PAGE}#x`), [PAGE]);
  assert.deepEqual(SitemapMembership.uniqueTargets(PAGE, CANONICAL), [PAGE, CANONICAL]);
});

test('healthy self-canonical sitemap membership has no conflict', () => {
  const result = SitemapMembership.analyze({
    pageUrl: PAGE,
    canonicalUrl: PAGE,
    sourceFound: true,
    canonicalFound: true,
    verdict: 'Indexable',
    statusCode: 200,
    redirectHops: 0,
  });
  assert.equal(result.sourceIsCanonical, true);
  assert.deepEqual(result.issues, []);
});

test('non-canonical source URL in sitemap is warned', () => {
  const result = SitemapMembership.analyze({
    pageUrl: PAGE,
    canonicalUrl: CANONICAL,
    sourceFound: true,
    canonicalFound: true,
    verdict: 'Canonicalized',
    statusCode: 200,
  });
  assert.ok(result.issues.some((item) => item.code === 'noncanonical-source-in-sitemap'));
});

test('redirecting source URL in sitemap is warned', () => {
  const result = SitemapMembership.analyze({
    pageUrl: PAGE,
    canonicalUrl: PAGE,
    sourceFound: true,
    canonicalFound: true,
    verdict: 'Redirected',
    statusCode: 200,
    redirectHops: 2,
  });
  assert.ok(result.issues.some((item) => item.code === 'redirect-source-in-sitemap'));
});

test('noindex and robots-blocked source URLs in sitemap are warned', () => {
  const noindex = SitemapMembership.analyze({
    pageUrl: PAGE,
    canonicalUrl: PAGE,
    sourceFound: true,
    canonicalFound: true,
    verdict: 'Noindex',
    statusCode: 200,
  });
  const blocked = SitemapMembership.analyze({
    pageUrl: PAGE,
    canonicalUrl: PAGE,
    sourceFound: true,
    canonicalFound: true,
    verdict: 'Blocked',
    statusCode: 200,
  });
  assert.ok(noindex.issues.some((item) => item.code === 'nonindexable-source-in-sitemap'));
  assert.ok(blocked.issues.some((item) => item.code === 'nonindexable-source-in-sitemap'));
});

test('error source URL in sitemap is critical', () => {
  const result = SitemapMembership.analyze({
    pageUrl: PAGE,
    canonicalUrl: PAGE,
    sourceFound: true,
    canonicalFound: true,
    verdict: 'Error',
    statusCode: 404,
  });
  const problem = result.issues.find((item) => item.code === 'error-source-in-sitemap');
  assert.equal(problem.severity, 'critical');
  assert.equal(result.counts.critical, 1);
});

test('a source URL absent from sitemap does not invent conflict issues', () => {
  const result = SitemapMembership.analyze({
    pageUrl: PAGE,
    canonicalUrl: CANONICAL,
    sourceFound: false,
    canonicalFound: true,
    verdict: 'Canonicalized',
    statusCode: 200,
    redirectHops: 0,
  });
  assert.deepEqual(result.issues, []);
});
