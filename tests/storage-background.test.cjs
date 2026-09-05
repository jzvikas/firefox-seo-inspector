'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const StorageSchema = require('../src/lib/storage-schema.js');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function harness(initial, options) {
  const data = JSON.parse(JSON.stringify(initial || {}));
  const opts = options || {};
  const listeners = [];
  let gets = 0;
  let sets = 0;
  const browser = {
    storage: {
      local: {
        async get() {
          gets += 1;
          return JSON.parse(JSON.stringify(data));
        },
        async set(values) {
          sets += 1;
          if (opts.failFirstSet && sets === 1) throw new Error('simulated storage failure https://private.example/path');
          Object.assign(data, JSON.parse(JSON.stringify(values)));
        },
        async remove(keys) {
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete data[key]; });
        },
      },
    },
    runtime: {
      onMessage: { addListener(listener) { listeners.push(listener); } },
    },
  };
  const context = vm.createContext({ browser, StorageSchema, Promise });
  vm.runInContext(source('src/background/storage-background.js'), context, { filename: 'storage-background.js' });

  async function dispatch(message) {
    for (const listener of listeners) {
      const value = listener(message, {});
      if (value !== undefined) return value;
    }
    return undefined;
  }

  return { data, dispatch, get gets() { return gets; }, get sets() { return sets; } };
}

test('background migration runs automatically and ensure message reuses the successful result', async () => {
  const h = harness({});
  await tick();
  const firstGets = h.gets;
  assert.ok(firstGets >= 1);
  assert.equal(h.data[StorageSchema.META_KEY].version, StorageSchema.SCHEMA_VERSION);

  const status = await h.dispatch({ type: 'seoInspector.ensureStorageSchema' });
  assert.equal(status.ok, true);
  assert.equal(h.gets, firstGets);

  const readStatus = await h.dispatch({ type: 'seoInspector.getStorageSchemaStatus' });
  assert.equal(readStatus.ok, true);
  assert.equal(readStatus.targetVersion, StorageSchema.SCHEMA_VERSION);
});

test('failed migration returns a sanitized local status and a later ensure retries', async () => {
  const h = harness({}, { failFirstSet: true });
  await tick();
  const failed = await h.dispatch({ type: 'seoInspector.getStorageSchemaStatus' });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'migration-failed');
  assert.doesNotMatch(failed.error, /private\.example/);

  const retried = await h.dispatch({ type: 'seoInspector.ensureStorageSchema' });
  assert.equal(retried.ok, true);
  assert.equal(h.data[StorageSchema.META_KEY].version, StorageSchema.SCHEMA_VERSION);
  assert.ok(h.gets >= 2);
});

test('background schema status never contains local storage payloads', async () => {
  const h = harness({
    localSecret: { hostname: 'private.example', label: 'Do not expose' },
  });
  await tick();
  const status = await h.dispatch({ type: 'seoInspector.getStorageSchemaStatus' });
  const serialized = JSON.stringify(status);
  assert.doesNotMatch(serialized, /private\.example|Do not expose|localSecret/);
});
