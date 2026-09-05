'use strict';

const categoryPaginationNetworkState = {
  pageUrl: '',
  checking: false,
  operationId: '',
  checked: 0,
  requested: 0,
  results: new Map(),
  report: null,
  error: '',
};

function categoryAuditForReport(report) {
  if (!report || !report.facts) return null;
  return CategoryPageAudit.inspect(report.facts, report.pageType || null, report.responseMeta || null);
}

function categoryPaginationOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `pagination-${crypto.randomUUID()}`;
  return `pagination-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function syncCategoryPaginationNetwork(pageUrl) {
  const value = String(pageUrl || '');
  if (categoryPaginationNetworkState.pageUrl === value) return;
  if (categoryPaginationNetworkState.operationId) {
    browser.runtime.sendMessage({ type: 'seoInspector.cancelLinks', operationId: categoryPaginationNetworkState.operationId }).catch(() => {});
  }
  categoryPaginationNetworkState.pageUrl = value;
  categoryPaginationNetworkState.checking = false;
  categoryPaginationNetworkState.operationId = '';
  categoryPaginationNetworkState.checked = 0;
  categoryPaginationNetworkState.requested = 0;
  categoryPaginationNetworkState.results = new Map();
  categoryPaginationNetworkState.report = null;
  categoryPaginationNetworkState.error = '';
}

async function runCategoryPaginationCheck(audit, force) {
  if (categoryPaginationNetworkState.checking || !audit || !audit.pagination) return;
  const links = Array.isArray(audit.pagination.links) ? audit.pagination.links : [];
  const urls = links.map((item) => item.href).filter(Boolean);
  if (!urls.length) return;
  categoryPaginationNetworkState.checking = true;
  categoryPaginationNetworkState.operationId = categoryPaginationOperationId();
  categoryPaginationNetworkState.checked = 0;
  categoryPaginationNetworkState.requested = urls.length;
  categoryPaginationNetworkState.results = new Map();
  categoryPaginationNetworkState.report = null;
  categoryPaginationNetworkState.error = '';
  renderCategory();
  try {
    const response = await browser.runtime.sendMessage({
      type: 'seoInspector.checkLinksBounded',
      operationId: categoryPaginationNetworkState.operationId,
      urls,
      force: Boolean(force),
    });
    categoryPaginationNetworkState.report = response || null;
    categoryPaginationNetworkState.checked = Number(response && response.checked) || 0;
    categoryPaginationNetworkState.requested = Number(response && response.requested) || urls.length;
    categoryPaginationNetworkState.results = new Map((response && response.results || []).map((item) => [String(item.url || ''), item]));
  } catch (_error) {
    categoryPaginationNetworkState.error = 'Pagination link status check failed.';
  } finally {
    categoryPaginationNetworkState.checking = false;
    categoryPaginationNetworkState.operationId = '';
    renderCategory();
  }
}

async function cancelCategoryPaginationCheck() {
  if (!categoryPaginationNetworkState.operationId) return;
  await browser.runtime.sendMessage({ type: 'seoInspector.cancelLinks', operationId: categoryPaginationNetworkState.operationId }).catch(() => {});
}

function renderCategoryIssues(panel, audit) {
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Category/listing issues'));
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  if (!issues.length) {
    cardNode.appendChild(el('div', 'empty', 'No category/listing warnings found.'));
  } else {
    issues.forEach((item) => {
      const node = el('div', `issue ${item.severity || 'warning'}`);
      const top = el('div', 'toolbar');
      top.appendChild(badge(String(item.severity || 'warning').toUpperCase(), item.severity || 'warning'));
      top.appendChild(el('strong', '', item.title || item.id || 'Category issue'));
      node.appendChild(top);
      node.appendChild(el('div', 'issue-message', item.message || ''));
      if (Array.isArray(item.refs) && item.refs.length) {
        const actions = el('div', 'issue-actions');
        const button = el('button', '', `Highlight ${item.refs.length} link${item.refs.length === 1 ? '' : 's'}`);
        button.type = 'button';
        button.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: item.refs }).catch(() => {}));
        actions.appendChild(button);
        node.appendChild(actions);
      }
      cardNode.appendChild(node);
    });
  }
  panel.appendChild(cardNode);
}

function renderCategoryParamTable(panel, audit) {
  const params = Array.isArray(audit.facets && audit.facets.currentParams) ? audit.facets.currentParams : [];
  if (!params.length) return;
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Current URL parameters'));
  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['Parameter', 'Class', 'Value'].forEach((value) => header.appendChild(el('th', '', value)));
  head.appendChild(header);
  table.appendChild(head);
  const body = document.createElement('tbody');
  params.forEach((item) => {
    const row = document.createElement('tr');
    row.appendChild(el('td', 'code', item.name));
    row.appendChild(el('td', '', item.kind));
    row.appendChild(el('td', 'code', item.value));
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  cardNode.appendChild(wrap);
  panel.appendChild(cardNode);
}

function categoryPaginationNetworkSummary(audit) {
  return PaginationAudit.summarizeLinkResults(
    audit && audit.pagination ? audit.pagination.links : [],
    Array.from(categoryPaginationNetworkState.results.values()),
  );
}

function renderCategoryPaginationNetwork(panel, audit) {
  const links = Array.isArray(audit && audit.pagination && audit.pagination.links) ? audit.pagination.links : [];
  if (!links.length) return;
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', 'Pagination HTTP check'));
  const toolbar = el('div', 'toolbar');
  const run = el('button', '', categoryPaginationNetworkState.checking ? 'Checking…' : categoryPaginationNetworkState.report ? 'Check again' : 'Check pagination links');
  run.type = 'button';
  run.disabled = categoryPaginationNetworkState.checking;
  run.addEventListener('click', () => runCategoryPaginationCheck(audit, Boolean(categoryPaginationNetworkState.report)).catch(() => {}));
  toolbar.appendChild(run);
  if (categoryPaginationNetworkState.checking) {
    const cancel = el('button', '', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => cancelCategoryPaginationCheck().catch(() => {}));
    toolbar.appendChild(cancel);
  }
  const network = categoryPaginationNetworkSummary(audit);
  if (network.checked) {
    toolbar.appendChild(badge(`${network.checked}/${links.length} checked`, 'ok'));
    toolbar.appendChild(badge(`${network.broken} broken`, network.broken ? 'critical' : 'ok'));
    toolbar.appendChild(badge(`${network.redirect} redirects`, network.redirect ? 'warning' : 'ok'));
    if (network.unknown) toolbar.appendChild(badge(`${network.unknown} unknown`, 'warning'));
  }
  card.appendChild(toolbar);

  if (categoryPaginationNetworkState.checking) {
    const progress = document.createElement('progress');
    progress.max = Math.max(1, categoryPaginationNetworkState.requested || links.length);
    progress.value = Math.min(progress.max, categoryPaginationNetworkState.checked || 0);
    card.appendChild(progress);
    card.appendChild(el('div', 'muted', `${categoryPaginationNetworkState.checked}/${categoryPaginationNetworkState.requested || links.length} checked · reuses the bounded 250-URL / 6-concurrent / 10 s request link checker.`));
  }
  if (categoryPaginationNetworkState.error) card.appendChild(el('div', 'issue critical', categoryPaginationNetworkState.error));
  if (network.brokenRefs.length) {
    const highlight = el('button', '', `Highlight ${network.brokenRefs.length} broken pagination link${network.brokenRefs.length === 1 ? '' : 's'}`);
    highlight.type = 'button';
    highlight.addEventListener('click', () => sendToTab({ type: 'seoInspector.highlight', refs: network.brokenRefs }).catch(() => {}));
    card.appendChild(highlight);
  }

  const badRows = network.rows.filter((row) => row.state === 'broken' || row.state === 'redirect' || row.state === 'unknown');
  if (badRows.length) {
    const wrap = el('div', 'table-wrap');
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    ['State', 'HTTP', 'Label', 'URL'].forEach((value) => header.appendChild(el('th', '', value)));
    head.appendChild(header);
    table.appendChild(head);
    const body = document.createElement('tbody');
    badRows.slice(0, 100).forEach((item) => {
      const row = document.createElement('tr');
      row.appendChild(el('td', '', item.state));
      row.appendChild(el('td', '', item.status || item.error || '—'));
      row.appendChild(el('td', '', item.label || '—'));
      row.appendChild(el('td', 'code cell-url', item.href));
      body.appendChild(row);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    card.appendChild(wrap);
  } else if (categoryPaginationNetworkState.report && network.checked) {
    card.appendChild(el('div', 'empty', 'No broken, redirecting, or unknown pagination targets found.'));
  }
  panel.appendChild(card);
}

function renderCategory() {
  const panel = document.getElementById('category');
  if (!panel) return;
  clear(panel);
  if (!state.report) {
    panel.appendChild(el('div', 'empty', 'No audit data.'));
    return;
  }

  syncCategoryPaginationNetwork(state.report.facts && state.report.facts.url);
  const audit = categoryAuditForReport(state.report);
  if (!audit || !audit.applicable) {
    const type = state.report.pageType ? PageType.display(state.report.pageType) : 'Unknown';
    panel.appendChild(el('div', 'empty', `Category/listing checks are not applicable to this page. Detected page type: ${type}.`));
    return;
  }

  const summary = el('div', 'card');
  summary.appendChild(el('div', 'card-header', 'Category/listing audit'));
  const toolbar = el('div', 'toolbar');
  toolbar.appendChild(badge(`${audit.summary.critical} critical`, audit.summary.critical ? 'critical' : 'ok'));
  toolbar.appendChild(badge(`${audit.summary.warning} warnings`, audit.summary.warning ? 'warning' : 'ok'));
  toolbar.appendChild(badge(`${audit.listing.itemCount} listing items`, audit.listing.itemCount ? 'ok' : 'warning'));
  summary.appendChild(toolbar);
  addRow(summary, 'Visible words', audit.listing.wordCount || 0);
  addRow(summary, 'ItemList JSON-LD', audit.listing.itemListSchemaCount || 0);
  addRow(summary, 'ItemList microdata', audit.listing.itemListMicrodataCount || 0);
  addRow(summary, 'Product microdata', audit.listing.productMicrodataCount || 0);
  panel.appendChild(summary);

  const canonical = el('div', 'card');
  canonical.appendChild(el('div', 'card-header', 'Canonical'));
  addRow(canonical, 'Current URL', audit.canonical.currentUrl || '—', 'code');
  addRow(canonical, 'Canonical', audit.canonical.canonical || '—', 'code');
  addRow(canonical, 'Canonical state', audit.canonical.self ? 'Self canonical' : 'Different / missing');
  addRow(canonical, 'Clean base URL', audit.canonical.cleanBase || '—', 'code');
  panel.appendChild(canonical);

  const facets = el('div', 'card');
  facets.appendChild(el('div', 'card-header', 'Faceted navigation'));
  addRow(facets, 'Detected', audit.facets.detected ? 'Yes' : 'No');
  addRow(facets, 'Parameterized URL', audit.facets.parameterized ? 'Yes' : 'No');
  addRow(facets, 'Filter parameters', audit.facets.filterParams.map((item) => item.name).join(', ') || 'None');
  addRow(facets, 'Sort parameters', audit.facets.sortParams.map((item) => item.name).join(', ') || 'None');
  addRow(facets, 'Tracking/session parameters', audit.facets.trackingParams.concat(audit.facets.sessionParams).map((item) => item.name).join(', ') || 'None');
  addRow(facets, 'Meta robots', audit.indexability.metaRobots.join(' | ') || 'None');
  addRow(facets, 'X-Robots-Tag', audit.indexability.xRobotsTag.join(' | ') || 'None');
  addRow(facets, 'Effective noindex', audit.indexability.noindex ? 'Yes' : 'No');
  addRow(facets, 'Parameterized internal links', audit.facets.internalParameterizedLinkCount || 0);
  panel.appendChild(facets);

  const pagination = el('div', 'card');
  pagination.appendChild(el('div', 'card-header', 'Pagination'));
  addRow(pagination, 'Detected', audit.pagination.detected ? 'Yes' : 'No');
  addRow(pagination, 'Current page', audit.pagination.pageNumber || 1);
  addRow(pagination, 'rel=prev', audit.pagination.relPrev || '—', 'code');
  addRow(pagination, 'rel=next', audit.pagination.relNext || '—', 'code');
  addRow(pagination, 'Pagination links', audit.pagination.internalLinkCount || 0);
  panel.appendChild(pagination);

  renderCategoryPaginationNetwork(panel, audit);
  renderCategoryParamTable(panel, audit);
  renderCategoryIssues(panel, audit);
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'seoInspector.linkCheckProgress') return undefined;
  if (!categoryPaginationNetworkState.checking || message.operationId !== categoryPaginationNetworkState.operationId) return undefined;
  categoryPaginationNetworkState.checked = Number(message.checked) || 0;
  categoryPaginationNetworkState.requested = Number(message.requested) || categoryPaginationNetworkState.requested;
  if (message.result && message.result.url) categoryPaginationNetworkState.results.set(String(message.result.url), message.result);
  if (categoryPaginationNetworkState.checked === categoryPaginationNetworkState.requested || categoryPaginationNetworkState.checked % 3 === 0) renderCategory();
  return undefined;
});

window.addEventListener('unload', () => {
  if (!categoryPaginationNetworkState.operationId) return;
  browser.runtime.sendMessage({ type: 'seoInspector.cancelLinks', operationId: categoryPaginationNetworkState.operationId }).catch(() => {});
});
