'use strict';

const SNAPSHOT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const snapshotUiState = {
  loaded: false,
  loading: false,
  history: SnapshotHistory.emptyHistory(),
  comparedId: null,
  message: '',
  messageKind: '',
};

function snapshotCurrentUrl() {
  return state.report && state.report.facts ? SnapshotHistory.normalizeUrl(state.report.facts.url) : '';
}

function snapshotRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function snapshotSetMessage(message, kind) {
  snapshotUiState.message = String(message || '');
  snapshotUiState.messageKind = kind || '';
}

async function persistSnapshotHistory() {
  const clean = SnapshotHistory.sanitizeHistory(snapshotUiState.history);
  snapshotUiState.history = clean;
  await browser.storage.local.set({ [SnapshotHistory.STORAGE_KEY]: clean });
}

async function loadSnapshotHistory() {
  if (snapshotUiState.loading || snapshotUiState.loaded) return;
  snapshotUiState.loading = true;
  try {
    const stored = await browser.storage.local.get(null);
    const current = SnapshotHistory.sanitizeHistory(stored[SnapshotHistory.STORAGE_KEY]);
    const migrated = SnapshotHistory.migrateLegacy(stored, current);
    snapshotUiState.history = migrated.history;
    if (migrated.migratedKeys.length) {
      await browser.storage.local.set({ [SnapshotHistory.STORAGE_KEY]: migrated.history });
      await browser.storage.local.remove(migrated.migratedKeys);
      snapshotSetMessage(`Migrated ${migrated.migratedKeys.length} legacy snapshot${migrated.migratedKeys.length === 1 ? '' : 's'} into snapshot history.`, 'ok');
    }
    snapshotUiState.loaded = true;
  } catch (_error) {
    snapshotSetMessage('Could not load local snapshot history.', 'critical');
    snapshotUiState.loaded = true;
  } finally {
    snapshotUiState.loading = false;
    renderCompare();
  }
}

function currentSnapshotPage() {
  return SnapshotHistory.pageFor(snapshotUiState.history, snapshotCurrentUrl());
}

function compareSnapshotRecord(record) {
  if (!record || !state.report) return;
  snapshotUiState.comparedId = record.id;
  state.snapshotDiff = SeoCore.diffSnapshots(record.snapshot, SeoCore.makeSnapshot(state.report));
  snapshotSetMessage(`Comparing current page with “${record.name}”.`, 'ok');
  renderCompare();
}

async function saveSnapshot(name) {
  if (!state.report) return;
  const url = snapshotCurrentUrl();
  if (!url) return;
  const snapshot = SeoCore.makeSnapshot(state.report);
  const added = SnapshotHistory.addSnapshot(snapshotUiState.history, url, snapshot, {
    id: snapshotRecordId(),
    name,
    createdAt: snapshot.savedAt,
  });
  snapshotUiState.history = added.history;
  await persistSnapshotHistory();
  snapshotUiState.comparedId = added.record.id;
  state.snapshotDiff = SeoCore.diffSnapshots(added.record.snapshot, SeoCore.makeSnapshot(state.report));
  snapshotSetMessage(`Saved “${added.record.name}”.`, 'ok');
  renderCompare();
}

async function setSnapshotBaseline(id) {
  const url = snapshotCurrentUrl();
  snapshotUiState.history = SnapshotHistory.setBaseline(snapshotUiState.history, url, id);
  await persistSnapshotHistory();
  const record = SnapshotHistory.findRecord(snapshotUiState.history, url, id);
  snapshotSetMessage(record ? `Baseline set to “${record.name}”.` : 'Baseline cleared.', 'ok');
  renderCompare();
}

async function deleteSnapshotRecord(id) {
  const url = snapshotCurrentUrl();
  const record = SnapshotHistory.findRecord(snapshotUiState.history, url, id);
  if (!record) return;
  if (typeof confirm === 'function' && !confirm(`Delete snapshot “${record.name}”?`)) return;
  snapshotUiState.history = SnapshotHistory.deleteSnapshot(snapshotUiState.history, url, id);
  await persistSnapshotHistory();
  if (snapshotUiState.comparedId === id) {
    snapshotUiState.comparedId = null;
    state.snapshotDiff = undefined;
  }
  snapshotSetMessage(`Deleted “${record.name}”.`, 'ok');
  renderCompare();
}

function exportSnapshotHistory() {
  const payload = SnapshotHistory.exportPayload(snapshotUiState.history);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'firefox-seo-inspector-snapshots.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  snapshotSetMessage('Snapshot history exported.', 'ok');
  renderCompare();
}

async function importSnapshotHistoryFile(file) {
  if (!file) return;
  if (file.size > SNAPSHOT_IMPORT_MAX_BYTES) {
    snapshotSetMessage('Snapshot import is larger than the 5 MiB safety limit.', 'critical');
    renderCompare();
    return;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    snapshotUiState.history = SnapshotHistory.importPayload(parsed, snapshotUiState.history);
    await persistSnapshotHistory();
    snapshotSetMessage('Snapshot history imported and merged by snapshot ID.', 'ok');
  } catch (_error) {
    snapshotSetMessage('Snapshot import failed: invalid or unsupported JSON.', 'critical');
  }
  renderCompare();
}

function snapshotMessageNode() {
  if (!snapshotUiState.message) return null;
  const node = el('div', `issue ${snapshotUiState.messageKind === 'critical' ? 'critical' : 'info'}`);
  node.appendChild(el('div', 'issue-message', snapshotUiState.message));
  return node;
}

function appendSnapshotControls(panel) {
  const saveCard = el('div', 'card');
  saveCard.appendChild(el('div', 'card-header', 'Snapshot history'));
  const controls = el('div', 'toolbar');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = SnapshotHistory.MAX_NAME_LENGTH;
  nameInput.placeholder = 'Snapshot name (optional)';
  nameInput.setAttribute('aria-label', 'Snapshot name');
  controls.appendChild(nameInput);

  const saveButton = el('button', '', 'Save snapshot');
  saveButton.type = 'button';
  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    try { await saveSnapshot(nameInput.value); }
    finally { saveButton.disabled = false; }
  });
  controls.appendChild(saveButton);

  const baseline = SnapshotHistory.baselineFor(snapshotUiState.history, snapshotCurrentUrl());
  if (baseline) {
    const compareBaseline = el('button', '', 'Compare baseline');
    compareBaseline.type = 'button';
    compareBaseline.addEventListener('click', () => compareSnapshotRecord(baseline));
    controls.appendChild(compareBaseline);
  }

  const exportButton = el('button', '', 'Export snapshots');
  exportButton.type = 'button';
  exportButton.addEventListener('click', exportSnapshotHistory);
  controls.appendChild(exportButton);

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.hidden = true;
  importInput.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    importSnapshotHistoryFile(file).catch(() => {});
    importInput.value = '';
  });
  controls.appendChild(importInput);
  const importButton = el('button', '', 'Import snapshots');
  importButton.type = 'button';
  importButton.addEventListener('click', () => importInput.click());
  controls.appendChild(importButton);

  saveCard.appendChild(controls);
  saveCard.appendChild(el('div', 'muted', `Local-only history · max ${SnapshotHistory.MAX_SNAPSHOTS_PER_URL} snapshots per exact normalized URL · imports merge by snapshot ID.`));
  panel.appendChild(saveCard);
}

function appendSnapshotTable(panel) {
  const page = currentSnapshotPage();
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', `${page.snapshots.length} saved snapshot${page.snapshots.length === 1 ? '' : 's'} for this URL`));
  if (!page.snapshots.length) {
    cardNode.appendChild(el('div', 'empty', 'No snapshot history for this exact normalized URL yet.'));
    panel.appendChild(cardNode);
    return;
  }

  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Baseline', 'Name', 'Saved', 'Actions'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');

  page.snapshots.forEach((record) => {
    const row = document.createElement('tr');
    row.appendChild(el('td', '', page.baselineId === record.id ? '★' : ''));
    row.appendChild(el('td', '', record.name));
    row.appendChild(el('td', '', new Date(record.createdAt).toLocaleString()));
    const actionsCell = document.createElement('td');
    const compare = el('button', '', snapshotUiState.comparedId === record.id ? 'Compared' : 'Compare');
    compare.type = 'button';
    compare.disabled = snapshotUiState.comparedId === record.id;
    compare.addEventListener('click', () => compareSnapshotRecord(record));
    actionsCell.appendChild(compare);

    const baseline = el('button', '', page.baselineId === record.id ? 'Clear baseline' : 'Set baseline');
    baseline.type = 'button';
    baseline.addEventListener('click', () => setSnapshotBaseline(page.baselineId === record.id ? null : record.id).catch(() => {}));
    actionsCell.appendChild(baseline);

    const remove = el('button', '', 'Delete');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteSnapshotRecord(record.id).catch(() => {}));
    actionsCell.appendChild(remove);
    row.appendChild(actionsCell);
    body.appendChild(row);
  });

  table.appendChild(body);
  wrap.appendChild(table);
  cardNode.appendChild(wrap);
  panel.appendChild(cardNode);
}

function appendSnapshotDiff(panel) {
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Snapshot diff'));
  if (state.snapshotDiff === null) cardNode.appendChild(el('div', 'empty', 'Selected snapshot is unavailable.'));
  else if (Array.isArray(state.snapshotDiff) && !state.snapshotDiff.length) cardNode.appendChild(el('div', 'empty', 'No differences from the compared snapshot.'));
  else if (Array.isArray(state.snapshotDiff)) {
    state.snapshotDiff.forEach((change) => addRow(cardNode, change.field, `${valueText(change.before)}  →  ${valueText(change.after)}`));
  } else cardNode.appendChild(el('div', 'empty', 'Choose a saved snapshot or baseline to compare with the current page.'));
  panel.appendChild(cardNode);
}

function appendRawCompare(panel) {
  const rawCard = el('div', 'card');
  rawCard.appendChild(el('div', 'card-header', 'Rendered DOM vs raw HTML'));
  const rawButton = el('button', '', 'Compare raw HTML');
  rawButton.type = 'button';
  rawButton.addEventListener('click', async () => {
    rawButton.disabled = true;
    rawButton.textContent = 'Fetching…';
    try {
      state.rawReport = await sendToTab({ type: 'seoInspector.fetchRaw' });
      state.rawDiff = SeoCore.diffPageFacts(state.report.facts, state.rawReport.facts);
    } catch (_error) {
      state.rawDiff = null;
    }
    renderCompare();
  });
  rawCard.appendChild(rawButton);
  if (state.rawDiff === null) rawCard.appendChild(el('div', 'empty', 'Raw fetch failed or has not been run.'));
  else if (Array.isArray(state.rawDiff) && !state.rawDiff.length) rawCard.appendChild(el('div', 'empty', 'No differences in the compared SEO fields.'));
  else if (state.rawDiff) state.rawDiff.forEach((change) => addRow(rawCard, change.field, `Rendered: ${valueText(change.rendered)} | Raw: ${valueText(change.raw)}`));
  else rawCard.appendChild(el('div', 'empty', 'Run raw HTML comparison when needed.'));
  panel.appendChild(rawCard);
}

renderCompare = function renderSnapshotHistoryCompare() {
  const panel = document.getElementById('compare');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  if (!snapshotUiState.loaded) {
    panel.appendChild(el('div', 'empty', snapshotUiState.loading ? 'Loading snapshot history…' : 'Loading snapshot history…'));
    loadSnapshotHistory().catch(() => {});
    return;
  }

  const message = snapshotMessageNode();
  if (message) panel.appendChild(message);
  appendSnapshotControls(panel);
  appendSnapshotTable(panel);
  appendSnapshotDiff(panel);
  appendRawCompare(panel);
};
