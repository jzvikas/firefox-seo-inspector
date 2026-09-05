'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SnapshotHistory = require('../src/lib/snapshot-history.js');

function snap(url, savedAt, title) {
  return {
    version: 1,
    savedAt,
    url,
    title: title || '',
    description: '',
    canonical: url,
    robots: [],
    h1: [],
    headingCount: 0,
    linkCount: 0,
    imageCount: 0,
    schemaTypes: [],
    hreflangCount: 0,
    score: 100,
    issueIds: [],
  };
}

test('empty history uses the current schema version', () => {
  assert.deepEqual(SnapshotHistory.emptyHistory(), { version: 2, pages: {} });
});

test('URL normalization removes fragments and default ports', () => {
  assert.equal(SnapshotHistory.normalizeUrl('https://example.com:443/a#x'), 'https://example.com/a');
  assert.equal(SnapshotHistory.normalizeUrl('ftp://example.com/a'), '');
});

test('snapshot names are normalized, bounded, and get a fallback', () => {
  assert.equal(SnapshotHistory.cleanName('  Before   deploy  ', 'Snapshot'), 'Before deploy');
  assert.equal(SnapshotHistory.cleanName('', 'Snapshot'), 'Snapshot');
  assert.equal(SnapshotHistory.cleanName('x'.repeat(200), '').length, 120);
});

test('multiple snapshots per URL are stored newest first', () => {
  let history = SnapshotHistory.emptyHistory();
  history = SnapshotHistory.addSnapshot(history, 'https://example.com/a', snap('https://example.com/a', '2026-09-01T10:00:00Z', 'A'), {
    id: 'one', name: 'Before', createdAt: '2026-09-01T10:00:00Z',
  }).history;
  history = SnapshotHistory.addSnapshot(history, 'https://example.com/a', snap('https://example.com/a', '2026-09-02T10:00:00Z', 'B'), {
    id: 'two', name: 'After', createdAt: '2026-09-02T10:00:00Z',
  }).history;
  const page = SnapshotHistory.pageFor(history, 'https://example.com/a#fragment');
  assert.deepEqual(page.snapshots.map((item) => item.id), ['two', 'one']);
  assert.deepEqual(page.snapshots.map((item) => item.name), ['After', 'Before']);
});

test('snapshot history enforces the per-URL cap', () => {
  let history = SnapshotHistory.emptyHistory();
  for (let i = 0; i < 55; i += 1) {
    const day = String((i % 28) + 1).padStart(2, '0');
    history = SnapshotHistory.addSnapshot(history, 'https://example.com/a', snap('https://example.com/a', `2026-08-${day}T10:00:00Z`, String(i)), {
      id: `id-${i}`, name: `Snapshot ${i}`, createdAt: new Date(2026, 7, 1, 0, 0, i).toISOString(),
    }).history;
  }
  assert.equal(SnapshotHistory.pageFor(history, 'https://example.com/a').snapshots.length, 50);
});

test('baseline can be set and is cleared when its snapshot is deleted', () => {
  let history = SnapshotHistory.addSnapshot(SnapshotHistory.emptyHistory(), 'https://example.com/a', snap('https://example.com/a', '2026-09-01T10:00:00Z'), {
    id: 'base', name: 'Baseline', createdAt: '2026-09-01T10:00:00Z',
  }).history;
  history = SnapshotHistory.setBaseline(history, 'https://example.com/a', 'base');
  assert.equal(SnapshotHistory.baselineFor(history, 'https://example.com/a').id, 'base');
  history = SnapshotHistory.deleteSnapshot(history, 'https://example.com/a', 'base');
  assert.equal(SnapshotHistory.baselineFor(history, 'https://example.com/a'), null);
  assert.equal(SnapshotHistory.pageFor(history, 'https://example.com/a').snapshots.length, 0);
});

test('invalid baseline id does not replace an existing baseline', () => {
  let history = SnapshotHistory.addSnapshot(SnapshotHistory.emptyHistory(), 'https://example.com/a', snap('https://example.com/a', '2026-09-01T10:00:00Z'), {
    id: 'base', createdAt: '2026-09-01T10:00:00Z',
  }).history;
  history = SnapshotHistory.setBaseline(history, 'https://example.com/a', 'base');
  history = SnapshotHistory.setBaseline(history, 'https://example.com/a', 'missing');
  assert.equal(SnapshotHistory.pageFor(history, 'https://example.com/a').baselineId, 'base');
});

test('export/import round trip preserves snapshots and baseline', () => {
  let history = SnapshotHistory.addSnapshot(SnapshotHistory.emptyHistory(), 'https://example.com/a', snap('https://example.com/a', '2026-09-01T10:00:00Z', 'A'), {
    id: 'one', name: 'Before', createdAt: '2026-09-01T10:00:00Z',
  }).history;
  history = SnapshotHistory.setBaseline(history, 'https://example.com/a', 'one');
  const payload = SnapshotHistory.exportPayload(history);
  const imported = SnapshotHistory.importPayload(JSON.parse(JSON.stringify(payload)), SnapshotHistory.emptyHistory());
  const page = SnapshotHistory.pageFor(imported, 'https://example.com/a');
  assert.equal(page.snapshots[0].name, 'Before');
  assert.equal(page.baselineId, 'one');
});

test('import merges by snapshot id instead of duplicating records', () => {
  let current = SnapshotHistory.addSnapshot(SnapshotHistory.emptyHistory(), 'https://example.com/a', snap('https://example.com/a', '2026-09-01T10:00:00Z'), {
    id: 'one', createdAt: '2026-09-01T10:00:00Z',
  }).history;
  let incoming = SnapshotHistory.addSnapshot(SnapshotHistory.emptyHistory(), 'https://example.com/a', snap('https://example.com/a', '2026-09-01T10:00:00Z'), {
    id: 'one', createdAt: '2026-09-01T10:00:00Z',
  }).history;
  incoming = SnapshotHistory.addSnapshot(incoming, 'https://example.com/a', snap('https://example.com/a', '2026-09-02T10:00:00Z'), {
    id: 'two', createdAt: '2026-09-02T10:00:00Z',
  }).history;
  current = SnapshotHistory.mergeHistories(current, incoming);
  assert.deepEqual(SnapshotHistory.pageFor(current, 'https://example.com/a').snapshots.map((item) => item.id), ['two', 'one']);
});

test('legacy single-snapshot storage migrates without deleting unrelated keys', () => {
  const legacy = snap('https://example.com/a', '2026-09-01T10:00:00Z', 'Legacy');
  const migrated = SnapshotHistory.migrateLegacy({
    'snapshot:https://example.com/a': legacy,
    'unrelated:key': { value: 1 },
  }, SnapshotHistory.emptyHistory());
  const page = SnapshotHistory.pageFor(migrated.history, 'https://example.com/a');
  assert.equal(page.snapshots.length, 1);
  assert.equal(page.snapshots[0].name, 'Legacy snapshot');
  assert.deepEqual(migrated.migratedKeys, ['snapshot:https://example.com/a']);
});

test('malformed imported page records are dropped safely', () => {
  const history = SnapshotHistory.sanitizeHistory({
    version: 2,
    pages: {
      'not a url': { snapshots: [{ id: 'bad' }] },
      'https://example.com/a': { snapshots: [null, { id: 'bad', snapshot: null }] },
    },
  });
  assert.deepEqual(history.pages, {});
});
