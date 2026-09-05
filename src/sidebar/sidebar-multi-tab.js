'use strict';

const multiTabState = {
  running: false,
  cancelling: false,
  rows: [],
  duplicates: { titles: [], descriptions: [], h1: [] },
  processed: 0,
  total: 0,
  error: '',
  query: '',
  indexability: 'All',
  issuesOnly: false,
  duplicatesOnly: false,
  availableOnly: false,
  sortKey: 'url',
  sortDirection: 'asc',
  scanId: 0,
};

function multiTabDownload(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function multiTabFilteredRows() {
  const filtered = MultiTabAudit.filterRows(multiTabState.rows, {
    query: multiTabState.query,
    indexability: multiTabState.indexability,
    issuesOnly: multiTabState.issuesOnly,
    duplicatesOnly: multiTabState.duplicatesOnly,
    availableOnly: multiTabState.availableOnly,
  });
  return MultiTabAudit.sortRows(filtered, multiTabState.sortKey, multiTabState.sortDirection);
}

function multiTabDuplicateData(rows) {
  const data = MultiTabAudit.duplicateSummary(rows);
  return { titles: data.titles, descriptions: data.descriptions, h1: data.h1, rows: data.rows };
}

function multiTabFinalizeDuplicates() {
  const data = multiTabDuplicateData(multiTabState.rows);
  multiTabState.rows = data.rows;
  multiTabState.duplicates = {
    titles: data.titles,
    descriptions: data.descriptions,
    h1: data.h1,
  };
}

function multiTabPromiseTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('analysis-timeout'));
    }, ms);
    Promise.resolve(promise).then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function multiTabFailureReason(error) {
  const text = String(error && error.message || error || '').toLowerCase();
  if (text.includes('analysis-timeout')) return 'Audit timed out after 15 seconds.';
  if (text.includes('receiving end') || text.includes('could not establish connection') || text.includes('no tab')) {
    return 'Content script unavailable. Reload this tab and scan again.';
  }
  return 'Tab audit unavailable. Reload the tab and scan again.';
}

async function runMultiTabAudit() {
  if (multiTabState.running) return;
  const scanId = ++multiTabState.scanId;
  multiTabState.running = true;
  multiTabState.cancelling = false;
  multiTabState.rows = [];
  multiTabState.duplicates = { titles: [], descriptions: [], h1: [] };
  multiTabState.processed = 0;
  multiTabState.total = 0;
  multiTabState.error = '';
  renderMultiTab();

  try {
    const tabs = MultiTabAudit.selectTabs(await browser.tabs.query({}), MultiTabAudit.MAX_TABS);
    multiTabState.total = tabs.length;
    if (!tabs.length) {
      multiTabState.running = false;
      renderMultiTab();
      return;
    }

    let cursor = 0;
    async function worker() {
      while (scanId === multiTabState.scanId && !multiTabState.cancelling) {
        const index = cursor;
        cursor += 1;
        if (index >= tabs.length) return;
        const tab = tabs[index];
        let row;
        try {
          const report = await multiTabPromiseTimeout(
            browser.tabs.sendMessage(tab.id, { type: 'seoInspector.analyze' }),
            15000,
          );
          if (!report || !report.facts || !report.evaluation) throw new Error('invalid-report');
          row = MultiTabAudit.summarizeReport(tab, report);
        } catch (error) {
          row = MultiTabAudit.unavailableRow(tab, multiTabFailureReason(error));
        }
        if (scanId !== multiTabState.scanId) return;
        multiTabState.rows.push(row);
        multiTabState.processed += 1;
        multiTabFinalizeDuplicates();
        renderMultiTab();
      }
    }

    const workers = Array.from({ length: Math.min(MultiTabAudit.CONCURRENCY, tabs.length) }, () => worker());
    await Promise.all(workers);
    if (scanId === multiTabState.scanId) multiTabFinalizeDuplicates();
  } catch (_error) {
    if (scanId === multiTabState.scanId) multiTabState.error = 'Could not read the open tab list.';
  } finally {
    if (scanId === multiTabState.scanId) {
      multiTabState.running = false;
      multiTabState.cancelling = false;
      renderMultiTab();
    }
  }
}

function cancelMultiTabAudit() {
  if (!multiTabState.running) return;
  multiTabState.cancelling = true;
  renderMultiTab();
}

function multiTabSummaryCard(panel) {
  const rows = multiTabState.rows;
  const available = rows.filter((row) => row.available).length;
  const unavailable = rows.length - available;
  const critical = rows.reduce((sum, row) => sum + (Number(row.critical) || 0), 0);
  const warnings = rows.reduce((sum, row) => sum + (Number(row.warnings) || 0), 0);
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', 'Open-tab audit summary'));
  const badges = el('div', 'toolbar');
  badges.appendChild(badge(`${multiTabState.processed}/${multiTabState.total || 0} scanned`, multiTabState.running ? 'info' : 'ok'));
  badges.appendChild(badge(`${available} available`, 'ok'));
  if (unavailable) badges.appendChild(badge(`${unavailable} unavailable`, 'warning'));
  if (critical) badges.appendChild(badge(`${critical} critical`, 'critical'));
  if (warnings) badges.appendChild(badge(`${warnings} warnings`, 'warning'));
  card.appendChild(badges);

  if (multiTabState.running && multiTabState.total) {
    const progress = document.createElement('progress');
    progress.max = multiTabState.total;
    progress.value = multiTabState.processed;
    progress.className = 'multi-tab-progress';
    card.appendChild(progress);
    card.appendChild(el('div', 'muted', multiTabState.cancelling ? 'Cancelling after current tab audits finish…' : `Scanning with up to ${MultiTabAudit.CONCURRENCY} concurrent tab audits.`));
  }

  const duplicateLine = el('div', 'multi-tab-duplicate-summary');
  duplicateLine.appendChild(badge(`${multiTabState.duplicates.titles.length} duplicate title groups`, multiTabState.duplicates.titles.length ? 'warning' : 'ok'));
  duplicateLine.appendChild(badge(`${multiTabState.duplicates.descriptions.length} duplicate description groups`, multiTabState.duplicates.descriptions.length ? 'warning' : 'ok'));
  duplicateLine.appendChild(badge(`${multiTabState.duplicates.h1.length} duplicate H1 groups`, multiTabState.duplicates.h1.length ? 'warning' : 'ok'));
  card.appendChild(duplicateLine);
  panel.appendChild(card);
}

function multiTabFilters(panel) {
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', 'Filter and sort'));
  const controls = el('div', 'multi-tab-filter-grid');

  const query = document.createElement('input');
  query.type = 'search';
  query.placeholder = 'Search URL, title, H1, canonical…';
  query.value = multiTabState.query;
  controls.appendChild(query);

  const indexability = document.createElement('select');
  ['All', 'Indexable', 'Noindex', 'Blocked', 'Canonicalized', 'Redirected', 'Error', 'Unknown'].forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'All' ? 'All indexability states' : value;
    option.selected = value === multiTabState.indexability;
    indexability.appendChild(option);
  });
  controls.appendChild(indexability);

  const sort = document.createElement('select');
  [
    ['url', 'Sort: URL'], ['title', 'Sort: Title'], ['statusCode', 'Sort: HTTP status'], ['indexability', 'Sort: Indexability'],
    ['score', 'Sort: Score'], ['issueCount', 'Sort: Issues'], ['critical', 'Sort: Critical'], ['warnings', 'Sort: Warnings'], ['h1', 'Sort: H1'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === multiTabState.sortKey;
    sort.appendChild(option);
  });
  controls.appendChild(sort);

  const direction = document.createElement('select');
  [['asc', 'Ascending'], ['desc', 'Descending']].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === multiTabState.sortDirection;
    direction.appendChild(option);
  });
  controls.appendChild(direction);
  card.appendChild(controls);

  const toggles = el('div', 'toolbar');
  function toggle(label, checked) {
    const node = el('label', 'multi-tab-toggle');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    node.appendChild(input);
    node.appendChild(document.createTextNode(label));
    toggles.appendChild(node);
    return input;
  }
  const issuesOnly = toggle('Issues only', multiTabState.issuesOnly);
  const duplicatesOnly = toggle('Duplicates only', multiTabState.duplicatesOnly);
  const availableOnly = toggle('Available only', multiTabState.availableOnly);

  const apply = el('button', '', 'Apply');
  apply.type = 'button';
  apply.addEventListener('click', () => {
    multiTabState.query = query.value;
    multiTabState.indexability = indexability.value;
    multiTabState.sortKey = sort.value;
    multiTabState.sortDirection = direction.value;
    multiTabState.issuesOnly = issuesOnly.checked;
    multiTabState.duplicatesOnly = duplicatesOnly.checked;
    multiTabState.availableOnly = availableOnly.checked;
    renderMultiTab();
  });
  toggles.appendChild(apply);
  card.appendChild(toggles);
  panel.appendChild(card);
}

function multiTabResultsTable(panel) {
  const rows = multiTabFilteredRows();
  const card = el('div', 'card multi-tab-results-card');
  card.appendChild(el('div', 'card-header', `Results (${rows.length}/${multiTabState.rows.length})`));
  if (!multiTabState.rows.length) {
    card.appendChild(el('div', 'empty', multiTabState.running ? 'Waiting for tab results…' : 'Run Scan open tabs to build a local cross-tab audit.'));
    panel.appendChild(card);
    return;
  }
  if (!rows.length) {
    card.appendChild(el('div', 'empty', 'No rows match the current filters.'));
    panel.appendChild(card);
    return;
  }

  const wrap = el('div', 'multi-tab-table-wrap');
  const table = document.createElement('table');
  table.className = 'multi-tab-table';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['HTTP', 'URL / Title', 'H1', 'Indexability', 'Issues'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);
  table.appendChild(head);
  const body = document.createElement('tbody');

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (!row.available) tr.className = 'multi-tab-unavailable';

    const status = document.createElement('td');
    status.textContent = row.statusCode ? String(row.statusCode) : '—';
    tr.appendChild(status);

    const page = document.createElement('td');
    const url = el('div', 'url multi-tab-url', row.url || '—');
    url.title = row.url || '';
    page.appendChild(url);
    page.appendChild(el('div', '', row.title || row.tabTitle || 'No title'));
    const flags = el('div', 'multi-tab-flags');
    if (row.duplicateTitle) flags.appendChild(badge('duplicate title', 'warning'));
    if (row.duplicateDescription) flags.appendChild(badge('duplicate description', 'warning'));
    if (row.duplicateH1) flags.appendChild(badge('duplicate H1', 'warning'));
    if (!row.available) flags.appendChild(badge('unavailable', 'warning'));
    page.appendChild(flags);
    if (!row.available && row.error) page.appendChild(el('div', 'muted', row.error));
    tr.appendChild(page);

    const h1 = document.createElement('td');
    h1.textContent = row.h1 || '—';
    if (row.h1Count > 1) h1.appendChild(el('div', 'muted', `${row.h1Count} H1 elements`));
    tr.appendChild(h1);

    const index = document.createElement('td');
    index.appendChild(badge(row.indexability || 'Unknown', row.indexability === 'Indexable' ? 'ok' : (row.indexability === 'Error' ? 'critical' : 'warning')));
    tr.appendChild(index);

    const issues = document.createElement('td');
    issues.appendChild(el('div', '', String(row.issueCount || 0)));
    if (row.critical) issues.appendChild(el('div', 'muted', `${row.critical} critical`));
    if (row.warnings) issues.appendChild(el('div', 'muted', `${row.warnings} warnings`));
    tr.appendChild(issues);
    body.appendChild(tr);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  card.appendChild(wrap);
  panel.appendChild(card);
}

function renderMultiTab() {
  const panel = document.getElementById('multitab');
  if (!panel) return;
  clear(panel);

  const toolbar = el('div', 'toolbar');
  const scan = el('button', '', multiTabState.running ? 'Scanning…' : 'Scan open tabs');
  scan.type = 'button';
  scan.disabled = multiTabState.running;
  scan.addEventListener('click', () => runMultiTabAudit().catch(() => {}));
  toolbar.appendChild(scan);
  if (multiTabState.running) {
    const cancel = el('button', '', multiTabState.cancelling ? 'Cancelling…' : 'Cancel');
    cancel.type = 'button';
    cancel.disabled = multiTabState.cancelling;
    cancel.addEventListener('click', cancelMultiTabAudit);
    toolbar.appendChild(cancel);
  }
  if (multiTabState.rows.length) {
    const csv = el('button', '', 'Export CSV');
    csv.type = 'button';
    csv.addEventListener('click', () => multiTabDownload('seo-inspector-open-tabs.csv', 'text/csv;charset=utf-8', MultiTabAudit.toCsv(multiTabState.rows)));
    toolbar.appendChild(csv);
    const json = el('button', '', 'Export JSON');
    json.type = 'button';
    json.addEventListener('click', () => multiTabDownload('seo-inspector-open-tabs.json', 'application/json', MultiTabAudit.toJson(multiTabState.rows, multiTabState.duplicates)));
    toolbar.appendChild(json);
  }
  panel.appendChild(toolbar);

  const intro = el('div', 'card');
  intro.appendChild(el('div', 'card-header', 'Multi-tab audit'));
  intro.appendChild(el('div', 'serp-note', `Audits up to ${MultiTabAudit.MAX_TABS} already-open HTTP/HTTPS tabs using their existing extension content scripts. It does not crawl or refetch those pages. Tabs opened before the extension was loaded may need one reload.`));
  panel.appendChild(intro);

  if (multiTabState.error) panel.appendChild(el('div', 'issue critical', multiTabState.error));
  multiTabSummaryCard(panel);
  if (multiTabState.rows.length) multiTabFilters(panel);
  multiTabResultsTable(panel);
}
