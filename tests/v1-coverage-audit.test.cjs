'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'src', 'lib');
const TESTS = path.join(ROOT, 'tests');

function directTestFor(sourceFile) {
  return path.join(TESTS, `${path.basename(sourceFile, '.js')}.test.cjs`);
}

function assertDirectCoverage(sourceFile, expectedTestFile = directTestFor(sourceFile)) {
  assert.equal(fs.existsSync(sourceFile), true, `Expected source module ${path.relative(ROOT, sourceFile)}`);
  assert.equal(fs.existsSync(expectedTestFile), true, `Missing direct test ${path.relative(ROOT, expectedTestFile)}`);
  const testSource = fs.readFileSync(expectedTestFile, 'utf8');
  const sourceBase = path.basename(sourceFile);
  assert.match(testSource, new RegExp(sourceBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${path.relative(ROOT, expectedTestFile)} must load/reference ${sourceBase}`);
}

test('every audit-rule module has a direct automated test', () => {
  const auditModules = fs.readdirSync(LIB)
    .filter((name) => name.endsWith('-audit.js'))
    .sort();

  assert.ok(auditModules.length >= 8, 'Expected the shipped audit module set to be discovered');
  for (const name of auditModules) {
    assertDirectCoverage(path.join(LIB, name));
  }
});

test('release-critical redirect, indexability and network parsers have direct coverage', () => {
  const criticalModules = [
    'canonical-chain.js',
    'indexability.js',
    'robots.js',
    'sitemap.js',
    'sitemap-membership.js',
    'link-network.js',
    'image-network-utils.js',
    'page-compare.js',
  ];

  for (const name of criticalModules) {
    assertDirectCoverage(path.join(LIB, name));
  }
});

test('network cancellation/timeout behavior retains dedicated regression coverage', () => {
  const networkCancellationTest = path.join(TESTS, 'network-cancellation.test.cjs');
  assert.equal(fs.existsSync(networkCancellationTest), true, 'Missing dedicated network cancellation regression test');
  const source = fs.readFileSync(networkCancellationTest, 'utf8');
  assert.match(source, /cancel|abort/i);
  assert.match(source, /timeout/i);
});
