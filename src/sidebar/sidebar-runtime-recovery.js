'use strict';

function resetRefreshState() {
  if (typeof releasePageScopedState === 'function') releasePageScopedState();
  state.rawReport = null;
  state.rawDiff = null;
  state.indexabilityRawDiff = undefined;
  state.linkResults = new Map();
  state.robotsReport = null;
  state.sitemapReport = null;
  state.sitemapChecking = false;
  state.sitemapOperationId = null;
  state.connection = null;
  state.lastRuntimeError = null;
}

function renderNoReportStatus(title, detail) {
  state.report = null;
  try { renderAll(); } catch (_error) {}
  setStatus(title, detail);
}

function beginRefreshGeneration() {
  const next = (Number(state.refreshGeneration) || 0) + 1;
  state.refreshGeneration = next;
  return next;
}

function refreshIsCurrent(generation) {
  return Number(state.refreshGeneration) === Number(generation);
}

function auditFailureDetail(info) {
  const diagnostic = info && info.message
    ? `${info.name || 'Error'}: ${info.message}`
    : (info && info.name ? String(info.name) : 'Unknown runtime error');
  return `The page connection is active, but the audit did not complete. Local diagnostic: ${diagnostic}. Use Refresh; if it repeats, this is an Inspector runtime error rather than a page reload issue.`;
}

refresh = async function refreshWithContentRecovery() {
  const generation = beginRefreshGeneration();
  setStatus('Analyzing…', '');
  resetRefreshState();

  let tab = null;
  try {
    tab = await activeTab();
  } catch (error) {
    if (!refreshIsCurrent(generation)) return;
    state.tabId = null;
    state.lastRuntimeError = ContentConnection.safeError(error);
    renderNoReportStatus('Tab access failed', 'The Inspector could not read the active browser tab. Try reopening the Inspector window.');
    return;
  }
  if (!refreshIsCurrent(generation)) return;

  state.tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  pageUrl.textContent = tab && tab.url ? tab.url : '';
  pageUrl.title = tab && tab.url ? tab.url : '';

  const access = ContentConnection.inspectability(tab && tab.url ? tab.url : '');
  if (!tab || !Number.isInteger(state.tabId) || !access.supported) {
    renderNoReportStatus(access.title, access.detail);
    return;
  }

  const targetTabId = state.tabId;
  let manifest = null;
  let connection;
  try {
    manifest = browser.runtime && typeof browser.runtime.getManifest === 'function'
      ? browser.runtime.getManifest()
      : null;
    connection = await ContentConnection.ensure(browser, targetTabId, manifest);
  } catch (error) {
    connection = {
      ok: false,
      code: 'connection-failed',
      error: ContentConnection.safeError(error),
    };
  }
  if (!refreshIsCurrent(generation)) return;
  state.connection = connection;

  if (!connection || !connection.ok) {
    state.lastRuntimeError = connection && connection.error ? connection.error : null;
    const message = ContentConnection.failureMessage(tab.url, connection || null);
    renderNoReportStatus(message.title, message.detail);
    return;
  }

  if (connection.recovered) {
    setStatus('Reconnected to page', 'The content script was restored automatically after the extension/tab context changed.');
  }

  let report;
  let firstAuditError = null;
  try {
    report = await browser.tabs.sendMessage(targetTabId, { type: 'seoInspector.analyze' });
  } catch (error) {
    if (!refreshIsCurrent(generation)) return;
    firstAuditError = ContentConnection.safeError(error);

    let repair = null;
    if (typeof ContentConnection.reinject === 'function') {
      try {
        repair = await ContentConnection.reinject(browser, targetTabId, manifest);
      } catch (repairError) {
        repair = {
          ok: false,
          code: 'runtime-reinjection-failed',
          error: ContentConnection.safeError(repairError),
        };
      }
    }
    if (!refreshIsCurrent(generation)) return;

    if (repair && repair.ok) {
      state.connection = Object.assign({}, repair, { recoveredAfterAuditFailure: true });
      try {
        report = await browser.tabs.sendMessage(targetTabId, { type: 'seoInspector.analyze' });
      } catch (retryError) {
        if (!refreshIsCurrent(generation)) return;
        state.lastRuntimeError = ContentConnection.safeError(retryError);
        renderNoReportStatus('Audit failed', auditFailureDetail(state.lastRuntimeError));
        return;
      }
    } else {
      state.lastRuntimeError = firstAuditError;
      renderNoReportStatus('Audit failed', auditFailureDetail(state.lastRuntimeError));
      return;
    }
  }
  if (!refreshIsCurrent(generation)) return;

  if (!report || !report.facts || !report.evaluation) {
    state.lastRuntimeError = { name: 'AuditError', message: 'Content script returned an incomplete audit report.' };
    renderNoReportStatus('Audit returned no data', 'The page connection is active, but the audit report was incomplete. Use Refresh and retry.');
    return;
  }

  state.report = report;
  const robotsReport = await browser.runtime.sendMessage({
    type: 'seoInspector.getRobots',
    url: report.facts.url,
    userAgent: 'Googlebot',
  }).catch(() => null);
  if (!refreshIsCurrent(generation)) return;
  if (robotsReport) {
    state.robotsReport = robotsReport;
    report.robotsTxt = robotsReport;
    report.evaluation.indexability = Indexability.analyze(
      report.facts,
      report.responseMeta || null,
      { robotsTxt: robotsReport },
    );
  }
  await browser.tabs.sendMessage(targetTabId, { type: 'seoInspector.watch', enabled: true }).catch(() => {});
  if (!refreshIsCurrent(generation)) return;
  renderAll();
};

const SidebarUiState = (() => {
  const STATES = Object.freeze({
    EMPTY: 'empty',
    LOADING: 'loading',
    ERROR: 'error',
    DISABLED: 'disabled',
    COMPLETE: 'complete',
  });

  const LOADING_PATTERN = /\b(loading|analyzing|checking|running|fetching|scanning|inspecting|processing)\b/i;
  const ERROR_PATTERN = /\b(error|failed|cannot|could not|did not complete|unavailable|timed out|timeout)\b/i;
  const DISABLED_PATTERN = /\b(disabled|not available|unsupported|not enabled)\b/i;
  const EMPTY_PATTERN = /\b(no |none\b|not checked|nothing to|waiting for)\b/i;

  function text(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function classify(panel) {
    if (!panel) return STATES.EMPTY;
    const value = text(panel);
    if (!value) return STATES.EMPTY;
    if (panel.querySelector('[aria-busy="true"]') || LOADING_PATTERN.test(value)) return STATES.LOADING;
    if (ERROR_PATTERN.test(value)) return STATES.ERROR;
    if (DISABLED_PATTERN.test(value)) return STATES.DISABLED;
    if (panel.querySelector('.empty') || EMPTY_PATTERN.test(value)) return STATES.EMPTY;
    return STATES.COMPLETE;
  }

  function apply(panel) {
    if (!panel || !panel.classList || !panel.classList.contains('panel')) return;
    const uiState = classify(panel);
    panel.dataset.uiState = uiState;
    panel.setAttribute('aria-busy', uiState === STATES.LOADING ? 'true' : 'false');

    const liveNode = panel.querySelector('.empty, .issue');
    if (liveNode && !liveNode.hasAttribute('role')) {
      liveNode.setAttribute('role', uiState === STATES.ERROR ? 'alert' : 'status');
    }
    if (liveNode && !liveNode.hasAttribute('aria-live')) {
      liveNode.setAttribute('aria-live', uiState === STATES.ERROR ? 'assertive' : 'polite');
    }

    panel.querySelectorAll('button').forEach((button) => {
      if (/^retry$/i.test(text(button)) && !button.getAttribute('aria-label')) {
        button.setAttribute('aria-label', 'Retry this inspection');
      }
    });
  }

  function applyAll(root) {
    (root || document).querySelectorAll('.panel').forEach(apply);
  }

  function start(root) {
    const target = root || document;
    applyAll(target);
    if (typeof MutationObserver !== 'function') return null;
    const observer = new MutationObserver((mutations) => {
      const panels = new Set();
      mutations.forEach((mutation) => {
        const panel = mutation.target && mutation.target.closest ? mutation.target.closest('.panel') : null;
        if (panel) panels.add(panel);
        mutation.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('panel')) panels.add(node);
          if (node.querySelectorAll) node.querySelectorAll('.panel').forEach((item) => panels.add(item));
        });
      });
      panels.forEach(apply);
    });
    observer.observe(target.body || target.documentElement || target, { childList: true, subtree: true, characterData: true });
    return observer;
  }

  return Object.freeze({ STATES, classify, apply, applyAll, start });
})();

if (typeof document !== 'undefined') SidebarUiState.start(document);