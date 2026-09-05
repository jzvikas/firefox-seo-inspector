(() => {
  'use strict';

  const BOOTSTRAP_KEY = '__seoInspectorContentBootstrappedV1';
  if (globalThis[BOOTSTRAP_KEY]) return;
  globalThis[BOOTSTRAP_KEY] = true;

  let observer = null;
  let mutationTimer = null;
  const highlightNodes = new Set();

  function pageContext() {
    return {
      devicePixelRatio: Math.max(1, Number(window.devicePixelRatio) || 1),
      viewportWidth: Math.max(1, Number(window.innerWidth) || 1),
      viewportHeight: Math.max(1, Number(window.innerHeight) || 1),
    };
  }

  async function loadAuditPolicy(url) {
    try {
      await browser.runtime.sendMessage({ type: 'seoInspector.ensureStorageSchema' }).catch(() => null);
      const stored = await browser.storage.local.get([CustomRules.STORAGE_KEY, DomainProfiles.STORAGE_KEY]);
      const baseRules = CustomRules.normalize(stored && stored[CustomRules.STORAGE_KEY]);
      const profiles = DomainProfiles.normalizeStore(stored && stored[DomainProfiles.STORAGE_KEY]);
      return DomainProfiles.resolve(profiles, url, baseRules);
    } catch (_error) {
      return DomainProfiles.resolve(null, url, CustomRules.normalize(null));
    }
  }

  function evaluateWithAuditPolicy(facts, responseMeta, policy) {
    const resolved = policy || DomainProfiles.resolve(null, facts && facts.url, CustomRules.normalize(null));
    const rulesConfig = CustomRules.normalize(resolved.rules);
    const base = SeoCore.evaluateFacts(facts, responseMeta || null, CustomRules.toSeoCoreOptions(rulesConfig));
    let evaluation = CustomRules.applyEvaluation(base, facts, rulesConfig);
    if (resolved.profile) evaluation = DomainProfiles.applyEvaluation(evaluation, facts, resolved.profile, rulesConfig);
    evaluation.indexability = Indexability.analyze(facts, responseMeta || null);
    return evaluation;
  }

  function detectPageType(doc, facts, responseMeta) {
    facts.pageSignals = PageTypeDom.collect(doc, facts && facts.url);
    return PageType.detect(facts, responseMeta || null);
  }

  async function analyzeDocument(doc, locationLike, responseMeta, securityResponseMeta, auditPolicy) {
    const facts = PageExtractor.extract(doc, locationLike, { performance: window.performance });
    const pageType = detectPageType(doc, facts, responseMeta);
    const productAudit = ProductPageAudit.inspect(facts, pageType);
    const categoryAudit = CategoryPageAudit.inspect(facts, pageType, responseMeta || null);
    const policy = auditPolicy || await loadAuditPolicy(facts.url);
    const rulesConfig = CustomRules.normalize(policy.rules);
    const evaluation = evaluateWithAuditPolicy(facts, responseMeta || null, policy);
    const pageUrl = locationLike && locationLike.href ? locationLike.href : '';
    const performance = PerformanceAudit.collect(doc, window.performance, pageUrl);
    const context = pageContext();
    const performanceHints = PerformanceHints.collect(doc, {
      baseUrl: pageUrl,
      viewportWidth: context.viewportWidth,
      viewportHeight: context.viewportHeight,
      getComputedStyle: typeof window.getComputedStyle === 'function' ? window.getComputedStyle.bind(window) : null,
    }, performance);
    const assetAudit = AssetAudit.collect(doc, pageUrl, performance);
    const thirdPartyAudit = ThirdPartyAudit.collect(performance);
    const contentAudit = ContentAudit.collect(doc, {
      facts,
      responseMeta: responseMeta || null,
      getComputedStyle: typeof window.getComputedStyle === 'function' ? window.getComputedStyle.bind(window) : null,
    });
    const securityAudit = SecurityAudit.collect(doc, {
      pageUrl,
      responseMeta: securityResponseMeta || null,
      performance,
      assetAudit,
    });
    return {
      facts,
      evaluation,
      pageType,
      productAudit,
      categoryAudit,
      responseMeta: responseMeta || null,
      securityResponseMeta: securityResponseMeta || null,
      customRules: rulesConfig,
      domainProfile: policy.profile ? DomainProfiles.profileSummary(policy.profile) : null,
      pageContext: context,
      performance,
      performanceHints,
      assetAudit,
      thirdPartyAudit,
      contentAudit,
      securityAudit,
    };
  }

  async function analyzeCurrentPage() {
    const [responseMeta, securityResponseMeta, auditPolicy] = await Promise.all([
      browser.runtime.sendMessage({ type: 'seoInspector.getResponseMeta' }).catch(() => null),
      browser.runtime.sendMessage({ type: 'seoInspector.getSecurityResponseMeta' }).catch(() => null),
      loadAuditPolicy(window.location.href),
    ]);
    return analyzeDocument(document, window.location, responseMeta, securityResponseMeta, auditPolicy);
  }

  function clearHighlights() {
    for (const node of highlightNodes) {
      if (node && node.dataset && node.dataset.seoInspectorOriginalOutline !== undefined) {
        node.style.outline = node.dataset.seoInspectorOriginalOutline;
        node.style.outlineOffset = node.dataset.seoInspectorOriginalOutlineOffset || '';
        delete node.dataset.seoInspectorOriginalOutline;
        delete node.dataset.seoInspectorOriginalOutlineOffset;
      }
    }
    highlightNodes.clear();
  }

  function highlightRefs(refs) {
    clearHighlights();
    const items = Array.isArray(refs) ? refs : [];
    let first = null;
    for (const ref of items) {
      if (!ref || typeof ref.selector !== 'string' || !Number.isInteger(ref.index)) continue;
      const nodes = document.querySelectorAll(ref.selector);
      const node = nodes[ref.index];
      if (!node || !node.style || !node.dataset) continue;
      node.dataset.seoInspectorOriginalOutline = node.style.outline || '';
      node.dataset.seoInspectorOriginalOutlineOffset = node.style.outlineOffset || '';
      node.style.outline = '3px solid #ff5a5f';
      node.style.outlineOffset = '2px';
      highlightNodes.add(node);
      if (!first) first = node;
    }
    if (first && typeof first.scrollIntoView === 'function') {
      first.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    return highlightNodes.size;
  }

  async function fetchRawReport() {
    const response = await fetch(window.location.href, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
    });
    const html = await response.text();
    const parser = new DOMParser();
    const rawDocument = parser.parseFromString(html, 'text/html');
    const rawUrl = new URL(response.url || window.location.href);
    const responseMeta = {
      url: rawUrl.href,
      statusCode: response.status,
      statusLine: response.statusText || '',
      xRobotsTag: response.headers.get('x-robots-tag') ? [response.headers.get('x-robots-tag')] : [],
      contentType: response.headers.get('content-type') ? [response.headers.get('content-type')] : [],
      contentLanguage: response.headers.get('content-language') ? [response.headers.get('content-language')] : [],
      link: response.headers.get('link') ? [response.headers.get('link')] : [],
      cacheControl: response.headers.get('cache-control') ? [response.headers.get('cache-control')] : [],
      redirectChain: [],
    };
    const facts = PageExtractor.extract(rawDocument, rawUrl, { performance: null });
    const pageType = detectPageType(rawDocument, facts, responseMeta);
    const productAudit = ProductPageAudit.inspect(facts, pageType);
    const categoryAudit = CategoryPageAudit.inspect(facts, pageType, responseMeta);
    const auditPolicy = await loadAuditPolicy(rawUrl.href);
    const evaluation = evaluateWithAuditPolicy(facts, responseMeta, auditPolicy);
    const contentAudit = ContentAudit.collect(rawDocument, {
      facts,
      responseMeta,
      detectVisibility: false,
    });
    return {
      facts,
      evaluation,
      pageType,
      productAudit,
      categoryAudit,
      responseMeta,
      customRules: CustomRules.normalize(auditPolicy.rules),
      domainProfile: auditPolicy.profile ? DomainProfiles.profileSummary(auditPolicy.profile) : null,
      pageContext: pageContext(),
      contentAudit,
    };
  }

  function notifyPageChanged() {
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      browser.runtime.sendMessage({ type: 'seoInspector.pageChanged', url: window.location.href }).catch(() => {});
    }, 800);
  }

  function setWatching(enabled) {
    if (!enabled) {
      if (observer) observer.disconnect();
      observer = null;
      if (mutationTimer) clearTimeout(mutationTimer);
      mutationTimer = null;
      return;
    }
    if (observer) return;
    observer = new MutationObserver(notifyPageChanged);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['content', 'href', 'rel', 'name', 'property', 'lang', 'alt', 'src', 'srcset', 'loading', 'width', 'height', 'async', 'defer', 'media', 'crossorigin', 'type', 'nomodule', 'disabled', 'hidden', 'aria-hidden', 'style', 'class', 'action', 'data'],
    });
  }

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return undefined;
    if (message.type === 'seoInspector.ping') return Promise.resolve({ ok: true, url: window.location.href });
    if (message.type === 'seoInspector.analyze') return analyzeCurrentPage();
    if (message.type === 'seoInspector.highlight') return Promise.resolve({ highlighted: highlightRefs(message.refs) });
    if (message.type === 'seoInspector.clearHighlights') {
      clearHighlights();
      return Promise.resolve({ ok: true });
    }
    if (message.type === 'seoInspector.fetchRaw') return fetchRawReport();
    if (message.type === 'seoInspector.watch') {
      setWatching(Boolean(message.enabled));
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });
})();
