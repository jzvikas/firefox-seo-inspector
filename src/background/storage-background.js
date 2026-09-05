(() => {
  'use strict';

  let migrationPromise = null;
  let lastResult = null;

  function safeFailure(error) {
    const message = String(error && error.message ? error.message : error || 'storage-migration-failed')
      .replace(/https?:\/\/[^\s)]+/gi, 'https://…')
      .replace(/moz-extension:\/\/[^\s)]+/gi, 'moz-extension://…')
      .slice(0, 200);
    return {
      ok: false,
      code: 'migration-failed',
      migrated: false,
      currentVersion: 0,
      targetVersion: StorageSchema.SCHEMA_VERSION,
      normalizedCount: 0,
      migratedLegacySnapshots: 0,
      error: message,
    };
  }

  function ensureStorageSchema() {
    if (migrationPromise) return migrationPromise;
    migrationPromise = StorageSchema.migrate(browser.storage.local)
      .then((result) => {
        lastResult = result;
        return result;
      })
      .catch((error) => {
        migrationPromise = null;
        const failure = safeFailure(error);
        lastResult = failure;
        return failure;
      });
    return migrationPromise;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return undefined;
    if (message.type === 'seoInspector.ensureStorageSchema') return ensureStorageSchema();
    if (message.type === 'seoInspector.getStorageSchemaStatus') {
      return Promise.resolve(lastResult || {
        ok: true,
        code: 'pending',
        migrated: false,
        currentVersion: 0,
        targetVersion: StorageSchema.SCHEMA_VERSION,
        normalizedCount: 0,
        migratedLegacySnapshots: 0,
      });
    }
    return undefined;
  });

  ensureStorageSchema().catch(() => {});
})();
