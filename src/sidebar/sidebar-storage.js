'use strict';

const storageSchemaUiState = {
  promise: null,
  status: null,
};

function localStorageSchemaFailure(error) {
  const message = String(error && error.message ? error.message : error || 'storage-schema-unavailable')
    .replace(/https?:\/\/[^\s)]+/gi, 'https://…')
    .replace(/moz-extension:\/\/[^\s)]+/gi, 'moz-extension://…')
    .slice(0, 200);
  return {
    ok: false,
    code: 'migration-failed',
    migrated: false,
    currentVersion: 0,
    targetVersion: 0,
    normalizedCount: 0,
    migratedLegacySnapshots: 0,
    error: message,
  };
}

async function ensureStorageSchemaReady(force) {
  if (force) storageSchemaUiState.promise = null;
  if (storageSchemaUiState.promise) return storageSchemaUiState.promise;
  storageSchemaUiState.promise = browser.runtime.sendMessage({ type: 'seoInspector.ensureStorageSchema' })
    .then((status) => {
      storageSchemaUiState.status = status && typeof status === 'object' ? status : localStorageSchemaFailure('empty-storage-schema-response');
      if (!storageSchemaUiState.status.ok && storageSchemaUiState.status.code === 'migration-failed') storageSchemaUiState.promise = null;
      return storageSchemaUiState.status;
    })
    .catch((error) => {
      storageSchemaUiState.promise = null;
      storageSchemaUiState.status = localStorageSchemaFailure(error);
      return storageSchemaUiState.status;
    });
  return storageSchemaUiState.promise;
}

function storageSchemaIsWritable() {
  return Boolean(storageSchemaUiState.status && storageSchemaUiState.status.ok === true);
}

function storageSchemaReadOnlyMessage(status) {
  const value = status || storageSchemaUiState.status;
  if (!value || value.ok === true) return '';
  if (value.code === 'future-schema') {
    return `Local data schema v${value.currentVersion} is newer than this extension supports (v${value.targetVersion}). Audits remain readable, but local settings and snapshots are read-only to prevent downgrade data loss.`;
  }
  return 'Local storage migration did not complete. Audits can continue, but local settings and snapshots are read-only until storage recovery succeeds.';
}

async function requireWritableStorageSchema() {
  const status = await ensureStorageSchemaReady(false);
  if (!status || status.ok !== true) {
    const error = new Error(storageSchemaReadOnlyMessage(status) || 'Local storage schema is not writable.');
    error.code = status && status.code ? status.code : 'storage-schema-unavailable';
    throw error;
  }
  return status;
}
