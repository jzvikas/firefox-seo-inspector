'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CustomRules = require('../src/lib/custom-rules.js');
const DomainProfiles = require('../src/lib/domain-profiles.js');
const SnapshotHistory = require('../src/lib/snapshot-history.js');
const StorageSchema = require('../src/lib/storage-schema.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storageHarness(initial, options) {
  const data = clone(initial || {});
  const calls = [];
  const opts = options || {};
  return {
    data,
    calls,
    area: {
      async get(key) {
        calls.push(['get', key]);
        if (key === null) return clone(data);
        if (typeof key === 'string') return Object.prototype.hasOwnProperty.call(data, key) ? { [key]: clone(data[key]) } : {};
        return clone(data);
      },
      async set(values) {
        calls.push(['set', clone(values)]);
        if (opts.failSet && calls.filter((item) => item[0] === 'set').length === opts.failSet) throw new Error('set-failed');
        Object.assign(data, clone(values));
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys.slice() : [keys];
        calls.push(['remove', list]);
        if (opts.failRemove) throw new Error('remove-failed');
        list.forEach((key) => { delete data[key]; });
      },
    },
  };
}

function legacySnapshot(url) {
  return {
    version: 1,
    url,
    savedAt: '2026-01-02T03:04:05.000Z',
    score: 91,
    title: 'Legacy title',
  };
}

test('clean storage adopts the global schema with one metadata write', async () => {
  const h = storageHarness({});
  const result = await StorageSchema.migrate(h.area, { now: '2026-09-05T18:30:00.000Z' });
  assert.deepEqual(result, {
    ok: true,
    code: 'migration-required',
    migrated: true,
    currentVersion: 0,
    targetVersion: 1,
    normalizedCount: 0,
    migratedLegacySnapshots: 0,
  });
  assert.deepEqual(h.data[StorageSchema.META_KEY], {
    version: 1,
    migratedAt: '2026-09-05T18:30:00.000Z',
  });
  assert.equal(h.calls.filter((item) => item[0] === 'remove').length, 0);
});

test('migration normalizes rules/profiles and moves legacy snapshots before marking the schema current', async () => {
  const legacyKey = 'snapshot:https://example.test/product/1';
  const h = storageHarness({
    [CustomRules.STORAGE_KEY]: {
      version: 99,
      thresholds: { titleMin: -10, titleMax: 99999, imageMaxBytes: 3 },
      required: { title: false },
      disabledChecks: ['title.missing', 'bad id!'],
    },
    [DomainProfiles.STORAGE_KEY]: {
      version: 99,
      profiles: {
        'EXAMPLE.TEST.': {
          hostname: 'EXAMPLE.TEST.',
          label: '  Shop   profile ',
          expected: { hreflang: ['LT', 'bad value!'] },
        },
      },
    },
    [legacyKey]: legacySnapshot('https://example.test/product/1'),
  });

  const result = await StorageSchema.migrate(h.area, { now: '2026-09-05T18:31:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.migratedLegacySnapshots, 1);
  assert.ok(result.normalizedCount >= 3);
  assert.deepEqual(h.data[CustomRules.STORAGE_KEY], CustomRules.normalize(h.data[CustomRules.STORAGE_KEY]));
  assert.deepEqual(h.data[DomainProfiles.STORAGE_KEY], DomainProfiles.normalizeStore(h.data[DomainProfiles.STORAGE_KEY]));
  assert.equal(Object.prototype.hasOwnProperty.call(h.data, legacyKey), false);
  const page = SnapshotHistory.pageFor(h.data[SnapshotHistory.STORAGE_KEY], 'https://example.test/product/1');
  assert.equal(page.snapshots.length, 1);
  assert.equal(page.snapshots[0].name, 'Legacy snapshot');
  assert.equal(h.data[StorageSchema.META_KEY].version, 1);

  const operations = h.calls.map((item) => item[0]);
  const firstDataSet = operations.indexOf('set');
  const remove = operations.indexOf('remove');
  const finalMetaSet = operations.lastIndexOf('set');
  assert.ok(firstDataSet >= 0 && remove > firstDataSet && finalMetaSet > remove);
  const finalPayload = h.calls[finalMetaSet][1];
  assert.deepEqual(Object.keys(finalPayload), [StorageSchema.META_KEY]);
});

test('current schema is a no-op and does not rewrite local user data', async () => {
  const initial = {
    [StorageSchema.META_KEY]: { version: 1, migratedAt: '2026-01-01T00:00:00.000Z' },
    [CustomRules.STORAGE_KEY]: { arbitrary: 'leave-me-alone' },
  };
  const h = storageHarness(initial);
  const result = await StorageSchema.migrate(h.area);
  assert.equal(result.code, 'current');
  assert.equal(result.migrated, false);
  assert.equal(h.calls.filter((item) => item[0] === 'set').length, 0);
  assert.equal(h.calls.filter((item) => item[0] === 'remove').length, 0);
  assert.deepEqual(h.data, initial);
});

test('future schema is never downgraded or modified by an older extension build', async () => {
  const initial = {
    [StorageSchema.META_KEY]: { version: 7, migratedAt: '2030-01-01T00:00:00.000Z' },
    futureData: { keep: true },
  };
  const h = storageHarness(initial);
  const result = await StorageSchema.migrate(h.area);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'future-schema');
  assert.equal(result.currentVersion, 7);
  assert.equal(h.calls.filter((item) => item[0] === 'set').length, 0);
  assert.equal(h.calls.filter((item) => item[0] === 'remove').length, 0);
  assert.deepEqual(h.data, initial);
});

test('failed data write never removes a legacy snapshot or marks migration complete', async () => {
  const legacyKey = 'snapshot:https://example.test/a';
  const h = storageHarness({ [legacyKey]: legacySnapshot('https://example.test/a') }, { failSet: 1 });
  await assert.rejects(() => StorageSchema.migrate(h.area), /set-failed/);
  assert.equal(Object.prototype.hasOwnProperty.call(h.data, legacyKey), true);
  assert.equal(Object.prototype.hasOwnProperty.call(h.data, StorageSchema.META_KEY), false);
  assert.equal(h.calls.filter((item) => item[0] === 'remove').length, 0);
});

test('failed legacy removal leaves the schema unmarked so the migration can safely retry', async () => {
  const legacyKey = 'snapshot:https://example.test/b';
  const initial = { [legacyKey]: legacySnapshot('https://example.test/b') };
  const first = storageHarness(initial, { failRemove: true });
  await assert.rejects(() => StorageSchema.migrate(first.area), /remove-failed/);
  assert.equal(Object.prototype.hasOwnProperty.call(first.data, legacyKey), true);
  assert.equal(Object.prototype.hasOwnProperty.call(first.data, SnapshotHistory.STORAGE_KEY), true);
  assert.equal(Object.prototype.hasOwnProperty.call(first.data, StorageSchema.META_KEY), false);

  const retry = storageHarness(first.data);
  const result = await StorageSchema.migrate(retry.area, { now: '2026-09-05T18:32:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(retry.data, legacyKey), false);
  assert.equal(retry.data[StorageSchema.META_KEY].version, 1);
  assert.equal(SnapshotHistory.pageFor(retry.data[SnapshotHistory.STORAGE_KEY], 'https://example.test/b').snapshots.length, 1);
});

test('public migration result exposes counts only, not saved hostnames or snapshot contents', async () => {
  const h = storageHarness({
    [DomainProfiles.STORAGE_KEY]: {
      profiles: { 'private.example': { hostname: 'private.example', label: 'Secret local label' } },
    },
  });
  const result = await StorageSchema.migrate(h.area);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private\.example|Secret local label/);
  assert.equal(typeof result.normalizedCount, 'number');
});
