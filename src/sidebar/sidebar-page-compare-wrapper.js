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

async function loadCompareAuditPolicy(url) {
  try {
    const stored = await browser.storage.local.get([CustomRules.STORAGE_KEY, DomainProfiles.STORAGE_KEY]);
    const baseRules = CustomRules.normalize(stored && stored[CustomRules.STORAGE_KEY]);
    const profiles = DomainProfiles.normalizeStore(stored && stored[DomainProfiles.STORAGE_KEY]);
    return DomainProfiles.resolve(profiles, url, baseRules);
  } catch (_error) {
    return DomainProfiles.resolve(null, url, CustomRules.normalize(null));
  }
}

reportFromFetchedCompare = async function reportFromFetchedCompareWithDocumentBase(resource) {
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
  facts.pageSignals = PageTypeDom.collect(doc, facts.url);
  const pageType = PageType.detect(facts, responseMeta);
  const productAudit = ProductPageAudit.inspect(facts, pageType);
  const policy = await loadCompareAuditPolicy(url.href);
  const rulesConfig = CustomRules.normalize(policy.rules);
  const baseEvaluation = SeoCore.evaluateFacts(facts, responseMeta, CustomRules.toSeoCoreOptions(rulesConfig));
  let evaluation = CustomRules.applyEvaluation(baseEvaluation, facts, rulesConfig);
  if (policy.profile) evaluation = DomainProfiles.applyEvaluation(evaluation, facts, policy.profile, rulesConfig);
  evaluation.indexability = Indexability.analyze(facts, responseMeta);
  const securityAudit = SecurityAudit.collect(doc, {
    pageUrl: facts.url,
    responseMeta: securityResponseMeta,
    performance: null,
    assetAudit: null,
  });
  return {
    facts,
    evaluation,
    pageType,
    productAudit,
    responseMeta,
    securityResponseMeta,
    customRules: rulesConfig,
    domainProfile: policy.profile ? DomainProfiles.profileSummary(policy.profile) : null,
    securityAudit,
  };
};

runUrlComparison = async function runUrlComparisonWithDomainProfiles(urlA, urlB) {
  if (pageCompareState.loading) return;
  pageCompareState.urlA = String(urlA || '').trim();
  pageCompareState.urlB = String(urlB || '').trim();
  if (!pageCompareIsHttpUrl(pageCompareState.urlA) || !pageCompareIsHttpUrl(pageCompareState.urlB)) {
    pageCompareState.error = 'Both comparison values must be HTTP or HTTPS URLs.';
    renderCompare();
    return;
  }

  pageCompareState.loading = true;
  pageCompareState.error = '';
  renderCompare();
  try {
    const [leftResource, rightResource] = await Promise.all([
      fetchComparableUrl(pageCompareState.urlA),
      fetchComparableUrl(pageCompareState.urlB),
    ]);
    const leftError = fetchedCompareError(leftResource, 'URL A');
    const rightError = fetchedCompareError(rightResource, 'URL B');
    if (leftError || rightError) throw new Error([leftError, rightError].filter(Boolean).join(' '));
    const [leftReport, rightReport] = await Promise.all([
      reportFromFetchedCompare(leftResource),
      reportFromFetchedCompare(rightResource),
    ]);
    pageCompareState.result = PageCompare.compareReports(leftReport, rightReport);
    pageCompareState.leftLabel = `URL A · ${leftResource.url || pageCompareState.urlA}`;
    pageCompareState.rightLabel = `URL B · ${rightResource.url || pageCompareState.urlB}`;
    pageCompareState.mode = 'url';
  } catch (error) {
    pageCompareState.result = null;
    pageCompareState.error = error && error.message ? error.message : 'URL comparison failed.';
  } finally {
    pageCompareState.loading = false;
    renderCompare();
  }
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
