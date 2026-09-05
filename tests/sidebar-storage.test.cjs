'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

function harness(responses) {
  const queue = Array.isArray(responses) ? responses.slice() : [];
  let calls = 0;
  const context = vm.createContext({
    Promise,
    Error,
    browser: {
      runtime: {
        async sendMessage(message) {
          calls += 1;
          assert.equal(message.type, 'seoInspector.ensureStorageSchema');
          const value = queue.length ? queue.shift() : { ok: true, code: 'current', currentVersion: 1, targetVersion: 1 };
          if (value instanceof Error) throw value;
          return value;
        },
      },
    },
  });
  vm.runInContext(source('src/sidebar/sidebar-storage.js'), context, { filename: 'sidebar-storage.js' });
  return { context, get calls() { return calls; } };
}

test('successful schema readiness is cached and permits local writes', async () => {
  const h = harness([{ ok: true, code: 'current', currentVersion: 1, targetVersion: 1 }]);
  const first = await vm.runInContext('ensureStorageSchemaReady(false)', h.context);
  const second = await vm.runInContext('ensureStorageSchemaReady(false)', h.context);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(h.calls, 1);
  assert.equal(vm.runInContext('storageSchemaIsWritable()', h.context), true);
  await assert.doesNotReject(() => vm.runInContext('requireWritableStorageSchema()', h.context));
  assert.equal(h.calls, 1);
});

test('future schema stays readable but blocks writes with an explicit downgrade warning', async () => {
  const h = harness([{ ok: false, code: 'future-schema', currentVersion: 4, targetVersion: 1 }]);
  const status = await vm.runInContext('ensureStorageSchemaReady(false)', h.context);
  assert.equal(status.code, 'future-schema');
  assert.equal(vm.runInContext('storageSchemaIsWritable()', h.context), false);
  const message = vm.runInContext('storageSchemaReadOnlyMessage(storageSchemaUiState.status)', h.context);
  assert.match(message, /schema v4 is newer/);
  assert.match(message, /read-only/);
  await assert.rejects(() => vm.runInContext('requireWritableStorageSchema()', h.context), /read-only/);
});

test('transient migration failure is not cached forever and can recover on retry', async () => {
  const h = harness([
    new Error('first migration failed https://private.example/path'),
    { ok: true, code: 'migration-required', currentVersion: 0, targetVersion: 1, migrated: true },
  ]);
  const failed = await vm.runInContext('ensureStorageSchemaReady(false)', h.context);
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'migration-failed');
  assert.doesNotMatch(failed.error, /private\.example/);
  assert.equal(vm.runInContext('storageSchemaIsWritable()', h.context), false);

  const recovered = await vm.runInContext('ensureStorageSchemaReady(false)', h.context);
  assert.equal(recovered.ok, true);
  assert.equal(h.calls, 2);
  assert.equal(vm.runInContext('storageSchemaIsWritable()', h.context), true);
});
