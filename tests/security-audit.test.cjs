'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SecurityAudit = require('../src/lib/security-audit.js');

test('parses HSTS max-age and optional flags', () => {
  assert.deepEqual(SecurityAudit.parseHsts('max-age=31536000; includeSubDomains; preload'), {
    value: 'max-age=31536000; includeSubDomains; preload',
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  });
});

test('parses CSP directives and recognizes frame-ancestors', () => {
  const csp = "default-src 'self'; frame-ancestors 'none'; script-src 'self'";
  assert.deepEqual(SecurityAudit.parseCsp(csp)['frame-ancestors'], ["'none'"]);
  assert.equal(SecurityAudit.hasFrameAncestors(csp), true);
});

test('CSP script risks identify broad unsafe-eval and wildcard tokens', () => {
  assert.deepEqual(SecurityAudit.cspScriptRisks("script-src 'self' 'unsafe-eval' *"), ["'unsafe-eval'", '*']);
  assert.deepEqual(SecurityAudit.cspScriptRisks("script-src 'self'"), []);
});

test('healthy HTTPS security headers produce no warning issues', () => {
  const result = SecurityAudit.analyzeHeaders({
    contentSecurityPolicy: ["default-src 'self'; frame-ancestors 'none'"],
    strictTransportSecurity: ['max-age=31536000; includeSubDomains'],
    xFrameOptions: [],
    referrerPolicy: ['strict-origin-when-cross-origin'],
    permissionsPolicy: ['geolocation=()'],
    xContentTypeOptions: ['nosniff'],
  }, 'https://example.test/');
  assert.equal(result.issues.length, 0);
  assert.equal(result.rows.find((item) => item.key === 'xfo').state, 'covered');
});

test('report-only CSP does not count as an enforced policy', () => {
  const result = SecurityAudit.analyzeHeaders({
    contentSecurityPolicy: [],
    contentSecurityPolicyReportOnly: ["default-src 'self'"],
  }, 'https://example.test/');
  assert.equal(result.issues.some((item) => item.code === 'missing-csp'), true);
  assert.match(result.rows.find((item) => item.key === 'csp').detail, /report-only/i);
});

test('HSTS is not treated as missing on an HTTP page', () => {
  const result = SecurityAudit.analyzeHeaders({}, 'http://example.test/');
  assert.equal(result.issues.some((item) => item.code === 'missing-hsts'), false);
  assert.equal(result.rows.find((item) => item.key === 'hsts').state, 'not-applicable');
});

test('missing frame protection is warned when neither XFO nor frame-ancestors exists', () => {
  const result = SecurityAudit.analyzeHeaders({ contentSecurityPolicy: ["default-src 'self'"] }, 'https://example.test/');
  assert.equal(result.issues.some((item) => item.code === 'missing-frame-protection'), true);
});

test('invalid nosniff and unsafe referrer policy are reported', () => {
  const result = SecurityAudit.analyzeHeaders({
    contentSecurityPolicy: ["default-src 'self'; frame-ancestors 'self'"],
    strictTransportSecurity: ['max-age=1000'],
    referrerPolicy: ['unsafe-url'],
    xContentTypeOptions: ['sniff'],
  }, 'https://example.test/');
  assert.equal(result.issues.some((item) => item.code === 'unsafe-referrer-policy'), true);
  assert.equal(result.issues.some((item) => item.code === 'invalid-nosniff'), true);
});

test('srcset parser extracts URL tokens without descriptors', () => {
  assert.deepEqual(SecurityAudit.srcsetUrls('/a.jpg 1x, /b.jpg 2x, /c.jpg 640w'), ['/a.jpg', '/b.jpg', '/c.jpg']);
});

test('mixed resource analysis only flags HTTP resources on HTTPS pages', () => {
  const candidates = [
    { url: 'http://cdn.test/app.js', kind: 'javascript', active: true },
    { url: 'http://cdn.test/photo.jpg', kind: 'image', active: false },
    { url: 'https://cdn.test/ok.css', kind: 'css', active: true },
  ];
  const result = SecurityAudit.analyzeMixedResources('https://example.test/', candidates);
  assert.equal(result.total, 2);
  assert.equal(result.active, 1);
  assert.equal(result.passive, 1);
  assert.equal(SecurityAudit.analyzeMixedResources('http://example.test/', candidates).total, 0);
});

test('mixed resource analysis deduplicates the same URL and kind', () => {
  const item = { url: 'http://cdn.test/a.js', kind: 'javascript', active: true };
  const result = SecurityAudit.analyzeMixedResources('https://example.test/', [item, item]);
  assert.equal(result.total, 1);
});

test('third-party script inventory reuses asset audit metadata only', () => {
  const result = SecurityAudit.thirdPartyScripts({ scripts: [
    { external: true, thirdParty: true, host: 'cdn.test', url: 'https://cdn.test/a.js' },
    { external: true, thirdParty: false, host: 'example.test', url: 'https://example.test/a.js' },
    { external: false, thirdParty: false, host: '', url: '' },
  ] });
  assert.equal(result.count, 1);
  assert.deepEqual(result.hosts, ['cdn.test']);
});

test('collect reports insecure transport and mixed content with severity', () => {
  const insecure = SecurityAudit.collect(null, { pageUrl: 'http://example.test/', responseMeta: {} });
  assert.equal(insecure.issues[0].code, 'page-not-https');

  const mixed = SecurityAudit.collect(null, {
    pageUrl: 'https://example.test/',
    responseMeta: {
      contentSecurityPolicy: ["default-src 'self'; frame-ancestors 'none'"],
      strictTransportSecurity: ['max-age=1000'],
      referrerPolicy: ['no-referrer'],
      permissionsPolicy: ['geolocation=()'],
      xContentTypeOptions: ['nosniff'],
    },
    performance: { resources: [{ url: 'http://cdn.test/app.js', kind: 'javascript' }] },
  });
  assert.equal(mixed.issues.some((item) => item.code === 'active-mixed-content' && item.severity === 'critical'), true);
});
