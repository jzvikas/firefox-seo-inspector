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
  let connection;
  try {
    const manifest = browser.runtime && typeof browser.runtime.getManifest === 'function'
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
  try {
    report = await browser.tabs.sendMessage(targetTabId, { type: 'seoInspector.analyze' });
  } catch (error) {
    if (!refreshIsCurrent(generation)) return;
    state.lastRuntimeError = ContentConnection.safeError(error);
    renderNoReportStatus('Audit failed', 'The page connection is active, but the audit did not complete. Use Refresh; if it repeats, this is an Inspector runtime error rather than a page reload issue.');
    return;
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
