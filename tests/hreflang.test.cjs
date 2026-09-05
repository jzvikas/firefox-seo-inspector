'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const HreflangAudit = require('../src/lib/hreflang.js');

const CURRENT = 'https://example.com/lt/product';

function entries() {
  return [
    { lang: 'lt-LT', href: CURRENT },
    { lang: 'en-US', href: 'https://example.com/en/product' },
    { lang: 'x-default', href: 'https://example.com/product' },
  ];
}

function target(overrides = {}) {
  return Object.assign({
    requestedUrl: 'https://example.com/en/product',
    url: 'https://example.com/en/product',
    status: 200,
    statusText: 'OK',
    redirected: false,
    error: null,
    canonical: ['https://example.com/en/product'],
    hreflang: [
      { lang: 'lt-LT', href: CURRENT },
      { lang: 'en-US', href: 'https://example.com/en/product' },
    ],
    robots: [{ name: 'robots', content: 'index, follow' }],
    xRobotsTag: [],
    sizeBytes: 1200,
  }, overrides);
}

test('normalizes common language, region, script, and x-default tags', () => {
  assert.equal(HreflangAudit.normalizeTag('LT-lt'), 'lt-LT');
  assert.equal(HreflangAudit.normalizeTag('zh-hans-cn'), 'zh-Hans-CN');
  assert.equal(HreflangAudit.normalizeTag('X-DEFAULT'), 'x-default');
});

test('validates common hreflang tags and rejects malformed values', () => {
  for (const value of ['lt', 'lt-LT', 'en-US', 'zh-Hans', 'zh-Hans-CN', 'x-default']) {
    assert.equal(HreflangAudit.isValidTag(value), true, value);
  }
  for (const value of ['', 'english', 'e', 'en_US', 'en-UNITEDSTATES', 'x-default-extra']) {
    assert.equal(HreflangAudit.isValidTag(value), false, value);
  }
});

test('healthy local declarations include self reference and x-default', () => {
  const result = HreflangAudit.local(entries(), CURRENT);
  assert.equal(result.hasSelfReference, true);
  assert.equal(result.hasXDefault, true);
  assert.deepEqual(result.selfTags, ['lt-LT']);
  assert.equal(result.issues.length, 0);
});

test('missing self reference and x-default are reported', () => {
  const result = HreflangAudit.local([{ lang: 'en', href: 'https://example.com/en/product' }], CURRENT);
  assert.ok(result.issues.some((item) => item.code === 'missing-self'));
  assert.ok(result.issues.some((item) => item.code === 'missing-x-default'));
});

test('duplicate language tag pointing to multiple URLs is reported', () => {
  const result = HreflangAudit.local([
    { lang: 'en-US', href: 'https://example.com/en/a' },
    { lang: 'EN-us', href: 'https://example.com/en/b' },
  ], CURRENT);
  const issue = result.issues.find((item) => item.code === 'duplicate-tag');
  assert.ok(issue);
  assert.match(issue.message, /multiple URLs/);
});

test('reciprocal target with matching source language is OK', () => {
  const item = HreflangAudit.local(entries(), CURRENT).items[1];
  const result = HreflangAudit.targetResult(item, CURRENT, ['lt-LT'], target());
  assert.equal(result.reciprocal, true);
  assert.equal(result.level, 'ok');
  assert.deepEqual(result.problems, []);
});

test('missing reciprocal hreflang is a warning', () => {
  const item = HreflangAudit.local(entries(), CURRENT).items[1];
  const result = HreflangAudit.targetResult(item, CURRENT, ['lt-LT'], target({ hreflang: [] }));
  assert.equal(result.reciprocal, false);
  assert.equal(result.level, 'warning');
  assert.ok(result.problems.includes('missing reciprocal'));
});

test('redirecting target is reported as warning when otherwise healthy', () => {
  const item = HreflangAudit.local(entries(), CURRENT).items[1];
  const result = HreflangAudit.targetResult(item, CURRENT, ['lt-LT'], target({
    redirected: true,
    url: 'https://example.com/en/final',
    canonical: ['https://example.com/en/final'],
  }));
  assert.equal(result.redirected, true);
  assert.equal(result.level, 'warning');
  assert.ok(result.problems.includes('redirect'));
});

test('noindex target is critical', () => {
  const item = HreflangAudit.local(entries(), CURRENT).items[1];
  const result = HreflangAudit.targetResult(item, CURRENT, ['lt-LT'], target({
    robots: [{ name: 'robots', content: 'noindex, follow' }],
  }));
  assert.equal(result.noindex, true);
  assert.equal(result.level, 'critical');
  assert.ok(result.problems.includes('noindex'));
});

test('X-Robots-Tag noindex is treated as critical', () => {
  const item = HreflangAudit.local(entries(), CURRENT).items[1];
  const result = HreflangAudit.targetResult(item, CURRENT, ['lt-LT'], target({ xRobotsTag: ['noindex'] }));
  assert.equal(result.noindex, true);
  assert.equal(result.level, 'critical');
});

test('canonical mismatch is reported as warning', () => {
  const item = HreflangAudit.local(entries(), CURRENT).items[1];
  const result = HreflangAudit.targetResult(item, CURRENT, ['lt-LT'], target({ canonical: ['https://example.com/en/other'] }));
  assert.equal(result.canonicalMismatch, true);
  assert.equal(result.level, 'warning');
  assert.ok(result.problems.includes('canonical mismatch'));
});

test('HTTP error target is critical and analyze maps network results by requested URL', () => {
  const result = HreflangAudit.analyze(entries(), CURRENT, [
    target({ requestedUrl: CURRENT, url: CURRENT, canonical: [CURRENT], hreflang: entries() }),
    target({ status: 404, statusText: 'Not Found', hreflang: [] }),
    target({
      requestedUrl: 'https://example.com/product',
      url: 'https://example.com/product',
      canonical: ['https://example.com/product'],
      hreflang: [{ lang: 'lt-LT', href: CURRENT }],
    }),
  ]);
  assert.equal(result.targets[1].status, 404);
  assert.equal(result.targets[1].level, 'critical');
  assert.ok(result.targets[1].problems.includes('HTTP 404'));
  assert.equal(result.counts.total, 3);
});
