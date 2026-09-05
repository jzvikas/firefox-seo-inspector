'use strict';

const SNAPSHOT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const snapshotUiState = {
  loaded: false,
  loading: false,
  history: SnapshotHistory.emptyHistory(),
  activeUrl: '',
  comparedId: null,
  regression: null,
  message: '',
  messageKind: '',
  schemaStatus: null,
};

function snapshotCurrentUrl() {
  return state.report && state.report.facts ? SnapshotHistory.normalizeUrl(state.report.facts.url) : '';
}

function syncSnapshotUrlState() {
  const url = snapshotCurrentUrl();
  if (snapshotUiState.activeUrl === url) return;
  snapshotUiState.activeUrl = url;
  snapshotUiState.comparedId = null;
  snapshotUiState.regression = null;
  snapshotUiState.message = '';
  snapshotUiState.messageKind = '';
  state.snapshotDiff = undefined;
}

function snapshotRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function snapshotSetMessage(message, kind) {
  snapshotUiState.message = String(message || '');
  snapshotUiState.messageKind = kind || '';
}

function snapshotWriteFailure(error, fallback) {
  return storageSchemaReadOnlyMessage(snapshotUiState.schemaStatus)
    || (error && error.message ? String(error.message) : '')
    || fallback;
}

async function persistSnapshotHistory() {
  snapshotUiState.schemaStatus = await requireWritableStorageSchema();
  const clean = SnapshotHistory.sanitizeHistory(snapshotUiState.history);
  snapshotUiState.history = clean;
  await browser.storage.local.set({ [SnapshotHistory.STORAGE_KEY]: clean });
}

async function loadSnapshotHistory() {
  if (snapshotUiState.loading || snapshotUiState.loaded) return;
  snapshotUiState.loading = true;
  try {
    snapshotUiState.schemaStatus = await ensureStorageSchemaReady(false);
    const stored = await browser.storage.local.get(SnapshotHistory.STORAGE_KEY);
    snapshotUiState.history = SnapshotHistory.sanitizeHistory(stored && stored[SnapshotHistory.STORAGE_KEY]);
    if (snapshotUiState.schemaStatus && snapshotUiState.schemaStatus.migratedLegacySnapshots) {
      const count = Number(snapshotUiState.schemaStatus.migratedLegacySnapshots) || 0;
      snapshotSetMessage(`Migrated ${count} legacy snapshot${count === 1 ? '' : 's'} into versioned snapshot history.`, 'ok');
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

function currentRegressionSnapshot() {
  if (!state.report) return null;
  const imageNetworkResults = imageNetworkState.response && Array.isArray(imageNetworkState.response.results)
    ? imageNetworkState.response.results
    : [];
  return Regression.makeSnapshot(state.report, {
    linkResults: Array.from(state.linkResults.values()),
    imageNetworkResults,
  });
}

function applySnapshotComparison(record) {
  if (!record || !state.report) return;
  const current = currentRegressionSnapshot();
  snapshotUiState.comparedId = record.id;
  snapshotUiState.regression = Regression.analyze(record.snapshot, current);
  state.snapshotDiff = snapshotUiState.regression.changes;
}

function compareSnapshotRecord(record) {
  if (!record || !state.report) return;
  applySnapshotComparison(record);
  snapshotSetMessage(`Comparing current page with “${record.name}”.`, 'ok');
  renderCompare();
}

async function saveSnapshot(name) {
  if (!state.report) return;
  snapshotUiState.schemaStatus = await requireWritableStorageSchema();
  const url = snapshotCurrentUrl();
  if (!url) return;
  const snapshot = currentRegressionSnapshot();
  const added = SnapshotHistory.addSnapshot(snapshotUiState.history, url, snapshot, {
    id: snapshotRecordId(),
    name,
    createdAt: snapshot.savedAt,
  });
  snapshotUiState.history = added.history;
  await persistSnapshotHistory();
  applySnapshotComparison(added.record);
  snapshotSetMessage(`Saved “${added.record.name}”.`, 'ok');
  renderCompare();
}

async function setSnapshotBaseline(id) {
  snapshotUiState.schemaStatus = await requireWritableStorageSchema();
  const url = snapshotCurrentUrl();
  snapshotUiState.history = SnapshotHistory.setBaseline(snapshotUiState.history, url, id);
  await persistSnapshotHistory();
  const record = SnapshotHistory.findRecord(snapshotUiState.history, url, id);
  snapshotSetMessage(record ? `Baseline set to “${record.name}”.` : 'Baseline cleared.', 'ok');
  renderCompare();
}

async function deleteSnapshotRecord(id) {
  snapshotUiState.schemaStatus = await requireWritableStorageSchema();
  const url = snapshotCurrentUrl();
  const record = SnapshotHistory.findRecord(snapshotUiState.history, url, id);
  if (!record) return;
  if (typeof confirm === 'function' && !confirm(`Delete snapshot “${record.name}”?`)) return;
  snapshotUiState.history = SnapshotHistory.deleteSnapshot(snapshotUiState.history, url, id);
  await persistSnapshotHistory();
  if (snapshotUiState.comparedId === id) {
    snapshotUiState.comparedId = null;
    snapshotUiState.regression = null;
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
    snapshotUiState.schemaStatus = await requireWritableStorageSchema();
    const textValue = await file.text();
    const parsed = JSON.parse(textValue);
    snapshotUiState.history = SnapshotHistory.importPayload(parsed, snapshotUiState.history);
    await persistSnapshotHistory();
    snapshotSetMessage('Snapshot history imported and merged by snapshot ID.', 'ok');
  } catch (error) {
    snapshotSetMessage(snapshotWriteFailure(error, 'Snapshot import failed: invalid or unsupported JSON.'), 'critical');
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
  const writable = storageSchemaIsWritable();
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = SnapshotHistory.MAX_NAME_LENGTH;
  nameInput.placeholder = 'Snapshot name (optional)';
  nameInput.setAttribute('aria-label', 'Snapshot name');
  controls.appendChild(nameInput);

  const saveButton = el('button', '', 'Save snapshot');
  saveButton.type = 'button';
  saveButton.disabled = !writable;
  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    try {
      await saveSnapshot(nameInput.value);
    } catch (error) {
      snapshotSetMessage(snapshotWriteFailure(error, 'Snapshot could not be saved to local storage.'), 'critical');
      renderCompare();
    } finally {
      saveButton.disabled = !storageSchemaIsWritable();
    }
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
  importButton.disabled = !writable;
  importButton.addEventListener('click', () => importInput.click());
  controls.appendChild(importButton);

  saveCard.appendChild(controls);
  saveCard.appendChild(el('div', 'muted', `Local-only history · max ${SnapshotHistory.MAX_SNAPSHOTS_PER_URL} snapshots per exact normalized URL · imports merge by snapshot ID.`));
  saveCard.appendChild(el('div', 'muted', 'Regression snapshots include SEO, indexability, headings, schema, hreflang, HTTP, performance, and security summaries. Broken-link/image network counts are recorded only when those on-demand checks have actually run.'));
  panel.appendChild(saveCard);
}

function appendSnapshotTable(panel) {
  const page = currentSnapshotPage();
  const writable = storageSchemaIsWritable();
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
    baseline.disabled = !writable;
    baseline.addEventListener('click', async () => {
      try {
        await setSnapshotBaseline(page.baselineId === record.id ? null : record.id);
      } catch (error) {
        snapshotSetMessage(snapshotWriteFailure(error, 'Baseline change could not be saved to local storage.'), 'critical');
        renderCompare();
      }
    });
    actionsCell.appendChild(baseline);

    const remove = el('button', '', 'Delete');
    remove.type = 'button';
    remove.disabled = !writable;
    remove.addEventListener('click', async () => {
      try {
        await deleteSnapshotRecord(record.id);
      } catch (error) {
        snapshotSetMessage(snapshotWriteFailure(error, 'Snapshot deletion could not be saved to local storage.'), 'critical');
        renderCompare();
      }
    });
    actionsCell.appendChild(remove);
    row.appendChild(actionsCell);
    body.appendChild(row);
  });

  table.appendChild(body);
  wrap.appendChild(table);
  cardNode.appendChild(wrap);
  panel.appendChild(cardNode);
}

function snapshotDirectionKind(change) {
  if (change.direction === 'regression') return change.severity === 'critical' ? 'critical' : 'warning';
  return 'info';
}

function appendSnapshotDiff(panel) {
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Regression diff'));
  if (state.snapshotDiff === null) cardNode.appendChild(el('div', 'empty', 'Selected snapshot is unavailable.'));
  else if (Array.isArray(state.snapshotDiff) && !state.snapshotDiff.length) cardNode.appendChild(el('div', 'empty', 'No differences from the compared snapshot.'));
  else if (Array.isArray(state.snapshotDiff)) {
    const regression = snapshotUiState.regression || { summary: { regressions: 0, improvements: 0, changed: state.snapshotDiff.length } };
    const summary = el('div', 'toolbar');
    summary.appendChild(badge(`${regression.summary.regressions} regressions`, regression.summary.regressions ? 'critical' : 'ok'));
    summary.appendChild(badge(`${regression.summary.improvements} improvements`, 'ok'));
    summary.appendChild(badge(`${regression.summary.changed} other changes`, regression.summary.changed ? 'warning' : 'ok'));
    cardNode.appendChild(summary);

    state.snapshotDiff.forEach((item) => {
      const node = el('div', `issue ${snapshotDirectionKind(item)}`);
      const title = el('div', 'issue-title');
      title.appendChild(el('span', '', item.label || item.field));
      title.appendChild(badge(item.direction || 'changed', snapshotDirectionKind(item)));
      node.appendChild(title);
      node.appendChild(el('div', 'issue-message', `${valueText(item.before)}  →  ${valueText(item.after)}`));
      if (item.category) node.appendChild(el('div', 'muted', item.category));
      cardNode.appendChild(node);
    });
  } else cardNode.appendChild(el('div', 'empty', 'Choose a saved snapshot or baseline to compare with the current page.'));
  panel.appendChild(cardNode);
}

function appendRawCompare(panel) {
  const rawCard = el('div', 'card');
  rawCard.appendChild(el('div', 'card-header', 'Rendered DOM vs raw HTML'));
  const toolbar = el('div', 'toolbar');
  const rawButton = el('button', '', rawSourceUiState.loading ? 'Cancel raw HTML' : state.rawReport ? 'Refresh raw HTML' : 'Compare raw HTML');
  rawButton.type = 'button';
  rawButton.addEventListener('click', () => {
    if (rawSourceUiState.loading) cancelRawSourceFetch().catch(() => {});
    else runRawSourceFetch().catch(() => {});
  });
  toolbar.appendChild(rawButton);
  rawCard.appendChild(toolbar);
  appendRawSourceStatus(rawCard);
  if (state.rawDiff === null) rawCard.appendChild(el('div', 'empty', rawSourceUiState.error ? 'Raw comparison is unavailable.' : 'Raw fetch failed or has not been run.'));
  else if (Array.isArray(state.rawDiff) && !state.rawDiff.length) rawCard.appendChild(el('div', 'empty', 'No differences in the compared SEO fields.'));
  else if (state.rawDiff) state.rawDiff.forEach((item) => addRow(rawCard, item.field, `Rendered: ${valueText(item.rendered)} | Raw: ${valueText(item.raw)}`));
  else if (!rawSourceUiState.loading) rawCard.appendChild(el('div', 'empty', 'Run raw HTML comparison when needed.'));
  panel.appendChild(rawCard);
}

renderCompare = function renderSnapshotHistoryCompare() {
  const panel = document.getElementById('compare');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  syncSnapshotUrlState();
  if (!snapshotUiState.loaded) {
    panel.appendChild(el('div', 'empty', 'Loading snapshot history…'));
    loadSnapshotHistory().catch(() => {});
    return;
  }

  const readOnly = storageSchemaReadOnlyMessage(snapshotUiState.schemaStatus);
  if (readOnly) panel.appendChild(el('div', 'issue warning', readOnly));
  const message = snapshotMessageNode();
  if (message) panel.appendChild(message);
  appendSnapshotControls(panel);
  appendSnapshotTable(panel);
  appendSnapshotDiff(panel);
  appendRawCompare(panel);
};
