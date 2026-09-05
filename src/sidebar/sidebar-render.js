'use strict';

function renderLinks() {
  const panel = document.getElementById('links');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  const links = state.report.facts.links;
  const toolbar = el('div', 'toolbar');
  const checkButton = el('button', '', 'Check HTTP status');
  checkButton.type = 'button';
  checkButton.addEventListener('click', async () => {
    checkButton.disabled = true;
    checkButton.textContent = 'Checking…';
    try {
      const urls = links.filter((item) => item.kind === 'http').map((item) => item.href);
      const response = await browser.runtime.sendMessage({ type: 'seoInspector.checkLinks', urls });
      state.linkResults = new Map((response.results || []).map((item) => [SeoCore.normalizedUrl(item.url), item]));
      renderLinks();
    } finally {
      checkButton.disabled = false;
      checkButton.textContent = 'Check HTTP status';
    }
  });
  toolbar.appendChild(checkButton);
  if (state.linkResults.size) {
    const summary = SeoCore.summarizeLinkResults(Array.from(state.linkResults.values()));
    toolbar.appendChild(badge(`${summary.broken} broken`, summary.broken ? 'critical' : 'ok'));
    toolbar.appendChild(badge(`${summary.redirect} redirects`, summary.redirect ? 'warning' : 'ok'));
    toolbar.appendChild(badge(`${summary.unknown} unknown`, summary.unknown ? 'warning' : 'ok'));
  }
  panel.appendChild(toolbar);

  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Status', 'Type', 'Anchor', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');
  links.slice(0, 500).forEach((link) => {
    const row = document.createElement('tr');
    const status = statusForLink(link);
    let statusText = '—';
    if (status) statusText = status.error ? status.error : `${status.status}${status.redirected ? ' →' : ''}`;
    row.appendChild(el('td', '', statusText));
    row.appendChild(el('td', '', link.kind === 'http' ? (link.internal ? 'Internal' : 'External') : link.kind));
    row.appendChild(el('td', '', link.label || '(empty)'));
    row.appendChild(el('td', 'cell-url code', link.href || link.rawHref));
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  panel.appendChild(wrap);
  if (links.length > 500) panel.appendChild(el('div', 'muted', `Showing first 500 of ${links.length} links.`));
}

function renderImages() {
  const panel = document.getElementById('images');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  const images = state.report.facts.images;
  if (!images.length) return panel.appendChild(el('div', 'empty', 'No images found.'));
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Alt', 'Intrinsic', 'Rendered', 'Loading', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');
  images.slice(0, 500).forEach((image) => {
    const row = document.createElement('tr');
    const altText = image.altPresent ? (image.alt || '(empty)') : 'MISSING';
    const altCell = el('td', '', altText);
    altCell.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: [image.ref] }).catch(() => {}));
    row.appendChild(altCell);
    row.appendChild(el('td', '', image.naturalWidth ? `${image.naturalWidth}×${image.naturalHeight}` : '—'));
    row.appendChild(el('td', '', image.renderedWidth ? `${image.renderedWidth}×${image.renderedHeight}` : '—'));
    row.appendChild(el('td', '', image.loading || 'default'));
    row.appendChild(el('td', 'cell-url code', image.src || '—'));
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  panel.appendChild(wrap);
}

function renderSchema() {
  const panel = document.getElementById('schema');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  const schemas = state.report.facts.schemas;
  if (!schemas.length) return panel.appendChild(el('div', 'empty', 'No JSON-LD blocks found.'));
  schemas.forEach((schema, index) => {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = schema.valid ? `#${index + 1} ${schema.types.join(', ') || 'JSON-LD'}` : `#${index + 1} INVALID JSON-LD`;
    details.appendChild(summary);
    const pre = document.createElement('pre');
    if (schema.valid) {
      try { pre.textContent = JSON.stringify(schema.parsed, null, 2); }
      catch (_error) { pre.textContent = schema.raw || ''; }
    } else {
      pre.textContent = `${schema.error || 'Invalid JSON'}\n\n${schema.raw || ''}`;
    }
    details.appendChild(pre);
    panel.appendChild(details);
  });
}

function renderSocial() {
  const panel = document.getElementById('social');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  const f = state.report.facts;
  const ogRows = Object.keys(f.openGraph).sort().map((key) => [key, f.openGraph[key]]);
  const twitterRows = Object.keys(f.twitter).sort().map((key) => [key, f.twitter[key]]);
  panel.appendChild(card('Open Graph', ogRows.length ? ogRows : [['Status', 'No Open Graph meta tags found.']]));
  panel.appendChild(card('Twitter / X cards', twitterRows.length ? twitterRows : [['Status', 'No Twitter card meta tags found.']]));
}

function snapshotKey() {
  if (!state.report) return null;
  return `snapshot:${SeoCore.normalizedUrl(state.report.facts.url)}`;
}

function valueText(value) {
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function renderCompare() {
  const panel = document.getElementById('compare');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));
  const toolbar = el('div', 'toolbar');
  const saveButton = el('button', '', 'Save snapshot');
  saveButton.type = 'button';
  saveButton.addEventListener('click', async () => {
    const key = snapshotKey();
    if (!key) return;
    await browser.storage.local.set({ [key]: SeoCore.makeSnapshot(state.report) });
    state.snapshotDiff = [];
    renderCompare();
  });
  toolbar.appendChild(saveButton);

  const compareButton = el('button', '', 'Compare saved snapshot');
  compareButton.type = 'button';
  compareButton.addEventListener('click', async () => {
    const key = snapshotKey();
    const stored = key ? await browser.storage.local.get(key) : {};
    state.snapshotDiff = stored[key] ? SeoCore.diffSnapshots(stored[key], SeoCore.makeSnapshot(state.report)) : null;
    renderCompare();
  });
  toolbar.appendChild(compareButton);

  const rawButton = el('button', '', 'Compare raw HTML');
  rawButton.type = 'button';
  rawButton.addEventListener('click', async () => {
    rawButton.disabled = true;
    rawButton.textContent = 'Fetching…';
    try {
      state.rawReport = await sendToTab({ type: 'seoInspector.fetchRaw' });
      state.rawDiff = SeoCore.diffPageFacts(state.report.facts, state.rawReport.facts);
      renderCompare();
    } catch (_error) {
      state.rawDiff = null;
      renderCompare();
    }
  });
  toolbar.appendChild(rawButton);
  panel.appendChild(toolbar);

  const snap = el('div', 'card');
  snap.appendChild(el('div', 'card-header', 'Saved snapshot diff'));
  if (state.snapshotDiff === null) snap.appendChild(el('div', 'empty', 'No saved snapshot found for this exact URL.'));
  else if (Array.isArray(state.snapshotDiff) && !state.snapshotDiff.length) snap.appendChild(el('div', 'empty', 'No differences from saved snapshot.'));
  else if (state.snapshotDiff) {
    state.snapshotDiff.forEach((change) => addRow(snap, change.field, `${valueText(change.before)}  →  ${valueText(change.after)}`));
  } else snap.appendChild(el('div', 'empty', 'Save or compare a snapshot.'));
  panel.appendChild(snap);

  const raw = el('div', 'card');
  raw.appendChild(el('div', 'card-header', 'Rendered DOM vs raw HTML'));
  if (state.rawDiff === null) raw.appendChild(el('div', 'empty', 'Raw fetch failed or has not been run.'));
  else if (Array.isArray(state.rawDiff) && !state.rawDiff.length) raw.appendChild(el('div', 'empty', 'No differences in the compared SEO fields.'));
  else if (state.rawDiff) state.rawDiff.forEach((change) => addRow(raw, change.field, `Rendered: ${valueText(change.rendered)} | Raw: ${valueText(change.raw)}`));
  else raw.appendChild(el('div', 'empty', 'Run raw HTML comparison when needed.'));
  panel.appendChild(raw);
}
