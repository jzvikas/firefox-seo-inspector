'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CrawlerLite = require('../src/lib/crawler-lite.js');

function report(url, overrides) {
  const extra = overrides || {};
  return {
    facts: Object.assign({
      url,
      title: 'Page title',
      description: 'Page description',
      headings: [{ level: 1, text: 'Page H1' }],
      canonical: { href: url },
      robots: [{ content: 'index,follow' }],
      links: [],
    }, extra.facts || {}),
    responseMeta: Object.assign({ statusCode: 200 }, extra.responseMeta || {}),
    evaluation: Object.assign({
      score: 100,
      issues: [],
      severityCounts: { critical: 0, warning: 0 },
      indexability: { verdict: 'Indexable' },
    }, extra.evaluation || {}),
    pageType: extra.pageType || {
      primary: 'category',
      label: 'Category / listing',
      confidence: 'high',
      traits: { faceted: false, pagination: false },
    },
  };
}

test('normalizes HTTP URLs and removes fragments while preserving query semantics', () => {
  assert.equal(CrawlerLite.normalizeUrl('/a?b=1#x', 'https://example.com/root'), 'https://example.com/a?b=1');
  assert.equal(CrawlerLite.normalizeUrl('mailto:test@example.com'), '');
});

test('same-host comparison ignores protocol and port but not subdomains', () => {
  assert.equal(CrawlerLite.sameHostname('http://example.com:8080/a', 'https://example.com/'), true);
  assert.equal(CrawlerLite.sameHostname('https://www.example.com/a', 'https://example.com/'), false);
});

test('crawl options are bounded to safe hard limits', () => {
  assert.deepEqual(CrawlerLite.normalizeOptions({ urlLimit: 9999, depthLimit: 20, sameHostnameOnly: false }), {
    urlLimit: 250,
    depthLimit: 3,
    sameHostnameOnly: false,
  });
  assert.deepEqual(CrawlerLite.normalizeOptions({}), { urlLimit: 100, depthLimit: 2, sameHostnameOnly: true });
});

test('discovery keeps unique HTTP links and same hostname by default', () => {
  const facts = {
    url: 'https://example.com/a',
    links: [
      { kind: 'http', href: 'https://example.com/b#x' },
      { kind: 'http', href: '/b' },
      { kind: 'http', href: 'https://other.example/b' },
      { kind: 'mailto', href: 'mailto:a@example.com' },
    ],
  };
  assert.deepEqual(CrawlerLite.discoverLinks(facts, 'https://example.com/', {}), ['https://example.com/b']);
});

test('discovery can include external hosts only when explicitly enabled', () => {
  const facts = { url: 'https://example.com/a', links: [{ kind: 'http', href: 'https://other.example/b' }] };
  assert.deepEqual(CrawlerLite.discoverLinks(facts, 'https://example.com/', { sameHostnameOnly: false }), ['https://other.example/b']);
});

test('next frontier deduplicates against previously seen URLs and respects remaining capacity', () => {
  const result = CrawlerLite.nextFrontier(['https://example.com/a#x', 'https://example.com/b', 'https://example.com/c'], new Set(['https://example.com/a']), 2);
  assert.deepEqual(result.urls, ['https://example.com/b', 'https://example.com/c']);
  assert.equal(result.seen.has('https://example.com/a'), true);
});

test('summarize records redirect SEO page-type fields and counts', () => {
  const resource = { requestedUrl: 'https://example.com/a', url: 'https://example.com/b', status: 200, redirected: true };
  const row = CrawlerLite.summarize(resource, report('https://example.com/b', {
    evaluation: { issues: [{ id: 'x', severity: 'warning' }], severityCounts: { warning: 1 }, score: 95, indexability: { verdict: 'Indexable' } },
    pageType: { primary: 'category', label: 'Category / listing', confidence: 'medium', traits: { faceted: true, pagination: true } },
  }), 1, 'https://example.com/');
  assert.equal(row.redirected, true);
  assert.equal(row.statusCode, 200);
  assert.equal(row.depth, 1);
  assert.equal(row.issueCount, 1);
  assert.equal(row.h1, 'Page H1');
  assert.equal(row.pageType, 'Category / listing');
  assert.equal(row.pageTypeConfidence, 'medium');
  assert.equal(row.pageTraits, 'Faceted · Pagination');
});

test('error rows preserve fetch state without inventing SEO or page-type facts', () => {
  const row = CrawlerLite.errorRow('https://example.com/a', 2, 'https://example.com/', { status: 0, error: 'timeout' });
  assert.equal(row.available, false);
  assert.equal(row.error, 'timeout');
  assert.equal(row.title, '');
  assert.equal(row.pageType, '');
  assert.equal(row.depth, 2);
});

test('duplicate annotation normalizes title description and H1 values independently', () => {
  const a = CrawlerLite.summarize({ requestedUrl: 'https://example.com/a', url: 'https://example.com/a', status: 200 }, report('https://example.com/a'), 0, '');
  const b = CrawlerLite.summarize({ requestedUrl: 'https://example.com/b', url: 'https://example.com/b', status: 200 }, report('https://example.com/b'), 1, 'https://example.com/a');
  b.description = 'Different';
  const result = CrawlerLite.annotateDuplicates([a, b]);
  assert.equal(result.rows.every((row) => row.duplicateTitle), true);
  assert.equal(result.rows.every((row) => row.duplicateH1), true);
  assert.equal(result.rows.some((row) => row.duplicateDescription), false);
});

test('filter and sort support error redirect duplicate issue page-type and text workflows', () => {
  const rows = [
    { url: 'https://example.com/a', available: true, statusCode: 200, redirected: true, issueCount: 1, duplicateTitle: true, duplicateDescription: false, duplicateH1: false, title: 'Alpha', description: '', h1: '', canonical: '', robots: '', pageType: 'Product', pageTraits: '', depth: 1 },
    { url: 'https://example.com/b', available: false, statusCode: 0, redirected: false, issueCount: 0, duplicateTitle: false, duplicateDescription: false, duplicateH1: false, title: 'Beta', description: '', h1: '', canonical: '', robots: '', pageType: 'Article / blog', pageTraits: '', depth: 0 },
  ];
  assert.equal(CrawlerLite.filterRows(rows, { query: 'product', redirectsOnly: true, duplicatesOnly: true, issuesOnly: true }).length, 1);
  assert.equal(CrawlerLite.filterRows(rows, { errorsOnly: true }).length, 1);
  assert.deepEqual(CrawlerLite.sortRows(rows, 'depth', 'asc').map((row) => row.url), ['https://example.com/b', 'https://example.com/a']);
  assert.deepEqual(CrawlerLite.sortRows(rows, 'pageType', 'asc').map((row) => row.url), ['https://example.com/b', 'https://example.com/a']);
});

test('CSV and JSON exports preserve crawl-specific and page-type fields', () => {
  const rows = [{ depth: 1, requestedUrl: 'https://example.com/a,b', url: 'https://example.com/a,b', statusCode: 200, pageType: 'Product', pageTypeConfidence: 'high', title: 'A "title"' }];
  const csv = CrawlerLite.toCsv(rows);
  assert.match(csv, /Page type,Page type confidence,Page traits/);
  assert.match(csv, /"https:\/\/example\.com\/a,b"/);
  assert.match(csv, /"A ""title"""/);
  const parsed = JSON.parse(CrawlerLite.toJson('https://example.com/', { urlLimit: 10, depthLimit: 1 }, rows, { titles: [] }));
  assert.equal(parsed.options.urlLimit, 10);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].pageType, 'Product');
});
