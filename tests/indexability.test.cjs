'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Indexability = require('../src/lib/indexability.js');

function facts(overrides = {}) {
  return Object.assign({
    url: 'https://example.com/products/widget',
    canonical: { count: 1, href: 'https://example.com/products/widget' },
    robots: [{ name: 'robots', content: 'index, follow' }],
  }, overrides);
}

function response(overrides = {}) {
  return Object.assign({
    url: 'https://example.com/products/widget',
    statusCode: 200,
    statusLine: 'HTTP/2 200',
    xRobotsTag: [],
    redirectChain: [],
  }, overrides);
}

test('healthy page is indexable', () => {
  const result = Indexability.analyze(facts(), response());
  assert.equal(result.verdict, 'Indexable');
  assert.equal(result.indexable, true);
  assert.equal(result.reasons[0].code, 'indexable');
});

test('meta noindex produces Noindex verdict', () => {
  const result = Indexability.analyze(facts({ robots: [{ name: 'robots', content: 'noindex, follow' }] }), response());
  assert.equal(result.verdict, 'Noindex');
  assert.equal(result.indexable, false);
  assert.ok(result.reasons.some((item) => item.code === 'robots.meta.noindex'));
});

test('X-Robots-Tag noindex produces Noindex verdict', () => {
  const result = Indexability.analyze(facts(), response({ xRobotsTag: ['noindex, nofollow'] }));
  assert.equal(result.verdict, 'Noindex');
  assert.ok(result.reasons.some((item) => item.code === 'robots.header.noindex'));
});

test('explicit index plus noindex is reported as a conflict', () => {
  const result = Indexability.analyze(
    facts({ robots: [{ name: 'robots', content: 'index, noindex, follow' }] }),
    response(),
  );
  assert.equal(result.verdict, 'Noindex');
  assert.equal(result.directives.conflict, true);
  assert.ok(result.reasons.some((item) => item.code === 'robots.conflict'));
});

test('HTTP error has highest-priority Error verdict', () => {
  const result = Indexability.analyze(
    facts({ robots: [{ name: 'robots', content: 'noindex' }] }),
    response({ statusCode: 404, statusLine: 'HTTP/2 404' }),
  );
  assert.equal(result.verdict, 'Error');
  assert.ok(result.reasons.some((item) => item.code === 'http.error'));
});

test('different canonical produces Canonicalized verdict and mismatch diagnostics', () => {
  const result = Indexability.analyze(
    facts({ canonical: { count: 1, href: 'http://other.example.net/products/widget/?color=red' } }),
    response(),
  );
  assert.equal(result.verdict, 'Canonicalized');
  assert.equal(result.canonical.different, true);
  assert.equal(result.canonical.diagnostics.crossDomain, true);
  assert.equal(result.canonical.diagnostics.protocolMismatch, true);
  assert.equal(result.canonical.diagnostics.hostnameMismatch, true);
  assert.equal(result.canonical.diagnostics.queryMismatch, true);
});

test('navigation redirect chain produces Redirected verdict and hop diagnostics', () => {
  const chain = [
    { from: 'http://example.com/a', to: 'https://example.com/a', statusCode: 301 },
    { from: 'https://example.com/a', to: 'https://example.com/products/widget', statusCode: 302 },
  ];
  const result = Indexability.analyze(facts(), response({ initialUrl: 'http://example.com/a', redirectChain: chain }));
  assert.equal(result.verdict, 'Redirected');
  assert.equal(result.redirectDiagnostics.hopCount, 2);
  assert.equal(result.redirectDiagnostics.loop, false);
  assert.equal(result.redirectDiagnostics.excessive, false);
});

test('redirect loops and excessive chains are detected', () => {
  const chain = [
    { from: 'https://example.com/a', to: 'https://example.com/b', statusCode: 301 },
    { from: 'https://example.com/b', to: 'https://example.com/c', statusCode: 302 },
    { from: 'https://example.com/c', to: 'https://example.com/d', statusCode: 307 },
    { from: 'https://example.com/d', to: 'https://example.com/e', statusCode: 308 },
    { from: 'https://example.com/e', to: 'https://example.com/f', statusCode: 301 },
    { from: 'https://example.com/f', to: 'https://example.com/a', statusCode: 302 },
  ];
  const result = Indexability.analyze(facts(), response({ redirectChain: chain }));
  assert.equal(result.redirectDiagnostics.loop, true);
  assert.equal(result.redirectDiagnostics.excessive, true);
  assert.ok(result.reasons.some((item) => item.code === 'redirect.loop'));
  assert.ok(result.reasons.some((item) => item.code === 'redirect.excessive'));
});

test('robots.txt blocked state is supported by the indexability engine', () => {
  const result = Indexability.analyze(facts(), response(), { robotsTxt: { blocked: true, rule: 'Disallow: /products/' } });
  assert.equal(result.verdict, 'Blocked');
  assert.ok(result.reasons.some((item) => item.code === 'robots.blocked'));
});

test('raw versus rendered indexability diff reports meaningful changes', () => {
  const rendered = Indexability.analyze(facts({ robots: [{ name: 'robots', content: 'noindex' }] }), response());
  const raw = Indexability.analyze(facts(), response());
  const changes = Indexability.diff(rendered, raw);
  assert.deepEqual(changes.map((item) => item.field), ['Verdict', 'Meta directives']);
});
