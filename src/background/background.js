'use strict';

const RESPONSE_KEY_PREFIX = 'response-meta:';
const LINK_CHECK_LIMIT = 250;
const LINK_CHECK_CONCURRENCY = 6;
const LINK_CHECK_TIMEOUT_MS = 10000;
const ROBOTS_MAX_BYTES = 1024 * 1024;
const ROBOTS_TIMEOUT_MS = 10000;
const ROBOTS_CACHE_TTL_MS = 5 * 60 * 1000;
const SITEMAP_MAX_DOC_BYTES = 12 * 1024 * 1024;
const SITEMAP_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const SITEMAP_MAX_DOCUMENTS = 30;
const SITEMAP_CONCURRENCY = 3;
const SITEMAP_REQUEST_TIMEOUT_MS = 10000;
const SITEMAP_SCAN_TIMEOUT_MS = 30000;
const navigationRequests = new Map();
const robotsCache = new Map();
const networkOperations = new Map();

function selectedHeaders(headers) {
  const wanted = new Set(['x-robots-tag', 'content-type', 'content-language', 'link', 'cache-control']);
  const output = {};
  for (const header of headers || []) {
    const name = String(header.name || '').toLowerCase();
    if (!wanted.has(name)) continue;
    if (!output[name]) output[name] = [];
    output[name].push(header.value || '');
  }
  return output;
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0 || details.type !== 'main_frame') return;
    if (!navigationRequests.has(details.requestId)) {
      navigationRequests.set(details.requestId, {
        tabId: details.tabId,
        initialUrl: details.url,
        redirects: [],
      });
    }
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

browser.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (details.tabId < 0 || details.type !== 'main_frame') return;
    let navigation = navigationRequests.get(details.requestId);
    if (!navigation) {
      navigation = { tabId: details.tabId, initialUrl: details.url, redirects: [] };
      navigationRequests.set(details.requestId, navigation);
    }
    navigation.redirects.push({
      from: details.url,
      to: details.redirectUrl,
      statusCode: details.statusCode,
      statusLine: details.statusLine || '',
    });
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.type !== 'main_frame') return;
    const headers = selectedHeaders(details.responseHeaders);
    const navigation = navigationRequests.get(details.requestId);
    const value = {
      url: details.url,
      initialUrl: navigation ? navigation.initialUrl : details.url,
      redirectChain: navigation ? navigation.redirects.slice() : [],
      statusCode: details.statusCode,
      statusLine: details.statusLine || '',
      xRobotsTag: headers['x-robots-tag'] || [],
      contentType: headers['content-type'] || [],
      contentLanguage: headers['content-language'] || [],
      link: headers.link || [],
      cacheControl: headers['cache-control'] || [],
      capturedAt: Date.now(),
    };
    browser.storage.session.set({ [`${RESPONSE_KEY_PREFIX}${details.tabId}`]: value }).catch(() => {});
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['responseHeaders'],
);

function clearNavigation(details) {
  if (details && details.requestId) navigationRequests.delete(details.requestId);
}

browser.webRequest.onCompleted.addListener(clearNavigation, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] });
browser.webRequest.onErrorOccurred.addListener(clearNavigation, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] });

browser.tabs.onRemoved.addListener((tabId) => {
  browser.storage.session.remove(`${RESPONSE_KEY_PREFIX}${tabId}`).catch(() => {});
  for (const [requestId, value] of navigationRequests.entries()) {
    if (value.tabId === tabId) navigationRequests.delete(requestId);
  }
});

browser.action.onClicked.addListener(() => {
  browser.sidebarAction.open().catch(() => {});
});

async function responseMetaForSender(sender) {
  const tabId = sender && sender.tab ? sender.tab.id : null;
  if (typeof tabId !== 'number') return null;
  const key = `${RESPONSE_KEY_PREFIX}${tabId}`;
  const stored = await browser.storage.session.get(key);
  return stored[key] || null;
}

function sanitizeHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch (_error) {
    return null;
  }
}

function linkedAbortController(timeoutMs, externalSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    controller,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function checkOneLink(url) {
  const linked = linkedAbortController(LINK_CHECK_TIMEOUT_MS, null);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: linked.controller.signal,
      cache: 'no-store',
    });
    return {
      url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || response.url !== url,
      finalUrl: response.url || url,
      error: null,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      statusText: '',
      redirected: false,
      finalUrl: url,
      error: error && error.name === 'AbortError' ? 'timeout' : 'network',
    };
  } finally {
    linked.cleanup();
  }
}

async function checkLinks(values) {
  const unique = [];
  const seen = new Set();
  let capped = false;
  for (const value of Array.isArray(values) ? values : []) {
    const url = sanitizeHttpUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (unique.length < LINK_CHECK_LIMIT) unique.push(url);
    else capped = true;
  }

  const results = new Array(unique.length);
  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await checkOneLink(unique[index]);
    }
  }
  const workerCount = Math.min(LINK_CHECK_CONCURRENCY, unique.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { results, checked: unique.length, capped };
}

async function checkTarget(value) {
  const url = sanitizeHttpUrl(value);
  if (!url) return { url: value || '', status: 0, statusText: '', redirected: false, finalUrl: value || '', error: 'invalid-url' };
  return checkOneLink(url);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || '')).byteLength;
}

async function readLimitedBody(response, maxBytes) {
  let stream = response.body;
  const finalUrl = response.url || '';
  const contentType = response.headers.get('content-type') || '';
  const contentEncoding = response.headers.get('content-encoding') || '';
  const looksLikeGzipFile = /\.gz(?:$|[?#])/i.test(finalUrl) || /(?:application|binary)\/(?:x-)?gzip/i.test(contentType);
  const browserAlreadyDecoded = /gzip/i.test(contentEncoding);

  if (looksLikeGzipFile && !browserAlreadyDecoded) {
    if (!stream || typeof DecompressionStream === 'undefined') {
      const error = new Error('Compressed sitemap cannot be decoded in this browser context.');
      error.code = 'compressed-unsupported';
      throw error;
    }
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }

  if (!stream || typeof stream.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      const error = new Error('Response exceeded configured size limit.');
      error.code = 'too-large';
      throw error;
    }
    return { text: new TextDecoder().decode(buffer), sizeBytes: buffer.byteLength };
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let sizeBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      sizeBytes += chunk.value.byteLength;
      if (sizeBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        const error = new Error('Response exceeded configured size limit.');
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

async function fetchTextResource(value, maxBytes, timeoutMs, externalSignal) {
  const url = sanitizeHttpUrl(value);
  if (!url) return { requestedUrl: value || '', url: value || '', status: 0, statusText: '', error: 'invalid-url', text: '', sizeBytes: 0 };
  const linked = linkedAbortController(timeoutMs, externalSignal || null);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: linked.controller.signal,
      cache: 'no-store',
    });
    let body = { text: '', sizeBytes: 0 };
    if (response.ok) body = await readLimitedBody(response, maxBytes);
    return {
      requestedUrl: url,
      url: response.url || url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || response.url !== url,
      contentType: response.headers.get('content-type') || '',
      text: body.text,
      sizeBytes: body.sizeBytes,
      error: null,
    };
  } catch (error) {
    let reason = 'network';
    if (error && error.code) reason = error.code;
    else if (error && error.name === 'AbortError') reason = externalSignal && externalSignal.aborted ? 'cancelled' : linked.timedOut() ? 'timeout' : 'cancelled';
    return { requestedUrl: url, url, status: 0, statusText: '', redirected: false, contentType: '', text: '', sizeBytes: 0, error: reason };
  } finally {
    linked.cleanup();
  }
}

function trimCache(cache, maxEntries) {
  while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
}

async function robotsForPage(pageValue, userAgent) {
  const pageUrl = sanitizeHttpUrl(pageValue);
  if (!pageUrl) return { error: 'invalid-url', blocked: false, allowed: null, sitemaps: [], warnings: [] };
  const crawler = String(userAgent || 'Googlebot');
  const robotsUrl = new URL('/robots.txt', pageUrl).href;
  const now = Date.now();
  let cached = robotsCache.get(robotsUrl);
  if (!cached || now - cached.capturedAt > ROBOTS_CACHE_TTL_MS) {
    const resource = await fetchTextResource(robotsUrl, ROBOTS_MAX_BYTES, ROBOTS_TIMEOUT_MS, null);
    const parsed = resource.status === 200 && !resource.error ? RobotsTxt.parse(resource.text) : null;
    cached = { resource, parsed, capturedAt: now };
    robotsCache.set(robotsUrl, cached);
    trimCache(robotsCache, 64);
  }

  const resource = cached.resource;
  const parsed = cached.parsed;
  let evaluation = {
    userAgent: crawler,
    allowed: resource.status === 404 || resource.status === 410 ? true : null,
    blocked: false,
    path: RobotsTxt.targetPath(pageUrl),
    matchedAgents: [],
    rule: '',
    ruleType: '',
    ruleLine: null,
    sitemaps: [],
    warnings: [],
  };
  if (parsed) evaluation = RobotsTxt.evaluate(parsed, pageUrl, crawler);
  const sitemaps = parsed ? RobotsTxt.resolveSitemaps(parsed.sitemaps, resource.url || robotsUrl) : [];

  return {
    robotsUrl,
    finalUrl: resource.url || robotsUrl,
    status: resource.status,
    statusText: resource.statusText,
    redirected: Boolean(resource.redirected),
    contentType: resource.contentType || '',
    sizeBytes: resource.sizeBytes || 0,
    error: resource.error,
    cached: cached.capturedAt !== now,
    userAgent: evaluation.userAgent,
    allowed: evaluation.allowed,
    blocked: evaluation.blocked,
    path: evaluation.path,
    matchedAgents: evaluation.matchedAgents,
    rule: evaluation.rule,
    ruleType: evaluation.ruleType,
    ruleLine: evaluation.ruleLine,
    sitemaps,
    warnings: evaluation.warnings,
  };
}

function sitemapSeedUrls(pageValue, declared) {
  const pageUrl = sanitizeHttpUrl(pageValue);
  if (!pageUrl) return [];
  const values = Array.isArray(declared) && declared.length ? declared : [new URL('/sitemap.xml', pageUrl).href];
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const url = sanitizeHttpUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push(url);
  }
  return output;
}

async function checkSitemaps(message) {
  const pageUrl = sanitizeHttpUrl(message.pageUrl);
  const targetUrl = sanitizeHttpUrl(message.canonicalUrl || message.pageUrl);
  if (!pageUrl || !targetUrl) return { error: 'invalid-url', found: false, documents: [], sitemaps: [] };

  const operationId = String(message.operationId || `sitemap-${Date.now()}`);
  const operationController = new AbortController();
  const operationTimer = setTimeout(() => operationController.abort(), SITEMAP_SCAN_TIMEOUT_MS);
  networkOperations.set(operationId, operationController);

  const seeds = sitemapSeedUrls(pageUrl, message.sitemapUrls);
  const queue = seeds.slice();
  const queued = new Set(queue);
  const documents = [];
  let found = null;
  let totalBytes = 0;
  let capped = false;
  let operationTimedOut = false;

  try {
    while (queue.length && documents.length < SITEMAP_MAX_DOCUMENTS && !found && !operationController.signal.aborted) {
      const capacity = SITEMAP_MAX_DOCUMENTS - documents.length;
      const batch = queue.splice(0, Math.min(SITEMAP_CONCURRENCY, capacity));
      const results = await Promise.all(batch.map(async (url) => {
        const resource = await fetchTextResource(url, SITEMAP_MAX_DOC_BYTES, SITEMAP_REQUEST_TIMEOUT_MS, operationController.signal);
        if (resource.error || resource.status !== 200) return { resource, parsed: null, match: null };
        const parsed = SitemapXml.parse(resource.text, resource.url || url);
        const match = parsed.type === 'urlset' ? SitemapXml.findEntry(parsed, targetUrl) : null;
        return { resource, parsed, match };
      }));

      for (const result of results) {
        const resource = result.resource;
        totalBytes += resource.sizeBytes || 0;
        const documentRecord = {
          requestedUrl: resource.requestedUrl,
          url: resource.url,
          status: resource.status,
          statusText: resource.statusText,
          redirected: Boolean(resource.redirected),
          error: resource.error,
          contentType: resource.contentType || '',
          sizeBytes: resource.sizeBytes || 0,
          type: result.parsed ? result.parsed.type : 'unknown',
          entries: result.parsed ? result.parsed.entries.length : 0,
          warnings: result.parsed ? result.parsed.warnings : [],
        };
        documents.push(documentRecord);

        if (result.match && !found) {
          found = { sitemapUrl: resource.url || resource.requestedUrl, loc: result.match.loc, lastmod: result.match.lastmod || '' };
        }

        if (result.parsed && result.parsed.type === 'sitemapindex') {
          for (const entry of result.parsed.entries) {
            const child = sanitizeHttpUrl(entry.loc);
            if (!child || queued.has(child)) continue;
            queued.add(child);
            if (queued.size <= SITEMAP_MAX_DOCUMENTS * 20) queue.push(child);
            else capped = true;
          }
        }
      }

      if (totalBytes > SITEMAP_MAX_TOTAL_BYTES) {
        capped = true;
        break;
      }
    }

    if (queue.length && documents.length >= SITEMAP_MAX_DOCUMENTS) capped = true;
    operationTimedOut = operationController.signal.aborted;
    return {
      operationId,
      error: operationTimedOut ? 'cancelled-or-timeout' : null,
      pageUrl,
      targetUrl,
      sitemaps: seeds,
      found: Boolean(found),
      match: found,
      documents,
      scannedDocuments: documents.length,
      discoveredDocuments: queued.size,
      totalBytes,
      capped,
      limits: {
        maxDocuments: SITEMAP_MAX_DOCUMENTS,
        maxDocumentBytes: SITEMAP_MAX_DOC_BYTES,
        maxTotalBytes: SITEMAP_MAX_TOTAL_BYTES,
        timeoutMs: SITEMAP_SCAN_TIMEOUT_MS,
      },
    };
  } finally {
    clearTimeout(operationTimer);
    networkOperations.delete(operationId);
  }
}

function cancelNetworkOperation(operationId) {
  const controller = networkOperations.get(String(operationId || ''));
  if (!controller) return { cancelled: false };
  controller.abort();
  return { cancelled: true };
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.getResponseMeta') return responseMetaForSender(sender);
  if (message.type === 'seoInspector.checkLinks') return checkLinks(message.urls);
  if (message.type === 'seoInspector.checkTarget') return checkTarget(message.url);
  if (message.type === 'seoInspector.getRobots') return robotsForPage(message.url, message.userAgent);
  if (message.type === 'seoInspector.checkSitemaps') return checkSitemaps(message);
  if (message.type === 'seoInspector.cancelNetwork') return Promise.resolve(cancelNetworkOperation(message.operationId));
  return undefined;
});
