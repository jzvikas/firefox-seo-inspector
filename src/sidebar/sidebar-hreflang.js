'use strict';

const hreflangState = {
  pageUrl: '',
  response: null,
  operationId: null,
  checking: false,
  error: null,
};

function resetHreflangState(pageUrl) {
  hreflangState.pageUrl = pageUrl || '';
  hreflangState.response = null;
  hreflangState.operationId = null;
  hreflangState.checking = false;
  hreflangState.error = null;
}

function hreflangNetworkMap() {
  const map = new Map();
  const results = hreflangState.response && Array.isArray(hreflangState.response.results)
    ? hreflangState.response.results
    : [];
  for (const item of results) map.set(HreflangAudit.normalizeUrl(item.requestedUrl || item.url), item);
  return map;
}

function hreflangStatusText(target) {
  if (!target) return 'Not checked';
  if (target.error) return target.error;
  return target.status ? `${target.status}${target.statusText ? ` ${target.statusText}` : ''}` : 'Unknown';
}

function renderHreflangLocalIssues(panel, local) {
  const node = el('div', 'card');
  node.appendChild(el('div', 'card-header', 'Local hreflang checks'));
  if (!local.issues.length) node.appendChild(el('div', 'empty', 'No local hreflang issues found.'));
  else {
    local.issues.forEach((item) => {
      const issue = el('div', `issue ${item.severity || 'warning'}`);
      issue.appendChild(el('div', 'issue-title', item.message));
      node.appendChild(issue);
    });
  }
  panel.appendChild(node);
}

async function startHreflangValidation(entries, currentUrl) {
  if (hreflangState.checking) return;
  hreflangState.checking = true;
  hreflangState.error = null;
  hreflangState.operationId = `hreflang-${Date.now()}-${state.tabId || 0}`;
  renderHreflang();
  try {
    hreflangState.response = await browser.runtime.sendMessage({
      type: 'seoInspector.checkHreflang',
      operationId: hreflangState.operationId,
      currentUrl,
      entries: entries.map((item) => ({ lang: item.lang, href: item.href })),
    });
  } catch (_error) {
    hreflangState.error = 'Hreflang target validation failed.';
  } finally {
    hreflangState.checking = false;
    hreflangState.operationId = null;
    renderHreflang();
  }
}

async function cancelHreflangValidation() {
  if (!hreflangState.operationId) return;
  await browser.runtime.sendMessage({ type: 'seoInspector.cancelHreflang', operationId: hreflangState.operationId }).catch(() => {});
}

function renderHreflang() {
  const panel = document.getElementById('hreflang');
  clear(panel);
  if (!state.report) return panel.appendChild(el('div', 'empty', 'No audit data.'));

  const facts = state.report.facts;
  if (hreflangState.pageUrl !== facts.url) resetHreflangState(facts.url);
  const local = HreflangAudit.local(facts.hreflang, facts.url);
  const networkMap = hreflangNetworkMap();
  const full = hreflangState.response
    ? HreflangAudit.analyze(facts.hreflang, facts.url, hreflangState.response.results || [])
    : null;

  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'Hreflang summary'));
  addRow(summary, 'Entries', local.items.length);
  addRow(summary, 'Self-reference', local.hasSelfReference ? 'Yes' : 'Missing');
  addRow(summary, 'x-default', local.hasXDefault ? 'Yes' : 'Missing');
  addRow(summary, 'Local issues', local.issues.length);
  if (full) {
    addRow(summary, 'Target OK', full.counts.ok);
    addRow(summary, 'Target warnings', full.counts.warning);
    addRow(summary, 'Target critical', full.counts.critical);
  }
  panel.appendChild(summary);

  const toolbar = el('div', 'toolbar');
  const checkButton = el('button', '', hreflangState.checking ? 'Checking…' : 'Validate targets');
  checkButton.type = 'button';
  checkButton.disabled = hreflangState.checking || !local.items.length;
  checkButton.addEventListener('click', () => startHreflangValidation(local.items, facts.url));
  toolbar.appendChild(checkButton);
  if (hreflangState.checking) {
    const cancelButton = el('button', '', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => cancelHreflangValidation());
    toolbar.appendChild(cancelButton);
  }
  if (hreflangState.response) {
    const response = hreflangState.response;
    toolbar.appendChild(badge(`${response.checked || 0} checked`, 'ok'));
    if (response.capped) toolbar.appendChild(badge('Target limit reached', 'warning'));
    if (response.timedOut) toolbar.appendChild(badge('Scan timed out', 'warning'));
    if (response.cancelled) toolbar.appendChild(badge('Cancelled', 'warning'));
  }
  panel.appendChild(toolbar);

  if (hreflangState.error) {
    const errorNode = el('div', 'issue critical');
    errorNode.appendChild(el('div', 'issue-title', hreflangState.error));
    panel.appendChild(errorNode);
  }

  renderHreflangLocalIssues(panel, local);

  if (!local.items.length) {
    panel.appendChild(el('div', 'empty', 'No hreflang declarations found.'));
    return;
  }

  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Lang', 'HTTP', 'Redirect', 'Reciprocal', 'Canonical', 'Robots', 'URL'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');

  local.items.forEach((item, index) => {
    const row = document.createElement('tr');
    const network = networkMap.get(item.href) || null;
    const target = full ? full.targets[index] : null;
    row.appendChild(el('td', '', item.normalizedLang || item.lang || '(empty)'));
    row.appendChild(el('td', '', hreflangStatusText(network)));
    row.appendChild(el('td', '', target ? (target.redirected ? 'Yes' : 'No') : '—'));
    row.appendChild(el('td', '', target ? (target.reciprocal ? 'Yes' : 'Missing') : '—'));
    row.appendChild(el('td', '', target ? (target.canonicalMismatch ? 'Mismatch' : (target.canonical ? 'OK' : 'None')) : '—'));
    row.appendChild(el('td', '', target ? (target.noindex ? 'NOINDEX' : 'Indexable') : '—'));
    const urlCell = el('td', 'cell-url code', item.href || '—');
    if (target && target.level !== 'ok') urlCell.classList.add(target.level === 'critical' ? 'serp-metric-bad' : 'serp-metric-bad');
    row.appendChild(urlCell);
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  panel.appendChild(wrap);

  if (full) {
    const problems = el('div', 'card');
    problems.appendChild(el('div', 'card-header', 'Target diagnostics'));
    const flagged = full.targets.filter((item) => item.problems.length);
    if (!flagged.length) problems.appendChild(el('div', 'empty', 'No target hreflang problems detected.'));
    else flagged.forEach((item) => {
      const issue = el('div', `issue ${item.level === 'critical' ? 'critical' : 'warning'}`);
      issue.appendChild(el('div', 'issue-title', `${item.lang || '(empty)'} — ${item.problems.join(', ')}`));
      issue.appendChild(el('div', 'issue-message', item.href));
      problems.appendChild(issue);
    });
    panel.appendChild(problems);
  }
}
