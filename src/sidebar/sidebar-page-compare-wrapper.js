'use strict';

reportFromFetchedCompare = function reportFromFetchedCompareWithDocumentBase(resource) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(resource.text || ''), 'text/html');
  const url = new URL(resource.url || resource.requestedUrl);
  if (doc.head && !doc.querySelector('base[href]')) {
    const base = doc.createElement('base');
    base.setAttribute('href', url.href);
    doc.head.prepend(base);
  }
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
};

const renderCompareWithoutPageComparison = renderCompare;
renderCompare = function renderCompareWithPageComparison() {
  const currentTabId = currentActiveTab && typeof currentActiveTab.id === 'number' ? currentActiveTab.id : null;
  const currentUrl = pageCompareCurrentUrl();
  const tabChanged = pageCompareState.sourceTabId !== currentTabId;
  const urlChanged = pageCompareState.sourceUrl !== currentUrl;

  if (tabChanged || urlChanged) {
    pageCompareState.sourceTabId = currentTabId;
    pageCompareState.sourceUrl = currentUrl;
    if (tabChanged) {
      pageCompareState.tabsLoaded = false;
      pageCompareState.tabs = [];
      pageCompareState.selectedTabId = '';
    }
    if (pageCompareState.mode === 'tab') {
      pageCompareState.result = null;
      pageCompareState.error = '';
      pageCompareState.mode = '';
      pageCompareState.leftLabel = '';
      pageCompareState.rightLabel = '';
    }
  }

  renderCompareWithoutPageComparison();
  const panel = document.getElementById('compare');
  if (!panel || !state.report) return;
  appendPageComparison(panel);
};
