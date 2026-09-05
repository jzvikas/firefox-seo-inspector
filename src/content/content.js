(() => {
  'use strict';

  const BOOTSTRAP_KEY = '__seoInspectorContentBootstrappedV1';
  const RAW_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
  const RAW_SOURCE_TIMEOUT_MS = 12000;
  const HEAVY_GROUP_NAMES = Object.freeze(['performance', 'content', 'security']);
  if (globalThis[BOOTSTRAP_KEY]) return;
  globalThis[BOOTSTRAP_KEY] = true;

  let observer = null;
  let mutationTimer = null;
  let documentRevision = 0;
  let latestCoreReport = null;
  let heavyCache = null;
  const highlightNodes = new Set();
  const rawSourceOperations = new Map();

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

  function normalizedHeavyGroups(groups) {
    const requested = new Set(Array.isArray(groups) ? groups.map((value) => String(value || '').toLowerCase()) : []);
    return HEAVY_GROUP_NAMES.filter((name) => requested.has(name));
  }

  function currentDocumentUrl() {
    return String(window.location && window.location.href || '');
  }

  function resetHeavyCache(url) {
    heavyCache = {
      url: String(url || currentDocumentUrl()),
      revision: documentRevision,
      performance: null,
      performanceHints: null,
      assetAudit: null,
      thirdPartyAudit: null,
      contentAudit: null,
      securityAudit: null,
    };
    return heavyCache;
  }

  function currentHeavyCache(url) {
    const value = String(url || currentDocumentUrl());
    if (!heavyCache || heavyCache.url !== value || heavyCache.revision !== documentRevision) return resetHeavyCache(value);
    return heavyCache;
  }

  async function analyzeDocument(doc, locationLike, responseMeta, securityResponseMeta, auditPolicy) {
    const facts = PageExtractor.extract(doc, locationLike, { performance: window.performance });
    const pageType = detectPageType(doc, facts, responseMeta);
    const productAudit = ProductPageAudit.inspect(facts, pageType);
    const categoryAudit = CategoryPageAudit.inspect(facts, pageType, responseMeta || null);
    const policy = auditPolicy || await loadAuditPolicy(facts.url);
    const rulesConfig = CustomRules.normalize(policy.rules);
    const evaluation = evaluateWithAuditPolicy(facts, responseMeta || null, policy);
    const context = pageContext();
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
      heavyAudit: {
        revision: documentRevision,
        performance: false,
        content: false,
        security: false,
      },
    };
  }

  async function analyzeCurrentPage() {
    const [responseMeta, securityResponseMeta, auditPolicy] = await Promise.all([
      browser.runtime.sendMessage({ type: 'seoInspector.getResponseMeta' }).catch(() => null),
      browser.runtime.sendMessage({ type: 'seoInspector.getSecurityResponseMeta' }).catch(() => null),
      loadAuditPolicy(window.location.href),
    ]);
    const report = await analyzeDocument(document, window.location, responseMeta, securityResponseMeta, auditPolicy);
    latestCoreReport = report;
    resetHeavyCache(report.facts && report.facts.url);
    return report;
  }

  function coreFactsForHeavyAudit() {
    const currentUrl = currentDocumentUrl();
    if (latestCoreReport
      && latestCoreReport.facts
      && String(latestCoreReport.facts.url || '') === currentUrl
      && latestCoreReport.heavyAudit
      && Number(latestCoreReport.heavyAudit.revision) === documentRevision) {
      return latestCoreReport.facts;
    }
    return PageExtractor.extract(document, window.location, { performance: window.performance });
  }

  async function analyzeHeavyCurrentPage(groups) {
    const requested = normalizedHeavyGroups(groups);
    if (!requested.length) {
      return {
        url: currentDocumentUrl(),
        revision: documentRevision,
        groups: {},
      };
    }

    const currentUrl = currentDocumentUrl();
    const cache = currentHeavyCache(currentUrl);
    const facts = coreFactsForHeavyAudit();
    const context = pageContext();
    const responseMeta = latestCoreReport && latestCoreReport.responseMeta || null;
    const securityResponseMeta = latestCoreReport && latestCoreReport.securityResponseMeta || null;
    const needsPerformanceBase = requested.includes('performance') || requested.includes('security');

    if (needsPerformanceBase && !cache.performance) {
      cache.performance = PerformanceAudit.collect(document, window.performance, currentUrl);
    }
    if (needsPerformanceBase && !cache.assetAudit) {
      cache.assetAudit = AssetAudit.collect(document, currentUrl, cache.performance);
    }

    if (requested.includes('performance')) {
      if (!cache.performanceHints) {
        cache.performanceHints = PerformanceHints.collect(document, {
          baseUrl: currentUrl,
          viewportWidth: context.viewportWidth,
          viewportHeight: context.viewportHeight,
          getComputedStyle: typeof window.getComputedStyle === 'function' ? window.getComputedStyle.bind(window) : null,
        }, cache.performance);
      }
      if (!cache.thirdPartyAudit) cache.thirdPartyAudit = ThirdPartyAudit.collect(cache.performance);
    }

    if (requested.includes('content') && !cache.contentAudit) {
      cache.contentAudit = ContentAudit.collect(document, {
        facts,
        responseMeta,
        getComputedStyle: typeof window.getComputedStyle === 'function' ? window.getComputedStyle.bind(window) : null,
      });
    }

    if (requested.includes('security') && !cache.securityAudit) {
      cache.securityAudit = SecurityAudit.collect(document, {
        pageUrl: currentUrl,
        responseMeta: securityResponseMeta,
        performance: cache.performance,
        assetAudit: cache.assetAudit,
      });
    }

    const result = {
      url: currentUrl,
      revision: documentRevision,
      groups: {},
      pageContext: context,
    };
    requested.forEach((name) => { result.groups[name] = true; });
    if (cache.performance) result.performance = cache.performance;
    if (cache.performanceHints) result.performanceHints = cache.performanceHints;
    if (cache.assetAudit) result.assetAudit = cache.assetAudit;
    if (cache.thirdPartyAudit) result.thirdPartyAudit = cache.thirdPartyAudit;
    if (cache.contentAudit) result.contentAudit = cache.contentAudit;
    if (cache.securityAudit) result.securityAudit = cache.securityAudit;
    return result;
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

  async function rawSourceReadBody(response) {
    const announced = Number(response.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > RAW_SOURCE_MAX_BYTES) {
      const error = new Error('Raw HTML exceeded configured size limit.');
      error.code = 'too-large';
      throw error;
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > RAW_SOURCE_MAX_BYTES) {
        const error = new Error('Raw HTML exceeded configured size limit.');
        error.code = 'too-large';
        throw error;
      }
      return { text: new TextDecoder().decode(buffer), sizeBytes: buffer.byteLength };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let sizeBytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        sizeBytes += chunk.value.byteLength;
        if (sizeBytes > RAW_SOURCE_MAX_BYTES) {
          await reader.cancel().catch(() => {});
          const error = new Error('Raw HTML exceeded configured size limit.');
          error.code = 'too-large';
          throw error;
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return { text, sizeBytes };
    } finally {
      reader.releaseLock();
    }
  }

  function rawSourceFailure(operationId, reason) {
    return {
      operationId,
      error: reason || 'network',
      limits: { maxBytes: RAW_SOURCE_MAX_BYTES, timeoutMs: RAW_SOURCE_TIMEOUT_MS },
    };
  }

  async function fetchRawReport(operationIdValue) {
    const operationId = String(operationIdValue || `raw-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const previous = rawSourceOperations.get(operationId);
    if (previous) previous.abort();
    const controller = new AbortController();
    rawSourceOperations.set(operationId, controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, RAW_SOURCE_TIMEOUT_MS);
    let response = null;

    try {
      response = await fetch(window.location.href, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      const htmlLike = !contentType || /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
      if (!htmlLike) {
        if (response.body && typeof response.body.cancel === 'function') response.body.cancel().catch(() => {});
        return rawSourceFailure(operationId, 'not-html');
      }

      const body = await rawSourceReadBody(response);
      const parser = new DOMParser();
      const rawDocument = parser.parseFromString(body.text, 'text/html');
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
        operationId,
        error: null,
        sizeBytes: body.sizeBytes,
        limits: { maxBytes: RAW_SOURCE_MAX_BYTES, timeoutMs: RAW_SOURCE_TIMEOUT_MS },
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
    } catch (error) {
      let reason = error && error.code ? String(error.code) : 'network';
      if (error && error.name === 'AbortError') reason = timedOut ? 'timeout' : 'cancelled';
      return rawSourceFailure(operationId, reason);
    } finally {
      clearTimeout(timer);
      if (rawSourceOperations.get(operationId) === controller) rawSourceOperations.delete(operationId);
    }
  }

  function cancelRawSource(operationId) {
    const controller = rawSourceOperations.get(String(operationId || ''));
    if (!controller) return { cancelled: false };
    controller.abort();
    return { cancelled: true };
  }

  function notifyPageChanged() {
    documentRevision += 1;
    latestCoreReport = null;
    heavyCache = null;
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
    if (message.type === 'seoInspector.analyzeHeavy') return analyzeHeavyCurrentPage(message.groups);
    if (message.type === 'seoInspector.highlight') return Promise.resolve({ highlighted: highlightRefs(message.refs) });
    if (message.type === 'seoInspector.clearHighlights') {
      clearHighlights();
      return Promise.resolve({ ok: true });
    }
    if (message.type === 'seoInspector.fetchRaw') return fetchRawReport(message.operationId);
    if (message.type === 'seoInspector.cancelRaw') return Promise.resolve(cancelRawSource(message.operationId));
    if (message.type === 'seoInspector.watch') {
      setWatching(Boolean(message.enabled));
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });
})();
