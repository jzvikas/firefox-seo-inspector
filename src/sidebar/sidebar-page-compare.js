'use strict';

const pageCompareState = {
  tabsLoaded: false,
  tabsLoading: false,
  tabs: [],
  sourceTabId: null,
  selectedTabId: '',
  urlA: '',
  urlB: '',
  loading: false,
  loadingMode: '',
  operationId: '',
  error: '',
  result: null,
  leftLabel: '',
  rightLabel: '',
  mode: '',
  diffOnly: true,
};

function pageCompareCurrentUrl() {
  return state.report && state.report.facts ? String(state.report.facts.url || '') : '';
}

function pageCompareIsHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

function pageCompareOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `compare-${crypto.randomUUID()}`;
  return `compare-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pageCompareSyncCurrentTab() {
  const tabId = currentActiveTab && typeof currentActiveTab.id === 'number' ? currentActiveTab.id : null;
  if (pageCompareState.sourceTabId === tabId) return;
  pageCompareState.sourceTabId = tabId;
  pageCompareState.tabsLoaded = false;
  pageCompareState.tabs = [];
  pageCompareState.selectedTabId = '';
  if (pageCompareState.mode === 'tab') {
    pageCompareState.result = null;
    pageCompareState.mode = '';
    pageCompareState.error = '';
  }
}

async function refreshComparableTabs() {
  if (pageCompareState.tabsLoading) return;
  pageCompareState.tabsLoading = true;
  try {
    const tabs = await browser.tabs.query({});
    const currentId = currentActiveTab && currentActiveTab.id;
    pageCompareState.tabs = (tabs || [])
      .filter((tab) => tab && tab.id !== currentId && pageCompareIsHttpUrl(tab.url || ''))
      .map((tab) => ({ id: tab.id, title: String(tab.title || ''), url: String(tab.url || ''), windowId: tab.windowId }))
      .sort((a, b) => a.url.localeCompare(b.url));
    if (!pageCompareState.tabs.some((tab) => String(tab.id) === String(pageCompareState.selectedTabId))) {
      pageCompareState.selectedTabId = pageCompareState.tabs.length ? String(pageCompareState.tabs[0].id) : '';
    }
    pageCompareState.tabsLoaded = true;
  } catch (_error) {
    pageCompareState.tabs = [];
    pageCompareState.tabsLoaded = true;
    pageCompareState.error = 'Could not read the list of open HTTP/HTTPS tabs.';
  } finally {
    pageCompareState.tabsLoading = false;
    renderCompare();
  }
}

function pageCompareTabLabel(tab) {
  if (!tab) return 'Open tab';
  const title = String(tab.title || '').trim();
  return title ? `${title} · ${tab.url}` : tab.url;
}

async function runOpenTabComparison(tabId) {
  if (!state.report || pageCompareState.loading) return;
  const numericId = Number(tabId);
  const target = pageCompareState.tabs.find((tab) => Number(tab.id) === numericId);
  if (!target) {
    pageCompareState.error = 'Choose another open HTTP/HTTPS tab first.';
    renderCompare();
    return;
  }

  pageCompareState.loading = true;
  pageCompareState.loadingMode = 'tab';
  pageCompareState.error = '';
  renderCompare();
  try {
    const targetReport = await browser.tabs.sendMessage(numericId, { type: 'seoInspector.analyze' });
    if (!targetReport || !targetReport.facts) throw new Error('no-report');
    pageCompareState.result = PageCompare.compareReports(state.report, targetReport);
    pageCompareState.leftLabel = `Current tab · ${pageCompareCurrentUrl()}`;
    pageCompareState.rightLabel = pageCompareTabLabel(target);
    pageCompareState.mode = 'tab';
  } catch (_error) {
    pageCompareState.result = null;
    pageCompareState.error = 'Could not analyze the selected tab. Reload that page if it was open before the extension was loaded, then try again.';
  } finally {
    pageCompareState.loading = false;
    pageCompareState.loadingMode = '';
    renderCompare();
  }
}

function fetchedCompareError(resource, label) {
  if (!resource) return `${label}: no response was returned.`;
  const reason = String(resource.error || '');
  if (!reason) return '';
  if (reason === 'invalid-url') return `${label}: enter an HTTP or HTTPS URL.`;
  if (reason === 'timeout') return `${label}: request exceeded the 12-second comparison timeout.`;
  if (reason === 'too-large') return `${label}: HTML exceeded the 2 MiB comparison safety limit.`;
  if (reason === 'not-html') return `${label}: response is not HTML/XHTML.`;
  if (reason === 'cancelled') return `${label}: request was cancelled.`;
  return `${label}: page could not be fetched (${reason}).`;
}

function reportFromFetchedCompare(resource) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(resource.text || ''), 'text/html');
  const url = new URL(resource.url || resource.requestedUrl);
  const responseMeta = resource.responseMeta || {
    url: url.href,
    statusCode: Number(resource.status) || 0,
    statusLine: String(resource.statusText || ''),
    xRobotsTag: [],
    contentType: [],
    contentLanguage: [],
    link: [],
    cacheControl: [],
  };
  const securityResponseMeta = resource.securityResponseMeta || null;
  const facts = PageExtractor.extract(doc, url, { performance: null });
  const evaluation = SeoCore.evaluateFacts(facts, responseMeta);
  evaluation.indexability = Indexability.analyze(facts, responseMeta);
  const securityAudit = SecurityAudit.collect(doc, {
    pageUrl: facts.url,
    responseMeta: securityResponseMeta,
    performance: null,
    assetAudit: null,
  });
  return { facts, evaluation, responseMeta, securityResponseMeta, securityAudit };
}

async function cancelUrlComparison() {
  const operationId = pageCompareState.operationId;
  if (!pageCompareState.loading || pageCompareState.loadingMode !== 'url' || !operationId) return;
  try {
    await browser.runtime.sendMessage({ type: 'seoInspector.cancelComparePages', operationId });
  } catch (_error) {
    pageCompareState.error = 'Could not cancel the URL comparison operation.';
    pageCompareState.loading = false;
    pageCompareState.loadingMode = '';
    pageCompareState.operationId = '';
    renderCompare();
  }
}

async function runUrlComparison(urlA, urlB) {
  if (pageCompareState.loading) return;
  pageCompareState.urlA = String(urlA || '').trim();
  pageCompareState.urlB = String(urlB || '').trim();
  if (!pageCompareIsHttpUrl(pageCompareState.urlA) || !pageCompareIsHttpUrl(pageCompareState.urlB)) {
    pageCompareState.error = 'Both comparison values must be HTTP or HTTPS URLs.';
    renderCompare();
    return;
  }

  const operationId = pageCompareOperationId();
  pageCompareState.loading = true;
  pageCompareState.loadingMode = 'url';
  pageCompareState.operationId = operationId;
  pageCompareState.error = '';
  renderCompare();
  try {
    const operation = await browser.runtime.sendMessage({
      type: 'seoInspector.fetchComparePages',
      operationId,
      urlA: pageCompareState.urlA,
      urlB: pageCompareState.urlB,
    });
    if (pageCompareState.operationId !== operationId) return;
    if (!operation) throw new Error('URL comparison returned no response.');
    if (operation.timedOut) throw new Error('URL comparison exceeded the 15-second scan timeout.');
    if (operation.cancelled) throw new Error('URL comparison was cancelled.');
    const leftResource = operation.left;
    const rightResource = operation.right;
    const leftError = fetchedCompareError(leftResource, 'URL A');
    const rightError = fetchedCompareError(rightResource, 'URL B');
    if (leftError || rightError) throw new Error([leftError, rightError].filter(Boolean).join(' '));
    const leftReport = reportFromFetchedCompare(leftResource);
    const rightReport = reportFromFetchedCompare(rightResource);
    pageCompareState.result = PageCompare.compareReports(leftReport, rightReport);
    pageCompareState.leftLabel = `URL A · ${leftResource.url || pageCompareState.urlA}`;
    pageCompareState.rightLabel = `URL B · ${rightResource.url || pageCompareState.urlB}`;
    pageCompareState.mode = 'url';
  } catch (error) {
    if (pageCompareState.operationId === operationId) {
      pageCompareState.result = null;
      pageCompareState.error = error && error.message ? error.message : 'URL comparison failed.';
    }
  } finally {
    if (pageCompareState.operationId === operationId) {
      pageCompareState.loading = false;
      pageCompareState.loadingMode = '';
      pageCompareState.operationId = '';
      renderCompare();
    }
  }
}

function clearPageComparison() {
  pageCompareState.result = null;
  pageCompareState.error = '';
  pageCompareState.leftLabel = '';
  pageCompareState.rightLabel = '';
  pageCompareState.mode = '';
  renderCompare();
}

function appendOpenTabCompareControls(cardNode) {
  cardNode.appendChild(el('div', 'card-header', 'Current tab vs another open tab'));
  const toolbar = el('div', 'toolbar');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Open tab to compare');

  if (pageCompareState.tabsLoading && !pageCompareState.tabsLoaded) {
    const option = document.createElement('option');
    option.textContent = 'Loading open tabs…';
    option.value = '';
    select.appendChild(option);
    select.disabled = true;
  } else if (!pageCompareState.tabs.length) {
    const option = document.createElement('option');
    option.textContent = 'No other HTTP/HTTPS tabs found';
    option.value = '';
    select.appendChild(option);
    select.disabled = true;
  } else {
    pageCompareState.tabs.forEach((tab) => {
      const option = document.createElement('option');
      option.value = String(tab.id);
      option.textContent = pageCompareTabLabel(tab);
      option.selected = option.value === String(pageCompareState.selectedTabId);
      select.appendChild(option);
    });
    select.addEventListener('change', () => { pageCompareState.selectedTabId = select.value; });
  }
  toolbar.appendChild(select);

  const compareButton = el('button', '', pageCompareState.loadingMode === 'tab' ? 'Comparing…' : 'Compare tab');
  compareButton.type = 'button';
  compareButton.disabled = pageCompareState.loading || !pageCompareState.tabs.length;
  compareButton.addEventListener('click', () => runOpenTabComparison(select.value).catch(() => {}));
  toolbar.appendChild(compareButton);

  const refreshButton = el('button', '', 'Refresh tab list');
  refreshButton.type = 'button';
  refreshButton.disabled = pageCompareState.tabsLoading || pageCompareState.loading;
  refreshButton.addEventListener('click', () => {
    pageCompareState.tabsLoaded = false;
    refreshComparableTabs().catch(() => {});
  });
  toolbar.appendChild(refreshButton);
  cardNode.appendChild(toolbar);
  cardNode.appendChild(el('div', 'muted', 'Uses the existing content script in the selected open tab. No additional network request is made for tab-to-tab comparison.'));
}

function appendUrlCompareControls(cardNode) {
  cardNode.appendChild(el('div', 'card-header', 'URL A vs URL B'));
  const toolbar = el('div', 'toolbar');
  const inputA = document.createElement('input');
  inputA.type = 'url';
  inputA.placeholder = 'https://example.com/page-a';
  inputA.setAttribute('aria-label', 'Comparison URL A');
  inputA.value = pageCompareState.urlA || pageCompareCurrentUrl();
  inputA.disabled = pageCompareState.loadingMode === 'url';
  toolbar.appendChild(inputA);

  const inputB = document.createElement('input');
  inputB.type = 'url';
  inputB.placeholder = 'https://example.com/page-b';
  inputB.setAttribute('aria-label', 'Comparison URL B');
  inputB.value = pageCompareState.urlB;
  inputB.disabled = pageCompareState.loadingMode === 'url';
  toolbar.appendChild(inputB);

  const isUrlLoading = pageCompareState.loading && pageCompareState.loadingMode === 'url';
  const compareButton = el('button', '', isUrlLoading ? 'Cancel URL comparison' : 'Compare URLs');
  compareButton.type = 'button';
  compareButton.disabled = pageCompareState.loading && !isUrlLoading;
  compareButton.addEventListener('click', () => {
    if (isUrlLoading) cancelUrlComparison().catch(() => {});
    else runUrlComparison(inputA.value, inputB.value).catch(() => {});
  });
  toolbar.appendChild(compareButton);
  cardNode.appendChild(toolbar);
  cardNode.appendChild(el('div', 'muted', 'Explicit raw-HTML comparison · max 2 MiB per URL · 12-second per-request timeout · 15-second scan timeout · cancellable · credentials omitted · no referrer. Redirect final URLs and HTTP error pages are retained for comparison.'));
}

function appendPageCompareResult(panel) {
  if (!pageCompareState.result && !pageCompareState.error) return;
  const cardNode = el('div', 'card');
  cardNode.appendChild(el('div', 'card-header', 'Page comparison result'));

  if (pageCompareState.error) {
    const issue = el('div', pageCompareState.error.includes('cancelled') ? 'issue info' : 'issue critical');
    issue.appendChild(el('div', 'issue-message', pageCompareState.error));
    cardNode.appendChild(issue);
  }

  if (!pageCompareState.result) {
    panel.appendChild(cardNode);
    return;
  }

  const result = pageCompareState.result;
  const controls = el('div', 'toolbar');
  controls.appendChild(badge(`${result.summary.changed} different`, result.summary.changed ? 'warning' : 'ok'));
  controls.appendChild(badge(`${result.summary.equal} equal`, 'ok'));

  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = pageCompareState.diffOnly;
  checkbox.addEventListener('change', () => {
    pageCompareState.diffOnly = checkbox.checked;
    renderCompare();
  });
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(' Diff only'));
  controls.appendChild(label);

  const clearButton = el('button', '', 'Clear comparison');
  clearButton.type = 'button';
  clearButton.addEventListener('click', clearPageComparison);
  controls.appendChild(clearButton);
  cardNode.appendChild(controls);
  cardNode.appendChild(el('div', 'muted', `${pageCompareState.leftLabel}  ↔  ${pageCompareState.rightLabel}`));

  const rows = pageCompareState.diffOnly ? result.changed : result.rows;
  if (!rows.length) {
    cardNode.appendChild(el('div', 'empty', 'No differences in the compared fields. Turn off “Diff only” to inspect equal rows.'));
    panel.appendChild(cardNode);
    return;
  }

  const wrap = el('div', 'table-wrap');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const hrow = document.createElement('tr');
  ['Category', 'Field', 'A', 'B', 'State'].forEach((value) => hrow.appendChild(el('th', '', value)));
  head.appendChild(hrow);
  table.appendChild(head);
  const body = document.createElement('tbody');
  rows.forEach((item) => {
    const row = document.createElement('tr');
    row.appendChild(el('td', '', item.category));
    row.appendChild(el('td', '', item.field));
    row.appendChild(el('td', '', String(item.leftDisplay || '—').replace(/\n/g, ' · ')));
    row.appendChild(el('td', '', String(item.rightDisplay || '—').replace(/\n/g, ' · ')));
    const stateCell = document.createElement('td');
    stateCell.appendChild(badge(item.equal ? 'equal' : 'different', item.equal ? 'ok' : 'warning'));
    row.appendChild(stateCell);
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  cardNode.appendChild(wrap);
  panel.appendChild(cardNode);
}

function appendPageComparison(panel) {
  pageCompareSyncCurrentTab();
  if (!pageCompareState.tabsLoaded && !pageCompareState.tabsLoading) refreshComparableTabs().catch(() => {});

  const tabCard = el('div', 'card');
  appendOpenTabCompareControls(tabCard);
  panel.appendChild(tabCard);

  const urlCard = el('div', 'card');
  appendUrlCompareControls(urlCard);
  panel.appendChild(urlCard);

  appendPageCompareResult(panel);
}
