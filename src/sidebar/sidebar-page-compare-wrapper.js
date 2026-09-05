'use strict';

// Compatibility view over the sidebar's canonical active-tab state. The page
// comparison code reads this object lazily, so keeping it backed by state.tabId
// avoids a stale duplicate tab object and prevents startup ReferenceError.
const currentActiveTab = {};
Object.defineProperty(currentActiveTab, 'id', {
  configurable: false,
  enumerable: true,
  get() {
    return state && typeof state.tabId === 'number' ? state.tabId : null;
  },
});

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
  const rulesConfig = state.report && state.report.customRules
    ? CustomRules.normalize(state.report.customRules)
    : CustomRules.normalize(null);
  const baseEvaluation = SeoCore.evaluateFacts(facts, responseMeta, CustomRules.toSeoCoreOptions(rulesConfig));
  const evaluation = CustomRules.applyEvaluation(baseEvaluation, facts, rulesConfig);
  evaluation.indexability = Indexability.analyze(facts, responseMeta);
  const securityAudit = SecurityAudit.collect(doc, {
    pageUrl: facts.url,
    responseMeta: securityResponseMeta,
    performance: null,
    assetAudit: null,
  });
  return { facts, evaluation, responseMeta, securityResponseMeta, customRules: rulesConfig, securityAudit };
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
