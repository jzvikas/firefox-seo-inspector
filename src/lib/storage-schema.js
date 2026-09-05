(function (root, factory) {
  const customRules = typeof module === 'object' && module.exports ? require('./custom-rules.js') : root.CustomRules;
  const domainProfiles = typeof module === 'object' && module.exports ? require('./domain-profiles.js') : root.DomainProfiles;
  const snapshotHistory = typeof module === 'object' && module.exports ? require('./snapshot-history.js') : root.SnapshotHistory;
  const api = factory(customRules, domainProfiles, snapshotHistory);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StorageSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CustomRules, DomainProfiles, SnapshotHistory) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const META_KEY = 'storageSchema:v1';
  const MAX_SUMMARY_KEYS = 20;

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function finiteVersion(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  }

  function safeIso(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  }

  function normalizeMeta(value) {
    const source = plainObject(value) ? value : {};
    return {
      version: finiteVersion(source.version),
      migratedAt: source.migratedAt ? safeIso(source.migratedAt) : null,
    };
  }

  function sameJson(left, right) {
    try { return JSON.stringify(left) === JSON.stringify(right); }
    catch (_error) { return false; }
  }

  function migrationPlan(storageDump, options) {
    const source = plainObject(storageDump) ? storageDump : {};
    const opts = options || {};
    const currentMeta = normalizeMeta(source[META_KEY]);
    const now = safeIso(opts.now || Date.now());

    if (currentMeta.version > SCHEMA_VERSION) {
      return {
        ok: false,
        code: 'future-schema',
        currentVersion: currentMeta.version,
        targetVersion: SCHEMA_VERSION,
        writes: {},
        removeKeys: [],
        meta: currentMeta,
        summary: { normalized: [], migratedLegacySnapshots: 0 },
      };
    }

    if (currentMeta.version === SCHEMA_VERSION) {
      return {
        ok: true,
        code: 'current',
        currentVersion: currentMeta.version,
        targetVersion: SCHEMA_VERSION,
        writes: {},
        removeKeys: [],
        meta: currentMeta,
        summary: { normalized: [], migratedLegacySnapshots: 0 },
      };
    }

    const writes = {};
    const normalized = [];

    if (Object.prototype.hasOwnProperty.call(source, CustomRules.STORAGE_KEY)) {
      const rules = CustomRules.normalize(source[CustomRules.STORAGE_KEY]);
      if (!sameJson(rules, source[CustomRules.STORAGE_KEY])) normalized.push(CustomRules.STORAGE_KEY);
      writes[CustomRules.STORAGE_KEY] = rules;
    }

    if (Object.prototype.hasOwnProperty.call(source, DomainProfiles.STORAGE_KEY)) {
      const profiles = DomainProfiles.normalizeStore(source[DomainProfiles.STORAGE_KEY]);
      if (!sameJson(profiles, source[DomainProfiles.STORAGE_KEY])) normalized.push(DomainProfiles.STORAGE_KEY);
      writes[DomainProfiles.STORAGE_KEY] = profiles;
    }

    const currentHistory = SnapshotHistory.sanitizeHistory(source[SnapshotHistory.STORAGE_KEY]);
    const legacy = SnapshotHistory.migrateLegacy(source, currentHistory);
    const historyExists = Object.prototype.hasOwnProperty.call(source, SnapshotHistory.STORAGE_KEY);
    if (historyExists || legacy.migratedKeys.length) {
      if (!sameJson(legacy.history, source[SnapshotHistory.STORAGE_KEY])) normalized.push(SnapshotHistory.STORAGE_KEY);
      writes[SnapshotHistory.STORAGE_KEY] = legacy.history;
    }

    const removeKeys = legacy.migratedKeys.slice().sort();
    const meta = { version: SCHEMA_VERSION, migratedAt: now };

    return {
      ok: true,
      code: 'migration-required',
      currentVersion: currentMeta.version,
      targetVersion: SCHEMA_VERSION,
      writes,
      removeKeys,
      meta,
      summary: {
        normalized: Array.from(new Set(normalized)).sort().slice(0, MAX_SUMMARY_KEYS),
        migratedLegacySnapshots: removeKeys.length,
      },
    };
  }

  function publicResult(plan, migrated) {
    return {
      ok: Boolean(plan && plan.ok),
      code: plan && plan.code ? plan.code : 'unknown',
      migrated: Boolean(migrated),
      currentVersion: plan ? plan.currentVersion : 0,
      targetVersion: plan ? plan.targetVersion : SCHEMA_VERSION,
      normalizedCount: plan && plan.summary && Array.isArray(plan.summary.normalized) ? plan.summary.normalized.length : 0,
      migratedLegacySnapshots: plan && plan.summary ? Number(plan.summary.migratedLegacySnapshots) || 0 : 0,
    };
  }

  async function migrate(storageArea, options) {
    if (!storageArea || typeof storageArea.get !== 'function' || typeof storageArea.set !== 'function' || typeof storageArea.remove !== 'function') {
      throw new Error('storage-area-unavailable');
    }

    const dump = await storageArea.get(null);
    const plan = migrationPlan(dump, options);
    if (!plan.ok || plan.code === 'current') return publicResult(plan, false);

    const writeKeys = Object.keys(plan.writes);
    if (writeKeys.length) {
      await storageArea.set(plan.writes);
    }

    if (plan.removeKeys.length) {
      await storageArea.remove(plan.removeKeys);
    }

    await storageArea.set({ [META_KEY]: plan.meta });
    return publicResult(plan, true);
  }

  return {
    SCHEMA_VERSION,
    META_KEY,
    MAX_SUMMARY_KEYS,
    normalizeMeta,
    migrationPlan,
    migrate,
  };
});
