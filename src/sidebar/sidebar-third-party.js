'use strict';

const THIRD_PARTY_RENDER_BATCH = 100;
const THIRD_PARTY_RENDER_MAX = 200;
const thirdPartyRenderState = {
  pageUrl: '',
  hostLimit: THIRD_PARTY_RENDER_BATCH,
};

function syncThirdPartyRenderState(pageUrlValue) {
  const value = String(pageUrlValue || '');
  if (thirdPartyRenderState.pageUrl === value) return;
  thirdPartyRenderState.pageUrl = value;
  thirdPartyRenderState.hostLimit = THIRD_PARTY_RENDER_BATCH;
}

function thirdPartyTypeMix(typeCounts) {
  return Object.entries(typeCounts || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => `${kind}:${count}`)
    .join(' · ') || '—';
}

function appendThirdPartyTable(container, headers, rows, codeColumnIndexes) {
  const codeColumns = new Set(codeColumnIndexes || []);
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  headers.forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');
  rows.forEach((values) => {
    const row = document.createElement('tr');
    values.forEach((value, index) => {
      const cell = el('td', codeColumns.has(index) ? 'cell-url code' : '', value === '' ? '—' : value);
      if (codeColumns.has(index)) cell.title = value || '';
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

function appendThirdPartyPager(container, total) {
  const cap = Math.min(total, THIRD_PARTY_RENDER_MAX);
  const shown = Math.min(thirdPartyRenderState.hostLimit, cap);
  if (shown < cap) {
    const controls = el('div', 'toolbar');
    const next = Math.min(THIRD_PARTY_RENDER_BATCH, cap - shown);
    const more = el('button', '', `Show next ${next} third-party hosts`);
    more.type = 'button';
    more.addEventListener('click', () => {
      thirdPartyRenderState.hostLimit = Math.min(THIRD_PARTY_RENDER_MAX, shown + THIRD_PARTY_RENDER_BATCH);
      rerenderPerformanceGroup();
    });
    controls.appendChild(more);
    controls.appendChild(el('span', 'muted', `Rendering ${shown} of ${total} third-party hosts.`));
    container.appendChild(controls);
    return;
  }
  if (total > THIRD_PARTY_RENDER_MAX) {
    container.appendChild(el('div', 'muted', `Rendering is capped at ${THIRD_PARTY_RENDER_MAX} of ${total} third-party hosts to keep the Inspector responsive. Full grouping remains in the report.`));
  }
}

function renderThirdPartyAudit() {
  const panel = document.getElementById('performance');
  if (!panel || !state.report) return;
  const report = state.report.thirdPartyAudit;
  if (!report) {
    panel.appendChild(el('div', 'muted', 'Third-party resource audit is unavailable. Reload the page after updating the extension.'));
    return;
  }

  syncThirdPartyRenderState(state.report.facts && state.report.facts.url);
  const summary = report.summary || {};
  const summaryCard = el('div', 'card');
  summaryCard.appendChild(el('div', 'card-header', 'Third-party resources'));
  addRow(summaryCard, 'Third-party hosts', summary.domainCount || 0);
  addRow(summaryCard, 'Observed requests', summary.requestCount || 0);
  addRow(summaryCard, 'Known transferred/encoded bytes', summary.knownBytes ? performanceBytes(summary.knownBytes) : '0 B');
  addRow(summaryCard, 'Requests with known size', `${summary.knownSizeCount || 0}/${summary.requestCount || 0}`);
  addRow(summaryCard, 'Combined resource duration', performanceMs(summary.totalDuration || 0));
  summaryCard.appendChild(el('div', 'muted', report.classificationNote || 'Categories are local heuristics.'));
  panel.appendChild(summaryCard);

  const categoryCard = el('div', 'card');
  const categories = Array.isArray(report.categories) ? report.categories : [];
  categoryCard.appendChild(el('div', 'card-header', `Third-party categories · ${categories.length}`));
  if (!categories.length) {
    categoryCard.appendChild(el('div', 'empty', 'No third-party Resource Timing entries were observed.'));
  } else {
    const rows = categories.map((item) => [
      item.label || item.category || 'Other',
      item.domains || 0,
      item.requests || 0,
      `${item.knownSizeCount || 0}/${item.requests || 0}`,
      item.knownBytes ? performanceBytes(item.knownBytes) : 'Unknown',
    ]);
    appendThirdPartyTable(categoryCard, ['Category', 'Hosts', 'Requests', 'Sized', 'Known bytes'], rows);
  }
  panel.appendChild(categoryCard);

  const domainCard = el('div', 'card');
  const groups = Array.isArray(report.groups) ? report.groups : [];
  domainCard.appendChild(el('div', 'card-header', `Third-party hosts · ${groups.length}`));
  if (!groups.length) {
    domainCard.appendChild(el('div', 'empty', 'No third-party hosts found in local Resource Timing data.'));
  } else {
    const renderLimit = Math.min(thirdPartyRenderState.hostLimit, THIRD_PARTY_RENDER_MAX);
    const rows = groups.slice(0, renderLimit).map((group) => [
      group.host || '—',
      group.categoryLabel || 'Other third-party',
      group.classificationConfidence === 'known-domain' ? 'known domain' : group.classificationConfidence === 'hostname-heuristic' ? 'heuristic' : 'unclassified',
      group.requestCount || 0,
      `${group.knownSizeCount || 0}/${group.requestCount || 0}`,
      group.knownSizeCount ? performanceBytes(group.knownBytes) : 'Unknown',
      performanceMs(group.totalDuration || 0),
      thirdPartyTypeMix(group.typeCounts),
    ]);
    appendThirdPartyTable(domainCard, ['Host', 'Category', 'Match', 'Requests', 'Sized', 'Known bytes', 'Time', 'Types'], rows, [0]);
    appendThirdPartyPager(domainCard, groups.length);
  }
  domainCard.appendChild(el('div', 'muted', 'Hosts are grouped from already-observed Resource Timing entries. Unknown cross-origin/cache sizes remain unknown; resources are not fetched again.'));
  panel.appendChild(domainCard);

  const samples = groups.filter((group) => Array.isArray(group.sampleUrls) && group.sampleUrls.length).slice(0, 30);
  if (samples.length) {
    const sampleCard = el('div', 'card');
    sampleCard.appendChild(el('div', 'card-header', 'Third-party request samples'));
    samples.forEach((group) => {
      const details = document.createElement('details');
      const summaryNode = document.createElement('summary');
      summaryNode.textContent = `${group.host} · ${group.requestCount} request(s)`;
      details.appendChild(summaryNode);
      const list = el('div', 'card');
      group.sampleUrls.forEach((url) => addRow(list, 'URL', url, 'code'));
      details.appendChild(list);
      sampleCard.appendChild(details);
    });
    sampleCard.appendChild(el('div', 'muted', 'At most five unique sample URLs are retained per host.'));
    panel.appendChild(sampleCard);
  }
}
