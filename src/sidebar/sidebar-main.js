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

const panelDirty = new Set(Object.keys(PANEL_RENDERERS));
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

function renderPanel(name, options) {
  const renderers = PANEL_RENDERERS[name];
  if (!renderers) return false;
  const opts = options || {};
  if (!opts.force && !panelDirty.has(name)) return true;

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

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));
document.getElementById('refreshButton').addEventListener('click', () => { refreshSafely('refresh-button'); });

document.getElementById('copyIssuesButton').addEventListener('click', async () => {
  if (!state.report) return;
  const lines = state.report.evaluation.issues.map((item) => `[${item.severity.toUpperCase()}] ${item.title}: ${item.message}`);
  await navigator.clipboard.writeText(lines.join('\n')).catch((error) => handleAsyncUiFailure('copy-issues', error));
});

document.getElementById('exportButton').addEventListener('click', () => {
  if (!state.report) return;
  try {
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
  if (typeof state.tabId === 'number') browser.tabs.sendMessage(state.tabId, { type: 'seoInspector.watch', enabled: false }).catch(() => {});
  if (typeof crawlerState !== 'undefined' && crawlerState && crawlerState.running) {
    browser.runtime.sendMessage({ type: 'seoInspector.crawler.cancel', scanId: String(crawlerState.scanId) }).catch(() => {});
  }
});

refreshSafely('startup');
