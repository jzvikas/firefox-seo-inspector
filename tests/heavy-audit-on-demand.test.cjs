'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function section(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing section start: ${start}`);
  assert.ok(to > from, `missing section end: ${end}`);
  return text.slice(from, to);
}

test('core page analysis excludes heavy performance content and security collectors', () => {
  const content = source('src/content/content.js');
  const core = section(content, 'async function analyzeDocument(', 'async function analyzeCurrentPage(');

  assert.doesNotMatch(core, /PerformanceAudit\.collect/);
  assert.doesNotMatch(core, /PerformanceHints\.collect/);
  assert.doesNotMatch(core, /AssetAudit\.collect/);
  assert.doesNotMatch(core, /ThirdPartyAudit\.collect/);
  assert.doesNotMatch(core, /ContentAudit\.collect/);
  assert.doesNotMatch(core, /SecurityAudit\.collect/);
  assert.match(core, /heavyAudit:\s*\{/);
  assert.match(core, /performance:\s*false/);
  assert.match(core, /content:\s*false/);
  assert.match(core, /security:\s*false/);
});

test('explicit heavy route owns expensive collectors and invalidates cache on document change', () => {
  const content = source('src/content/content.js');
  const heavy = section(content, 'async function analyzeHeavyCurrentPage(', 'function clearHighlights(');
  const mutation = section(content, 'function notifyPageChanged()', 'function setWatching(');

  assert.match(content, /message\.type === 'seoInspector\.analyzeHeavy'/);
  assert.match(heavy, /PerformanceAudit\.collect/);
  assert.match(heavy, /PerformanceHints\.collect/);
  assert.match(heavy, /AssetAudit\.collect/);
  assert.match(heavy, /ThirdPartyAudit\.collect/);
  assert.match(heavy, /ContentAudit\.collect/);
  assert.match(heavy, /SecurityAudit\.collect/);
  assert.match(mutation, /documentRevision \+= 1/);
  assert.match(mutation, /latestCoreReport = null/);
  assert.match(mutation, /heavyCache = null/);
});

test('explicit export snapshot and tab-compare workflows request the heavy data they promise', () => {
  const main = source('src/sidebar/sidebar-main.js');
  const snapshots = source('src/sidebar/sidebar-snapshots.js');
  const compare = source('src/sidebar/sidebar-page-compare.js');

  assert.match(main, /ensureHeavyAuditGroups\(\['performance', 'content', 'security'\]\)/);
  assert.match(snapshots, /async function currentRegressionSnapshot\(\)[\s\S]*?await ensureHeavyAuditGroups\(\['performance', 'security'\]\)/);
  assert.match(snapshots, /const snapshot = await currentRegressionSnapshot\(\)/);
  assert.match(compare, /await ensureHeavyAuditGroups\(\['security'\]\)/);
  assert.match(compare, /type: 'seoInspector\.analyzeHeavy', groups: \['security'\]/);
  assert.match(compare, /String\(targetHeavy\.url \|\| ''\) !== String\(targetReport\.facts\.url \|\| ''\)/);
});
