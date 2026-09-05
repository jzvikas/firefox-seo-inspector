'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('large issue and heading inventories render in bounded 100-item batches', () => {
  const source = read('src/sidebar/sidebar-base.js');
  assert.match(source, /const SIMPLE_RENDER_BATCH = 100;/);
  assert.match(source, /const SIMPLE_RENDER_MAX = 500;/);
  assert.match(source, /items\.slice\(0, renderLimit\)/);
  assert.match(source, /headings\.slice\(0, renderLimit\)/);
  assert.match(source, /Show next \$\{next\} \$\{label\}/);
  assert.match(source, /resetSimpleInventoryLimits\(\);/);
});

test('links render progressively and live scan progress avoids frequent full table rebuilds', () => {
  const source = read('src/sidebar/sidebar-links-network.js');
  assert.match(source, /const LINK_RENDER_BATCH = 100;/);
  assert.match(source, /const LINK_RENDER_MAX = 500;/);
  assert.match(source, /visibleLimit: LINK_RENDER_BATCH/);
  assert.match(source, /filteredLinks\.slice\(0, renderLimit\)/);
  assert.match(source, /Show next \$\{next\} links/);
  assert.match(source, /progressChecked % 25 === 0/);
  assert.doesNotMatch(source, /filteredLinks\.slice\(0, 500\)/);
});

test('image inventory renders progressively without truncating analysis state', () => {
  const source = read('src/sidebar/sidebar-images-network.js');
  assert.match(source, /const IMAGE_RENDER_BATCH = 100;/);
  assert.match(source, /const IMAGE_RENDER_MAX = 500;/);
  assert.match(source, /visibleLimit: IMAGE_RENDER_BATCH/);
  assert.match(source, /rows\.slice\(0, renderLimit\)/);
  assert.match(source, /Show next \$\{next\} images/);
  assert.doesNotMatch(source, /analysis\.rows\s*=/);
  assert.doesNotMatch(source, /facts\.images\s*=/);
});

test('Resource Timing inventory renders in bounded batches while preserving report data', () => {
  const source = read('src/sidebar/sidebar-performance.js');
  assert.match(source, /const PERFORMANCE_RESOURCE_BATCH = 100;/);
  assert.match(source, /const PERFORMANCE_RESOURCE_MAX = 500;/);
  assert.match(source, /resources\.slice\(0, renderLimit\)/);
  assert.match(source, /Show next \$\{next\} resources/);
  assert.match(source, /renderPanel\('performance', \{ force: true \}\)/);
  assert.doesNotMatch(source, /report\.resources\s*=/);
});

test('JavaScript and stylesheet inventories use 100-row progressive rendering under the existing 300-row UI cap', () => {
  const source = read('src/sidebar/sidebar-assets.js');
  assert.match(source, /const ASSET_RENDER_BATCH = 100;/);
  assert.match(source, /const ASSET_RENDER_MAX = 300;/);
  assert.match(source, /scripts\.slice\(0, scriptLimit\)/);
  assert.match(source, /stylesheets\.slice\(0, stylesheetLimit\)/);
  assert.match(source, /Show next \$\{next\} \$\{label\}/);
  assert.doesNotMatch(source, /report\.scripts\s*=/);
  assert.doesNotMatch(source, /report\.stylesheets\s*=/);
});

test('third-party host rendering is progressive and bounded independently from collected groups', () => {
  const source = read('src/sidebar/sidebar-third-party.js');
  assert.match(source, /const THIRD_PARTY_RENDER_BATCH = 100;/);
  assert.match(source, /const THIRD_PARTY_RENDER_MAX = 200;/);
  assert.match(source, /groups\.slice\(0, renderLimit\)/);
  assert.match(source, /Show next \$\{next\} third-party hosts/);
  assert.doesNotMatch(source, /report\.groups\s*=/);
});
