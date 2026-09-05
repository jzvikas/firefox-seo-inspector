'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('background loads storage schema dependencies in a deterministic order', () => {
  const manifest = JSON.parse(read('src/manifest.json'));
  const scripts = manifest.background.scripts;
  const rules = scripts.indexOf('lib/custom-rules.js');
  const profiles = scripts.indexOf('lib/domain-profiles.js');
  const snapshots = scripts.indexOf('lib/snapshot-history.js');
  const schema = scripts.indexOf('lib/storage-schema.js');
  const runner = scripts.indexOf('background/storage-background.js');
  assert.ok(rules >= 0);
  assert.ok(profiles > rules);
  assert.ok(snapshots > profiles);
  assert.ok(schema > snapshots);
  assert.ok(runner > schema);
  assert.deepEqual(manifest.permissions.slice().sort(), ['scripting', 'storage', 'tabs', 'webRequest']);
});

test('content audit policy waits for the storage schema before reading Rules and Profiles', () => {
  const content = read('src/content/content.js');
  const ensure = content.indexOf("type: 'seoInspector.ensureStorageSchema'");
  const readStorage = content.indexOf('browser.storage.local.get([CustomRules.STORAGE_KEY, DomainProfiles.STORAGE_KEY])');
  assert.ok(ensure >= 0);
  assert.ok(readStorage > ensure);
});

test('sidebar storage gate loads after base state and before UI modules that write local data', () => {
  const html = read('src/sidebar/sidebar.html');
  const base = html.indexOf('sidebar-base.js');
  const storage = html.indexOf('sidebar-storage.js');
  const detached = html.indexOf('sidebar-detached-target.js');
  const snapshots = html.indexOf('sidebar-snapshots.js');
  const rules = html.indexOf('sidebar-rules.js');
  const profiles = html.indexOf('sidebar-profiles.js');
  const main = html.indexOf('sidebar-main.js');
  assert.ok(base >= 0 && storage > base);
  assert.ok(detached > storage);
  assert.ok(snapshots > storage);
  assert.ok(rules > storage);
  assert.ok(profiles > storage);
  assert.ok(main > profiles);
});

test('Rules Profiles and Snapshots require a writable schema before local mutations', () => {
  const rules = read('src/sidebar/sidebar-rules.js');
  const profiles = read('src/sidebar/sidebar-profiles.js');
  const snapshots = read('src/sidebar/sidebar-snapshots.js');

  assert.match(rules, /requireWritableStorageSchema\(\)/);
  assert.match(rules, /save\.disabled = !writable/);
  assert.match(rules, /reset\.disabled = !writable/);

  assert.ok((profiles.match(/requireWritableStorageSchema\(\)/g) || []).length >= 2);
  assert.match(profiles, /save\.disabled = !writable/);
  assert.match(profiles, /remove\.disabled = !writable/);

  assert.ok((snapshots.match(/requireWritableStorageSchema\(\)/g) || []).length >= 4);
  assert.match(snapshots, /saveButton\.disabled = !writable/);
  assert.match(snapshots, /importButton\.disabled = !writable/);
  assert.match(snapshots, /baseline\.disabled = !writable/);
  assert.match(snapshots, /remove\.disabled = !writable/);
});

test('legacy snapshot mutation moved out of Compare UI into the global migration engine', () => {
  const snapshots = read('src/sidebar/sidebar-snapshots.js');
  const schema = read('src/lib/storage-schema.js');
  assert.doesNotMatch(snapshots, /browser\.storage\.local\.get\(null\)/);
  assert.doesNotMatch(snapshots, /SnapshotHistory\.migrateLegacy/);
  assert.match(schema, /SnapshotHistory\.migrateLegacy/);
});
