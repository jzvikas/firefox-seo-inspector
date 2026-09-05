'use strict';

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

function renderThirdPartyAudit() {
  const panel = document.getElementById('performance');
  if (!panel || !state.report) return;
  const report = state.report.thirdPartyAudit;
  if (!report) {
    panel.appendChild(el('div', 'muted', 'Third-party resource audit is unavailable. Reload the page after updating the extension.'));
    return;
  }

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
    const rows = groups.slice(0, 200).map((group) => [
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
    if (groups.length > 200) domainCard.appendChild(el('div', 'muted', `Showing first 200 of ${groups.length} third-party hosts.`));
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
