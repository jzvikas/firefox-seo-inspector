'use strict';

const PANEL_RENDERERS = Object.freeze({
  overview: [renderOverview],
  indexability: [renderIndexability],
  performance: [renderPerformance, renderPerformanceHints, renderAssetAudit, renderThirdPartyAudit],
  content: [renderContent],
  security: [renderSecurity],
  serp: [renderSerp],
  hreflang: [renderHreflang],
  issues: [renderIssues],
  headings: [renderHeadings],
  links: [renderLinks],
  images: [renderImagesNetwork],
  product: [renderProduct],
  category: [renderCategory],
  schema: [renderSchema],
  social: [renderSocial],
  compare: [renderCompare],
  rules: [renderRules],
  profiles: [renderProfiles],
  multitab: [renderMultiTab],
  crawler: [renderCrawler],
});

const HEAVY_PANEL_GROUP = Object.freeze({
  performance: 'performance',
  content: 'content',
  security: 'security',
});

const HEAVY_REPORT_FIELDS = Object.freeze([
  'pageContext',
  'performance',
  'performanceHints',
  'assetAudit',
  'thirdPartyAudit',
  'contentAudit',
  'securityAudit',
]);

const panelDirty = new Set(Object.keys(PANEL_RENDERERS));
const heavyAuditUiState = {
  pageUrl: '',
  generation: 0,
  pending: null,
  loadingGroups: [],
  errors: new Map(),
};
let activePanelName = 'overview';

function runtimeErrorInfo(error) {
  if (typeof ContentConnection !== 'undefined' && ContentConnection && typeof ContentConnection.safeError === 'function') {
    return ContentConnection.safeError(error);
  }
  return {
    name: String(error && error.name || 'Error'),
    message: String(error && error.message || error || 'Unknown runtime error').slice(0, 240),
  };
}

function appendRuntimePanelError(section, info) {
  if (!section || section === 'header') return;
  const panel = document.getElementById(section);
  if (!panel) return;
  const node = el('div', 'issue critical');
  node.appendChild(el('div', 'issue-title', 'Inspector UI section failed'));
  node.appendChild(el('div', 'issue-message', `${info.name}: ${info.message || 'Unknown renderer error'}`));
  panel.appendChild(node);
}

function recordRuntimeError(scope, error, options) {
  const info = runtimeErrorInfo(error);
  if (!Array.isArray(state.runtimeErrors)) state.runtimeErrors = [];
  state.runtimeErrors.push({ scope: String(scope || 'runtime'), name: info.name, message: info.message });
  if (state.runtimeErrors.length > 20) state.runtimeErrors.splice(0, state.runtimeErrors.length - 20);
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error(`[SEO Inspector] ${scope || 'runtime'}:`, error);
  }
  if (options && options.panel) appendRuntimePanelError(options.panel, info);
  return info;
}

function safeRender(section, renderer) {
  try {
    renderer();
    return true;
  } catch (error) {
    if (!Array.isArray(state.uiErrors)) state.uiErrors = [];
    const info = recordRuntimeError(`render:${section}`, error, { panel: section });
    state.uiErrors.push({ section, name: info.name, message: info.message });
    return false;
  }
}

function uiErrorSuffix() {
  const count = Array.isArray(state.uiErrors) ? state.uiErrors.length : 0;
  if (!count) return '';
  return `${count} Inspector UI section${count === 1 ? '' : 's'} failed`;
}

function refreshUiErrorStatus() {
  const suffix = uiErrorSuffix();
  if (state.report) {
    safeRender('header', renderHeader);
    if (suffix) statusCounts.textContent = statusCounts.textContent ? `${statusCounts.textContent} · ${suffix}` : suffix;
    return;
  }
  if (suffix) setStatus('Inspector UI error', `${suffix}. Other sections remain available; use Refresh to retry.`);
}

function markPanelDirty(name) {
  if (Object.prototype.hasOwnProperty.call(PANEL_RENDERERS, name)) panelDirty.add(name);
}

function markAllPanelsDirty() {
  Object.keys(PANEL_RENDERERS).forEach((name) => panelDirty.add(name));
}

function reportPageUrl() {
  return state.report && state.report.facts ? String(state.report.facts.url || '') : '';
}

function resetHeavyAuditUiState() {
  heavyAuditUiState.pageUrl = '';
  heavyAuditUiState.generation += 1;
  heavyAuditUiState.pending = null;
  heavyAuditUiState.loadingGroups = [];
  heavyAuditUiState.errors = new Map();
}

function syncHeavyAuditUiState() {
  const url = reportPageUrl();
  if (heavyAuditUiState.pageUrl === url) return;
  heavyAuditUiState.pageUrl = url;
  heavyAuditUiState.generation += 1;
  heavyAuditUiState.pending = null;
  heavyAuditUiState.loadingGroups = [];
  heavyAuditUiState.errors = new Map();
}

function heavyGroupReady(group) {
  if (!state.report) return false;
  if (group === 'performance') {
    return Boolean(state.report.performance && state.report.performanceHints && state.report.assetAudit && state.report.thirdPartyAudit);
  }
  if (group === 'content') return Boolean(state.report.contentAudit);
  if (group === 'security') return Boolean(state.report.securityAudit);
  return true;
}

function normalizedHeavyUiGroups(groups) {
  const allowed = new Set(['performance', 'content', 'security']);
  return Array.from(new Set((Array.isArray(groups) ? groups : [groups])
    .map((value) => String(value || '').toLowerCase())
    .filter((value) => allowed.has(value))));
}

function mergeHeavyAuditResult(result) {
  if (!result || !state.report) return;
  HEAVY_REPORT_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(result, field) && result[field] !== undefined) state.report[field] = result[field];
  });
  state.report.heavyAudit = Object.assign({}, state.report.heavyAudit || {}, result.groups || {});
}

function renderHeavyPanelState(name, group) {
  const panel = document.getElementById(name);
  if (!panel) return;
  clear(panel);
  const error = heavyAuditUiState.errors.get(group);
  if (error) {
    const node = el('div', 'issue warning');
    node.appendChild(el('div', 'issue-title', `${group[0].toUpperCase()}${group.slice(1)} inspection did not complete`));
    node.appendChild(el('div', 'issue-message', error));
    const retry = el('button', '', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', () => {
      heavyAuditUiState.errors.delete(group);
      ensureHeavyAuditGroups([group]).catch(() => {});
      renderHeavyPanelState(name, group);
    });
    node.appendChild(retry);
    panel.appendChild(node);
    return;
  }
  panel.appendChild(el('div', 'empty', `Loading ${group} inspection on demand…`));
  panel.appendChild(el('div', 'muted', 'Heavy local DOM/resource checks run only when this workflow is opened or explicitly needed by export/comparison.'));
}

async function ensureHeavyAuditGroups(groups) {
  if (!state.report || typeof state.tabId !== 'number') return null;
  syncHeavyAuditUiState();
  const requested = normalizedHeavyUiGroups(groups);
  let missing = requested.filter((group) => !heavyGroupReady(group));
  if (!missing.length) return state.report;

  if (heavyAuditUiState.pending) {
    await heavyAuditUiState.pending.catch(() => null);
    missing = requested.filter((group) => !heavyGroupReady(group));
    if (!missing.length) return state.report;
  }

  const generation = heavyAuditUiState.generation;
  const tabId = state.tabId;
  const pageUrl = reportPageUrl();
  heavyAuditUiState.loadingGroups = missing.slice();
  missing.forEach((group) => heavyAuditUiState.errors.delete(group));

  const operation = browser.tabs.sendMessage(tabId, {
    type: 'seoInspector.analyzeHeavy',
    groups: missing,
  });
  heavyAuditUiState.pending = operation;

  try {
    const result = await operation;
    const stillCurrent = generation === heavyAuditUiState.generation
      && state.tabId === tabId
      && reportPageUrl() === pageUrl;
    if (!stillCurrent) return null;
    if (!result || String(result.url || '') !== pageUrl) throw new Error('Heavy audit returned stale page data.');
    mergeHeavyAuditResult(result);
    missing.forEach((group) => heavyAuditUiState.errors.delete(group));
    missing.forEach((group) => {
      const panel = Object.keys(HEAVY_PANEL_GROUP).find((name) => HEAVY_PANEL_GROUP[name] === group);
      if (panel) markPanelDirty(panel);
    });
    if (HEAVY_PANEL_GROUP[activePanelName] && missing.includes(HEAVY_PANEL_GROUP[activePanelName])) {
      renderPanel(activePanelName, { force: true });
    }
    return state.report;
  } catch (error) {
    const stillCurrent = generation === heavyAuditUiState.generation
      && state.tabId === tabId
      && reportPageUrl() === pageUrl;
    if (stillCurrent) {
      const info = runtimeErrorInfo(error);
      missing.forEach((group) => heavyAuditUiState.errors.set(group, info.message || 'Heavy local inspection failed.'));
      if (HEAVY_PANEL_GROUP[activePanelName] && missing.includes(HEAVY_PANEL_GROUP[activePanelName])) {
        renderHeavyPanelState(activePanelName, HEAVY_PANEL_GROUP[activePanelName]);
      }
    }
    throw error;
  } finally {
    if (generation === heavyAuditUiState.generation && heavyAuditUiState.pending === operation) {
      heavyAuditUiState.pending = null;
      heavyAuditUiState.loadingGroups = [];
    }
  }
}

function renderPanel(name, options) {
  const renderers = PANEL_RENDERERS[name];
  if (!renderers) return false;
  const opts = options || {};
  if (!opts.force && !panelDirty.has(name)) return true;

  const heavyGroup = HEAVY_PANEL_GROUP[name];
  if (heavyGroup && !heavyGroupReady(heavyGroup)) {
    syncHeavyAuditUiState();
    renderHeavyPanelState(name, heavyGroup);
    if (!heavyAuditUiState.errors.has(heavyGroup)) ensureHeavyAuditGroups([heavyGroup]).catch(() => {});
    return true;
  }

  if (!Array.isArray(state.uiErrors)) state.uiErrors = [];
  state.uiErrors = state.uiErrors.filter((item) => item && item.section !== name);

  let ok = true;
  renderers.forEach((renderer) => {
    if (!safeRender(name, renderer)) ok = false;
  });
  if (ok) panelDirty.delete(name);
  else panelDirty.add(name);

  if (!opts.skipStatusRefresh) refreshUiErrorStatus();
  return ok;
}

function renderAll() {
  state.uiErrors = [];
  markAllPanelsDirty();
  safeRender('header', renderHeader);
  renderPanel(activePanelName, { force: true, skipStatusRefresh: true });

  const suffix = uiErrorSuffix();
  if (suffix) {
    if (state.report) statusCounts.textContent = statusCounts.textContent ? `${statusCounts.textContent} · ${suffix}` : suffix;
    else setStatus('Inspector UI error', `${suffix}. Other sections remain available; use Refresh to retry.`);
  }
}

function activateTab(name) {
  if (!Object.prototype.hasOwnProperty.call(PANEL_RENDERERS, name)) return;
  activePanelName = name;
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === name));
  renderPanel(name);
}

function handleAsyncUiFailure(scope, error) {
  const info = recordRuntimeError(scope, error);
  setStatus('Inspector runtime error', `${info.name}: ${info.message || 'A UI task failed.'} Use Refresh to retry.`);
}

function refreshSafely(scope) {
  return Promise.resolve()
    .then(() => refresh())
    .catch((error) => handleAsyncUiFailure(scope || 'refresh', error));
}

function cancelBackgroundOperation(type, operationId) {
  if (!operationId) return;
  browser.runtime.sendMessage({ type, operationId: String(operationId) }).catch(() => {});
}

function releasePageScopedState() {
  resetHeavyAuditUiState();

  if (typeof linkCheckState !== 'undefined' && linkCheckState) {
    cancelBackgroundOperation('seoInspector.cancelLinks', linkCheckState.operationId);
    linkCheckState.pageUrl = '';
    linkCheckState.checking = false;
    linkCheckState.operationId = null;
    linkCheckState.report = null;
    linkCheckState.error = null;
    linkCheckState.progressChecked = 0;
    linkCheckState.progressRequested = 0;
    if (typeof LINK_RENDER_BATCH !== 'undefined') linkCheckState.visibleLimit = LINK_RENDER_BATCH;
  }

  if (typeof imageNetworkState !== 'undefined' && imageNetworkState) {
    cancelBackgroundOperation('seoInspector.cancelImages', imageNetworkState.operationId);
    if (typeof resetImageNetworkState === 'function') resetImageNetworkState('');
  }

  if (typeof hreflangState !== 'undefined' && hreflangState) {
    cancelBackgroundOperation('seoInspector.cancelHreflang', hreflangState.operationId);
    if (typeof resetHreflangState === 'function') resetHreflangState('');
  }

  if (typeof categoryPaginationNetworkState !== 'undefined' && categoryPaginationNetworkState) {
    cancelBackgroundOperation('seoInspector.cancelLinks', categoryPaginationNetworkState.operationId);
    categoryPaginationNetworkState.pageUrl = '';
    categoryPaginationNetworkState.checking = false;
    categoryPaginationNetworkState.operationId = '';
    categoryPaginationNetworkState.checked = 0;
    categoryPaginationNetworkState.requested = 0;
    categoryPaginationNetworkState.results = new Map();
    categoryPaginationNetworkState.report = null;
    categoryPaginationNetworkState.error = '';
  }

  if (typeof canonicalChainState !== 'undefined' && canonicalChainState) {
    cancelBackgroundOperation('seoInspector.cancelCanonicalChain', canonicalChainState.operationId);
    canonicalChainState.pageUrl = '';
    canonicalChainState.canonicalUrl = '';
    canonicalChainState.report = null;
    canonicalChainState.checking = false;
    canonicalChainState.operationId = null;
    canonicalChainState.error = null;
  }

  if (typeof sitemapMembershipState !== 'undefined' && sitemapMembershipState) {
    cancelBackgroundOperation('seoInspector.cancelSitemapMembership', sitemapMembershipState.operationId);
    sitemapMembershipState.pageUrl = '';
    sitemapMembershipState.canonicalUrl = '';
    sitemapMembershipState.report = null;
    sitemapMembershipState.checking = false;
    sitemapMembershipState.operationId = null;
    sitemapMembershipState.error = null;
  }

  if (typeof rawSourceUiState !== 'undefined' && rawSourceUiState) {
    const rawOperationId = rawSourceUiState.operationId;
    const rawTabId = rawSourceUiState.tabId;
    if (rawOperationId && typeof rawTabId === 'number') {
      browser.tabs.sendMessage(rawTabId, { type: 'seoInspector.cancelRaw', operationId: rawOperationId }).catch(() => {});
    }
    rawSourceUiState.loading = false;
    rawSourceUiState.operationId = '';
    rawSourceUiState.tabId = null;
    rawSourceUiState.pageUrl = '';
    rawSourceUiState.error = '';
  }

  if (typeof pageCompareState !== 'undefined' && pageCompareState) {
    if (pageCompareState.loadingMode === 'url') {
      cancelBackgroundOperation('seoInspector.cancelComparePages', pageCompareState.operationId);
    }
    pageCompareState.loading = false;
    pageCompareState.loadingMode = '';
    pageCompareState.operationId = '';
    if (pageCompareState.mode === 'tab') {
      pageCompareState.result = null;
      pageCompareState.leftLabel = '';
      pageCompareState.rightLabel = '';
      pageCompareState.mode = '';
    }
  }
}

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));
document.getElementById('refreshButton').addEventListener('click', () => { refreshSafely('refresh-button'); });

document.getElementById('copyIssuesButton').addEventListener('click', async () => {
  if (!state.report) return;
  const lines = state.report.evaluation.issues.map((item) => `[${item.severity.toUpperCase()}] ${item.title}: ${item.message}`);
  await navigator.clipboard.writeText(lines.join('\n')).catch((error) => handleAsyncUiFailure('copy-issues', error));
});

document.getElementById('exportButton').addEventListener('click', async () => {
  if (!state.report) return;
  try {
    await ensureHeavyAuditGroups(['performance', 'content', 'security']);
    const payload = JSON.stringify(state.report, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'seo-inspector-report.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    handleAsyncUiFailure('export-report', error);
  }
});

browser.tabs.onActivated.addListener(() => { refreshSafely('tab-activated'); });
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === state.tabId && (changeInfo.status === 'complete' || changeInfo.url)) refreshSafely('tab-updated');
});
browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== state.tabId) return;
  releasePageScopedState();
  state.report = null;
  state.tabId = null;
  markAllPanelsDirty();
  refreshSafely('tab-removed');
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'seoInspector.pageChanged' && sender && sender.tab && sender.tab.id === state.tabId) {
    refreshSafely('page-changed');
  }
});

window.addEventListener('error', (event) => {
  const error = event && event.error ? event.error : new Error(event && event.message ? event.message : 'Unhandled UI error');
  handleAsyncUiFailure('window-error', error);
});

window.addEventListener('unhandledrejection', (event) => {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  handleAsyncUiFailure('unhandled-rejection', event ? event.reason : new Error('Unhandled promise rejection'));
});

window.addEventListener('unload', () => {
  releasePageScopedState();
  if (typeof state.tabId === 'number') browser.tabs.sendMessage(state.tabId, { type: 'seoInspector.watch', enabled: false }).catch(() => {});
  if (typeof crawlerState !== 'undefined' && crawlerState && crawlerState.running) {
    browser.runtime.sendMessage({ type: 'seoInspector.crawler.cancel', scanId: String(crawlerState.scanId) }).catch(() => {});
  }
});

refreshSafely('startup');
