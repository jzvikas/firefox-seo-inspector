(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SnapshotHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const STORAGE_KEY = 'snapshot-history:v2';
  const LEGACY_PREFIX = 'snapshot:';
  const MAX_SNAPSHOTS_PER_URL = 50;
  const MAX_IMPORT_PAGES = 500;
  const MAX_NAME_LENGTH = 120;

  function normalizeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.hash = '';
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
      return url.href;
    } catch (_error) {
      return '';
    }
  }

  function cleanName(value, fallback) {
    const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
    return text || String(fallback || 'Snapshot').slice(0, MAX_NAME_LENGTH);
  }

  function emptyHistory() {
    return { version: SCHEMA_VERSION, pages: {} };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeIso(value, fallback) {
    const date = new Date(value || fallback || Date.now());
    return Number.isNaN(date.getTime()) ? new Date(fallback || Date.now()).toISOString() : date.toISOString();
  }

  function sanitizeSnapshot(value, url) {
    if (!value || typeof value !== 'object') return null;
    const snapshot = clone(value);
    snapshot.url = normalizeUrl(snapshot.url || url);
    if (!snapshot.url) return null;
    snapshot.version = Number(snapshot.version) || 1;
    snapshot.savedAt = safeIso(snapshot.savedAt);
    return snapshot;
  }

  function sanitizeRecord(value, url, index) {
    if (!value || typeof value !== 'object') return null;
    const normalizedUrl = normalizeUrl(url || value.url || (value.snapshot && value.snapshot.url));
    if (!normalizedUrl) return null;
    const snapshot = sanitizeSnapshot(value.snapshot || value.data || value, normalizedUrl);
    if (!snapshot) return null;
    const createdAt = safeIso(value.createdAt || snapshot.savedAt);
    const fallbackId = `import-${createdAt}-${index || 0}`;
    const id = String(value.id || fallbackId).trim().slice(0, 180) || fallbackId;
    return {
      id,
      name: cleanName(value.name, 'Snapshot'),
      createdAt,
      url: normalizedUrl,
      snapshot,
    };
  }

  function sanitizePage(value, url) {
    const page = value && typeof value === 'object' ? value : {};
    const snapshots = [];
    const seen = new Set();
    const source = Array.isArray(page.snapshots) ? page.snapshots : [];
    source.forEach((item, index) => {
      const record = sanitizeRecord(item, url, index);
      if (!record || seen.has(record.id)) return;
      seen.add(record.id);
      snapshots.push(record);
    });
    snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    if (snapshots.length > MAX_SNAPSHOTS_PER_URL) snapshots.length = MAX_SNAPSHOTS_PER_URL;
    const baselineId = snapshots.some((item) => item.id === page.baselineId) ? String(page.baselineId) : null;
    return { baselineId, snapshots };
  }

  function sanitizeHistory(value) {
    const output = emptyHistory();
    if (!value || typeof value !== 'object') return output;
    const pages = value.pages && typeof value.pages === 'object' ? value.pages : {};
    Object.keys(pages).slice(0, MAX_IMPORT_PAGES).forEach((rawUrl) => {
      const url = normalizeUrl(rawUrl);
      if (!url) return;
      const page = sanitizePage(pages[rawUrl], url);
      if (page.snapshots.length) output.pages[url] = page;
    });
    return output;
  }

  function pageFor(history, url) {
    const normalized = normalizeUrl(url);
    if (!normalized) return { baselineId: null, snapshots: [] };
    const safe = sanitizeHistory(history);
    return safe.pages[normalized] || { baselineId: null, snapshots: [] };
  }

  function addSnapshot(history, url, snapshot, options) {
    const normalized = normalizeUrl(url || (snapshot && snapshot.url));
    if (!normalized) throw new Error('invalid-url');
    const safe = sanitizeHistory(history);
    const opts = options || {};
    const cleanSnapshot = sanitizeSnapshot(snapshot, normalized);
    if (!cleanSnapshot) throw new Error('invalid-snapshot');
    const createdAt = safeIso(opts.createdAt || cleanSnapshot.savedAt);
    const id = String(opts.id || `snapshot-${createdAt}`).trim().slice(0, 180);
    if (!id) throw new Error('invalid-id');
    const page = safe.pages[normalized] || { baselineId: null, snapshots: [] };
    const record = {
      id,
      name: cleanName(opts.name, `Snapshot ${page.snapshots.length + 1}`),
      createdAt,
      url: normalized,
      snapshot: cleanSnapshot,
    };
    page.snapshots = page.snapshots.filter((item) => item.id !== id);
    page.snapshots.unshift(record);
    page.snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    if (page.snapshots.length > MAX_SNAPSHOTS_PER_URL) {
      const removed = page.snapshots.splice(MAX_SNAPSHOTS_PER_URL);
      if (removed.some((item) => item.id === page.baselineId)) page.baselineId = null;
    }
    safe.pages[normalized] = page;
    return { history: safe, record };
  }

  function deleteSnapshot(history, url, id) {
    const normalized = normalizeUrl(url);
    const safe = sanitizeHistory(history);
    const page = safe.pages[normalized];
    if (!page) return safe;
    page.snapshots = page.snapshots.filter((item) => item.id !== id);
    if (page.baselineId === id) page.baselineId = null;
    if (!page.snapshots.length) delete safe.pages[normalized];
    return safe;
  }

  function setBaseline(history, url, id) {
    const normalized = normalizeUrl(url);
    const safe = sanitizeHistory(history);
    const page = safe.pages[normalized];
    if (!page) return safe;
    if (id === null || id === '') {
      page.baselineId = null;
      return safe;
    }
    page.baselineId = page.snapshots.some((item) => item.id === id) ? String(id) : page.baselineId;
    return safe;
  }

  function baselineFor(history, url) {
    const page = pageFor(history, url);
    return page.snapshots.find((item) => item.id === page.baselineId) || null;
  }

  function findRecord(history, url, id) {
    return pageFor(history, url).snapshots.find((item) => item.id === id) || null;
  }

  function mergeHistories(current, incoming) {
    const base = sanitizeHistory(current);
    const imported = sanitizeHistory(incoming);
    Object.entries(imported.pages).forEach(([url, importedPage]) => {
      const page = base.pages[url] || { baselineId: null, snapshots: [] };
      const byId = new Map(page.snapshots.map((item) => [item.id, item]));
      importedPage.snapshots.forEach((item) => {
        if (!byId.has(item.id)) byId.set(item.id, item);
      });
      page.snapshots = Array.from(byId.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, MAX_SNAPSHOTS_PER_URL);
      if (!page.baselineId && importedPage.baselineId && page.snapshots.some((item) => item.id === importedPage.baselineId)) {
        page.baselineId = importedPage.baselineId;
      }
      if (page.baselineId && !page.snapshots.some((item) => item.id === page.baselineId)) page.baselineId = null;
      if (page.snapshots.length) base.pages[url] = page;
    });
    return base;
  }

  function exportPayload(history) {
    return {
      format: 'firefox-seo-inspector-snapshots',
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      history: sanitizeHistory(history),
    };
  }

  function importPayload(value, current) {
    const payload = value && typeof value === 'object' ? value : null;
    if (!payload) throw new Error('invalid-import');
    const incoming = payload.format === 'firefox-seo-inspector-snapshots' ? payload.history : payload;
    if (!incoming || typeof incoming !== 'object') throw new Error('invalid-import');
    return mergeHistories(current, incoming);
  }

  function migrateLegacy(storageDump, currentHistory) {
    let history = sanitizeHistory(currentHistory);
    const migratedKeys = [];
    const source = storageDump && typeof storageDump === 'object' ? storageDump : {};
    Object.entries(source).forEach(([key, value], index) => {
      if (!key.startsWith(LEGACY_PREFIX) || key === STORAGE_KEY || !value || typeof value !== 'object') return;
      const url = normalizeUrl(value.url || key.slice(LEGACY_PREFIX.length));
      if (!url) return;
      const snapshot = sanitizeSnapshot(value, url);
      if (!snapshot) return;
      const id = `legacy-${index}-${snapshot.savedAt}`;
      const existing = pageFor(history, url).snapshots.some((item) => JSON.stringify(item.snapshot) === JSON.stringify(snapshot));
      if (!existing) {
        history = addSnapshot(history, url, snapshot, {
          id,
          name: 'Legacy snapshot',
          createdAt: snapshot.savedAt,
        }).history;
      }
      migratedKeys.push(key);
    });
    return { history, migratedKeys };
  }

  return {
    SCHEMA_VERSION,
    STORAGE_KEY,
    LEGACY_PREFIX,
    MAX_SNAPSHOTS_PER_URL,
    MAX_IMPORT_PAGES,
    MAX_NAME_LENGTH,
    normalizeUrl,
    cleanName,
    emptyHistory,
    sanitizeSnapshot,
    sanitizeRecord,
    sanitizePage,
    sanitizeHistory,
    pageFor,
    addSnapshot,
    deleteSnapshot,
    setBaseline,
    baselineFor,
    findRecord,
    mergeHistories,
    exportPayload,
    importPayload,
    migrateLegacy,
  };
});
