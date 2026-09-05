'use strict';

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

async function analyzeDocument(doc, locationLike, responseMeta) {
  const facts = PageExtractor.extract(doc, locationLike, { performance: window.performance });
  const evaluation = SeoCore.evaluateFacts(facts, responseMeta || null);
  evaluation.indexability = Indexability.analyze(facts, responseMeta || null);
  const pageUrl = locationLike && locationLike.href ? locationLike.href : '';
  const performance = PerformanceAudit.collect(doc, window.performance, pageUrl);
  const context = pageContext();
  const performanceHints = PerformanceHints.collect(doc, {
    baseUrl: pageUrl,
    viewportWidth: context.viewportWidth,
    viewportHeight: context.viewportHeight,
    getComputedStyle: typeof window.getComputedStyle === 'function' ? window.getComputedStyle.bind(window) : null,
  }, performance);
  return { facts, evaluation, responseMeta: responseMeta || null, pageContext: context, performance, performanceHints };
}

async function analyzeCurrentPage() {
  const responseMeta = await browser.runtime.sendMessage({ type: 'seoInspector.getResponseMeta' }).catch(() => null);
  return analyzeDocument(document, window.location, responseMeta);
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
  const evaluation = SeoCore.evaluateFacts(facts, responseMeta);
  evaluation.indexability = Indexability.analyze(facts, responseMeta);
  return { facts, evaluation, responseMeta, pageContext: pageContext() };
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
    attributeFilter: ['content', 'href', 'rel', 'name', 'property', 'lang', 'alt', 'src', 'srcset', 'loading', 'width', 'height', 'async', 'defer', 'media', 'crossorigin'],
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
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
