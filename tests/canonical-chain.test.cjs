'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalChain = require('../src/lib/canonical-chain.js');

const A = 'https://example.com/a';
const B = 'https://example.com/b';
const C = 'https://example.com/c';

function level(overrides = {}) {
  return Object.assign({
    requestedUrl: B,
    finalUrl: B,
    status: 200,
    statusText: 'OK',
    redirected: false,
    redirects: [],
    canonical: [B],
    error: null,
  }, overrides);
}

test('normalizes fragments and default ports', () => {
  assert.equal(CanonicalChain.normalizeUrl('https://example.com:443/a#x'), A);
});

test('single canonical target that self-canonicalizes is stable', () => {
  const result = CanonicalChain.analyze({ pageUrl: A, initialCanonical: B, levels: [level()] });
  assert.equal(result.stable, true);
  assert.equal(result.multiHop, false);
  assert.equal(result.canonicalLoop, false);
  assert.deepEqual(result.path, [A, B]);
  assert.equal(result.counts.canonicalHops, 1);
});

test('self-referencing source canonical is not classified as a loop', () => {
  const result = CanonicalChain.analyze({
    pageUrl: A,
    initialCanonical: A,
    levels: [level({ requestedUrl: A, finalUrl: A, canonical: [A] })],
  });
  assert.equal(result.canonicalLoop, false);
  assert.equal(result.stable, true);
  assert.deepEqual(result.path, [A]);
});

test('multi-hop canonical chain is reported as a warning', () => {
  const result = CanonicalChain.analyze({
    pageUrl: A,
    initialCanonical: B,
    levels: [
      level({ canonical: [C] }),
      level({ requestedUrl: C, finalUrl: C, canonical: [C] }),
    ],
  });
  assert.equal(result.multiHop, true);
  assert.equal(result.stable, true);
  assert.deepEqual(result.path, [A, B, C]);
  assert.ok(result.issues.some((item) => item.code === 'multi-hop-canonical'));
});

test('canonical cycle back to source is critical', () => {
  const result = CanonicalChain.analyze({
    pageUrl: A,
    initialCanonical: B,
    levels: [level({ canonical: [A] })],
    loop: true,
  });
  assert.equal(result.canonicalLoop, true);
  assert.ok(result.issues.some((item) => item.code === 'canonical-loop' && item.severity === 'critical'));
});

test('canonical cycle between target pages is detected from path', () => {
  const result = CanonicalChain.analyze({
    pageUrl: A,
    initialCanonical: B,
    levels: [
      level({ canonical: [C] }),
      level({ requestedUrl: C, finalUrl: C, canonical: [B] }),
    ],
  });
  assert.equal(result.canonicalLoop, true);
  assert.deepEqual(result.path, [A, B, C, B]);
});

test('4xx canonical target is critical', () => {
  const result = CanonicalChain.analyze({ pageUrl: A, initialCanonical: B, levels: [level({ status: 404, statusText: 'Not Found', canonical: [] })] });
  assert.equal(result.finalStatus, 404);
  assert.ok(result.issues.some((item) => item.code === 'http-4xx'));
  assert.equal(result.counts.critical, 1);
});

test('5xx canonical target is critical', () => {
  const result = CanonicalChain.analyze({ pageUrl: A, initialCanonical: B, levels: [level({ status: 503, canonical: [] })] });
  assert.ok(result.issues.some((item) => item.code === 'http-5xx'));
});

test('redirected canonical target keeps exact redirect hop statuses', () => {
  const result = CanonicalChain.analyze({
    pageUrl: A,
    initialCanonical: B,
    levels: [level({
      finalUrl: C,
      redirected: true,
      redirects: [
        { from: B, to: 'https://example.com/b2', statusCode: 301 },
        { from: 'https://example.com/b2', to: C, statusCode: 308 },
      ],
      canonical: [C],
    })],
  });
  assert.equal(result.redirected, true);
  assert.equal(result.counts.redirectHops, 2);
  assert.deepEqual(result.redirects.map((item) => item.statusCode), [301, 308]);
  assert.ok(result.issues.some((item) => item.code === 'canonical-redirect'));
});

test('redirect loop is detected from repeated redirect URL', () => {
  const hops = [
    { from: B, to: C, statusCode: 301 },
    { from: C, to: B, statusCode: 302 },
  ];
  assert.equal(CanonicalChain.redirectLoop(hops), true);
  const result = CanonicalChain.analyze({
    pageUrl: A,
    initialCanonical: B,
    levels: [level({ status: 0, error: 'NS_ERROR_REDIRECT_LOOP', redirects: hops, canonical: [] })],
  });
  assert.equal(result.redirectLoop, true);
  assert.ok(result.issues.some((item) => item.code === 'redirect-loop'));
});

test('multiple canonicals on target page are warned', () => {
  const result = CanonicalChain.analyze({
    pageUrl: A,
    initialCanonical: B,
    levels: [level({ canonical: [B, C] })],
  });
  assert.ok(result.issues.some((item) => item.code === 'multiple-canonical'));
});

test('depth cap, timeout, cancellation, and network failures are surfaced', () => {
  const capped = CanonicalChain.analyze({ pageUrl: A, initialCanonical: B, levels: [level()], capped: true });
  assert.ok(capped.issues.some((item) => item.code === 'canonical-cap'));

  const timed = CanonicalChain.analyze({ pageUrl: A, initialCanonical: B, levels: [], timedOut: true });
  assert.ok(timed.issues.some((item) => item.code === 'scan-timeout' && item.severity === 'critical'));

  const cancelled = CanonicalChain.analyze({ pageUrl: A, initialCanonical: B, levels: [], cancelled: true });
  assert.ok(cancelled.issues.some((item) => item.code === 'scan-cancelled'));

  const failed = CanonicalChain.analyze({ pageUrl: A, initialCanonical: B, levels: [level({ status: 0, error: 'timeout', canonical: [] })] });
  assert.ok(failed.issues.some((item) => item.code === 'network-error'));
});
