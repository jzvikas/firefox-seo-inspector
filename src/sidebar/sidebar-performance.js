'use strict';

function performanceBytes(value) {
  const bytes = Number(value) || 0;
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function performanceMs(value) {
  const ms = Number(value) || 0;
  if (ms < 1000) return `${ms.toFixed(ms < 100 ? 1 : 0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function performanceHost(value) {
  try { return new URL(value).host; } catch (_error) { return value || '—'; }
}

function performanceKindLabel(kind) {
  const labels = {
    document: 'HTML',
    javascript: 'JavaScript',
    css: 'CSS',
    image: 'Images',
    font: 'Fonts',
    fetch: 'Fetch/XHR',
    media: 'Media',
    other: 'Other',
  };
  return labels[kind] || kind || 'Other';
}

function renderPerformanceResourceTable(panel, title, resources, limit) {
  const items = Array.isArray(resources) ? resources : [];
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', title));
  if (!items.length) {
    cardNode.appendChild(el('div', 'empty', 'No matching Resource Timing entries.'));
    panel.appendChild(cardNode);
    return;
  }

  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Type', 'Time', 'Size', 'Origin', 'Resource'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');

  items.slice(0, limit || 20).forEach((item) => {
    const row = document.createElement('tr');
    row.appendChild(el('td', '', performanceKindLabel(item.kind)));
    row.appendChild(el('td', '', performanceMs(item.duration)));
    row.appendChild(el('td', '', item.sizeBytes ? performanceBytes(item.sizeBytes) : 'Unknown'));
    row.appendChild(el('td', '', item.thirdParty ? '3rd-party' : '1st-party'));
    const resource = el('td', 'cell-url code', item.url || '—');
    resource.title = item.url || '';
    row.appendChild(resource);
    body.appendChild(row);
  });

  table.appendChild(body);
  wrap.appendChild(table);
  cardNode.appendChild(wrap);
  if (items.length > (limit || 20)) cardNode.appendChild(el('div', 'muted', `Showing first ${limit || 20} of ${items.length}.`));
  panel.appendChild(cardNode);
}

function renderPerformance() {
  const panel = document.getElementById('performance');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const report = state.report.performance;
  if (!report) {
    panel.appendChild(el('div', 'empty', 'Performance timing data is unavailable. Reload the page after updating the extension.'));
    return;
  }

  const summary = report.summary || {};
  const dom = report.dom || {};
  const navigation = report.navigation;

  const overview = el('div', 'card');
  overview.appendChild(el('div', 'card-header', 'Performance overview'));
  addRow(overview, 'DOM elements', dom.nodeCount || 0);
  addRow(overview, 'Maximum DOM depth', dom.maxDepth || 0);
  addRow(overview, 'Requests observed', summary.requestCount || 0);
  addRow(overview, 'Known transferred/encoded bytes', performanceBytes(summary.totalBytes));
  addRow(overview, 'Resources with known size', `${summary.knownSizeCount || 0} / ${summary.requestCount || 0}`);
  addRow(overview, 'Third-party requests', summary.thirdParty ? summary.thirdParty.count : 0);
  addRow(overview, 'Third-party known bytes', performanceBytes(summary.thirdParty ? summary.thirdParty.bytes : 0));
  if (report.capped) addRow(overview, 'Resource timing cap', `Showing first ${report.resourceLimit} resource entries`);
  panel.appendChild(overview);

  const timing = el('div', 'card');
  timing.appendChild(el('div', 'card-header', 'Document timing'));
  if (!navigation) {
    timing.appendChild(el('div', 'empty', 'Navigation Timing entry is unavailable for this page.'));
  } else {
    addRow(timing, 'TTFB', performanceMs(navigation.ttfb));
    addRow(timing, 'DNS', performanceMs(navigation.dns));
    addRow(timing, 'Connect', performanceMs(navigation.connect));
    addRow(timing, 'TLS', navigation.tls ? performanceMs(navigation.tls) : '—');
    addRow(timing, 'Response download', performanceMs(navigation.responseDownload));
    addRow(timing, 'DOMContentLoaded', performanceMs(navigation.domContentLoaded));
    addRow(timing, 'Load event', performanceMs(navigation.load));
    addRow(timing, 'Navigation duration', performanceMs(navigation.total));
    addRow(timing, 'Protocol', navigation.protocol || '—');
    addRow(timing, 'Navigation redirects', navigation.redirectCount || 0);
    addRow(timing, 'HTML transfer size', navigation.transferSize ? performanceBytes(navigation.transferSize) : navigation.encodedBodySize ? `${performanceBytes(navigation.encodedBodySize)} encoded` : 'Unknown');
  }
  panel.appendChild(timing);

  const breakdown = el('div', 'card');
  breakdown.appendChild(el('div', 'card-header', 'Requests and bytes by type'));
  const kinds = summary.kinds || {};
  ['document', 'javascript', 'css', 'image', 'font', 'fetch', 'media', 'other'].forEach((kind) => {
    const item = kinds[kind] || { count: 0, bytes: 0, knownSizeCount: 0 };
    addRow(
      breakdown,
      performanceKindLabel(kind),
      `${item.count || 0} requests · ${performanceBytes(item.bytes)} known bytes${item.count ? ` · ${item.knownSizeCount || 0}/${item.count} sized` : ''}`,
    );
  });
  panel.appendChild(breakdown);

  renderPerformanceResourceTable(panel, 'Largest resources', report.largest || [], 10);
  renderPerformanceResourceTable(panel, 'Slowest resources', report.slowest || [], 10);

  const resources = Array.isArray(report.resources) ? report.resources : [];
  const full = el('div', 'card');
  full.appendChild(el('div', 'card-header', `Resource Timing · ${resources.length} entries`));
  if (!resources.length) {
    full.appendChild(el('div', 'empty', 'No resource timing entries were captured.'));
  } else {
    const wrap = el('div', 'table-wrap');
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const hrow = document.createElement('tr');
    ['Type', 'Start', 'Duration', 'Size', 'Host', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
    head.appendChild(hrow);
    table.appendChild(head);
    const body = document.createElement('tbody');
    resources.slice(0, 500).forEach((item) => {
      const row = document.createElement('tr');
      row.appendChild(el('td', '', performanceKindLabel(item.kind)));
      row.appendChild(el('td', '', performanceMs(item.startTime)));
      row.appendChild(el('td', '', performanceMs(item.duration)));
      row.appendChild(el('td', '', item.sizeBytes ? performanceBytes(item.sizeBytes) : 'Unknown'));
      row.appendChild(el('td', '', performanceHost(item.url)));
      row.appendChild(el('td', 'cell-url code', item.url || '—'));
      body.appendChild(row);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    full.appendChild(wrap);
    if (resources.length > 500) full.appendChild(el('div', 'muted', `Showing first 500 of ${resources.length} entries.`));
  }
  panel.appendChild(full);

  panel.appendChild(el('div', 'muted', 'Resource Timing may hide transfer sizes for some cached or cross-origin resources. Unknown bytes are never estimated as real transferred bytes.'));
}
