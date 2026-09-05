'use strict';

const imageNetworkState = {
  pageUrl: '',
  response: null,
  operationId: null,
  checking: false,
  error: null,
  sort: 'waste',
};

function resetImageNetworkState(pageUrl) {
  imageNetworkState.pageUrl = pageUrl || '';
  imageNetworkState.response = null;
  imageNetworkState.operationId = null;
  imageNetworkState.checking = false;
  imageNetworkState.error = null;
  imageNetworkState.sort = 'waste';
}

async function startImageNetworkCheck(images) {
  if (imageNetworkState.checking) return;
  imageNetworkState.checking = true;
  imageNetworkState.error = null;
  imageNetworkState.operationId = `images-${Date.now()}-${state.tabId || 0}`;
  renderImagesNetwork();
  try {
    imageNetworkState.response = await browser.runtime.sendMessage({
      type: 'seoInspector.checkImages',
      operationId: imageNetworkState.operationId,
      images: images.map((item) => item.src),
    });
  } catch (_error) {
    imageNetworkState.error = 'Image network validation failed.';
  } finally {
    imageNetworkState.checking = false;
    imageNetworkState.operationId = null;
    renderImagesNetwork();
  }
}

async function cancelImageNetworkCheck() {
  if (!imageNetworkState.operationId) return;
  await browser.runtime.sendMessage({
    type: 'seoInspector.cancelImages',
    operationId: imageNetworkState.operationId,
  }).catch(() => {});
}

function imageDimensions(image) {
  return image.naturalWidth && image.naturalHeight
    ? `${image.naturalWidth}×${image.naturalHeight}`
    : '—';
}

function renderedDimensions(image, dpr) {
  if (!image.renderedWidth || !image.renderedHeight) return '—';
  const css = `${image.renderedWidth}×${image.renderedHeight}`;
  if (dpr <= 1) return css;
  return `${css} CSS · ${Math.round(image.renderedWidth * dpr)}×${Math.round(image.renderedHeight * dpr)} target`;
}

function imageSizeText(row) {
  const label = ImageAudit.bytesLabel(row.sizeBytes);
  if (label === '—') return label;
  if (row.sizeSource === 'content-range' || row.sizeSource === 'content-length') return `${label} exact`;
  if (row.sizeSource === 'performance') return `${label} loaded`;
  return label;
}

function imageWasteText(row) {
  if (!row.wasteKnown || !row.sizeBytes) return '—';
  if (!row.estimatedWasteBytes) return '0 B';
  return `${ImageAudit.bytesLabel(row.estimatedWasteBytes)}${row.oversized ? ' ⚠' : ''}`;
}

function imageRowsForDisplay(analysis) {
  const rows = imageNetworkState.sort === 'waste' ? analysis.ranked.slice() : analysis.rows.slice();
  if (imageNetworkState.sort === 'size') rows.sort((a, b) => b.sizeBytes - a.sizeBytes);
  if (imageNetworkState.sort === 'status') {
    const priority = { critical: 0, warning: 1, unknown: 2, ok: 3 };
    rows.sort((a, b) => (priority[a.statusLevel] ?? 9) - (priority[b.statusLevel] ?? 9));
  }
  return rows;
}

function renderImagesNetwork() {
  const panel = document.getElementById('images');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const facts = state.report.facts;
  const images = facts.images || [];
  if (imageNetworkState.pageUrl !== facts.url) resetImageNetworkState(facts.url);
  if (!images.length) return panel.appendChild(el('div', 'empty', 'No images found.'));

  const dpr = Math.max(1, Number(state.report.pageContext && state.report.pageContext.devicePixelRatio) || 1);
  const networkResults = imageNetworkState.response && Array.isArray(imageNetworkState.response.results)
    ? imageNetworkState.response.results
    : [];
  const analysis = ImageAudit.analyze(images, networkResults, dpr);

  const toolbar = el('div', 'toolbar');
  const checkButton = el('button', '', imageNetworkState.checking ? 'Checking images…' : 'Check image network');
  checkButton.type = 'button';
  checkButton.disabled = imageNetworkState.checking;
  checkButton.addEventListener('click', () => startImageNetworkCheck(images));
  toolbar.appendChild(checkButton);

  if (imageNetworkState.checking) {
    const cancelButton = el('button', '', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => cancelImageNetworkCheck());
    toolbar.appendChild(cancelButton);
  }

  const sort = document.createElement('select');
  for (const [value, label] of [['waste', 'Sort: estimated waste'], ['size', 'Sort: file size'], ['status', 'Sort: status']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = imageNetworkState.sort === value;
    sort.appendChild(option);
  }
  sort.addEventListener('change', () => {
    imageNetworkState.sort = sort.value;
    renderImagesNetwork();
  });
  toolbar.appendChild(sort);

  if (imageNetworkState.response) {
    toolbar.appendChild(badge(`${imageNetworkState.response.checked || 0} checked`, 'ok'));
    if (imageNetworkState.response.capped) toolbar.appendChild(badge('Image limit reached', 'warning'));
    if (imageNetworkState.response.timedOut) toolbar.appendChild(badge('Scan timed out', 'warning'));
    if (imageNetworkState.response.cancelled) toolbar.appendChild(badge('Cancelled', 'warning'));
  }
  panel.appendChild(toolbar);

  if (imageNetworkState.error) {
    const errorNode = el('div', 'issue critical');
    errorNode.appendChild(el('div', 'issue-title', imageNetworkState.error));
    panel.appendChild(errorNode);
  }

  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'Image network summary'));
  addRow(summary, 'Images', analysis.counts.total);
  addRow(summary, 'Checked', analysis.counts.checked);
  addRow(summary, 'Broken/errors', analysis.counts.broken);
  addRow(summary, 'Redirects', analysis.counts.redirect);
  addRow(summary, 'Oversized', analysis.counts.oversized);
  addRow(summary, 'Known bytes', ImageAudit.bytesLabel(analysis.totalBytes));
  addRow(summary, 'Estimated waste', ImageAudit.bytesLabel(analysis.estimatedWasteBytes));
  addRow(summary, 'Unknown size', analysis.counts.unknownSize);
  addRow(summary, 'Page DPR', dpr.toFixed(dpr % 1 ? 2 : 0));
  panel.appendChild(summary);

  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Status', 'Size', 'Waste', 'Format', 'Intrinsic', 'Rendered', 'Alt', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');

  imageRowsForDisplay(analysis).slice(0, 500).forEach((rowData) => {
    const image = rowData.image;
    const row = document.createElement('tr');
    const statusCell = el('td', rowData.statusLevel === 'critical' ? 'serp-metric-bad' : '', rowData.statusLabel);
    row.appendChild(statusCell);
    row.appendChild(el('td', '', imageSizeText(rowData)));
    row.appendChild(el('td', rowData.oversized ? 'serp-metric-bad' : '', imageWasteText(rowData)));
    row.appendChild(el('td', '', rowData.format));
    row.appendChild(el('td', '', imageDimensions(image)));
    row.appendChild(el('td', '', renderedDimensions(image, dpr)));
    const alt = image.altPresent ? (image.alt || '(empty)') : 'MISSING';
    const altCell = el('td', image.altPresent ? '' : 'serp-metric-bad', alt);
    altCell.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: [image.ref] }).catch(() => {}));
    row.appendChild(altCell);
    row.appendChild(el('td', 'cell-url code', rowData.network && rowData.network.finalUrl ? rowData.network.finalUrl : rowData.url));
    body.appendChild(row);
  });

  table.appendChild(body);
  wrap.appendChild(table);
  panel.appendChild(wrap);
  if (analysis.rows.length > 500) panel.appendChild(el('div', 'muted', `Showing first 500 of ${analysis.rows.length} images.`));

  const note = el('div', 'card');
  note.appendChild(el('div', 'card-header', 'About estimated waste'));
  note.appendChild(el('div', 'serp-note', 'Waste is an approximation based on source pixel area versus rendered size adjusted for device pixel ratio. Compression efficiency does not scale perfectly with pixel area, so use the ranking to find likely optimization targets rather than as an exact savings forecast. Network checks omit credentials.'));
  panel.appendChild(note);
}
