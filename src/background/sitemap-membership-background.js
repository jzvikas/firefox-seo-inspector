'use strict';

const MEMBERSHIP_MAX_DOC_BYTES = 12 * 1024 * 1024;
const MEMBERSHIP_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const MEMBERSHIP_MAX_DOCUMENTS = 30;
const MEMBERSHIP_CONCURRENCY = 3;
const MEMBERSHIP_REQUEST_TIMEOUT_MS = 10000;
const MEMBERSHIP_SCAN_TIMEOUT_MS = 30000;
const sitemapMembershipOperations = new Map();

function membershipHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch (_error) {
    return null;
  }
}

function membershipController(timeoutMs, externalSignal) {
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

function membershipSeeds(pageValue, declared) {
  const pageUrl = membershipHttpUrl(pageValue);
  if (!pageUrl) return [];
  const values = Array.isArray(declared) && declared.length
    ? declared
    : [new URL('/sitemap.xml', pageUrl).href];
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const url = membershipHttpUrl(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push(url);
  }
  return output;
}

async function membershipReadBody(response, maxBytes) {
  let stream = response.body;
  const finalUrl = response.url || '';
  const contentType = response.headers.get('content-type') || '';
  const contentEncoding = response.headers.get('content-encoding') || '';
  const looksLikeGzip = /\.gz(?:$|[?#])/i.test(finalUrl) || /(?:application|binary)\/(?:x-)?gzip/i.test(contentType);
  const alreadyDecoded = /gzip/i.test(contentEncoding);

  if (looksLikeGzip && !alreadyDecoded) {
    if (!stream || typeof DecompressionStream === 'undefined') {
      const error = new Error('Compressed sitemap cannot be decoded.');
      error.code = 'compressed-unsupported';
      throw error;
    }
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }

  if (!stream || typeof stream.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      const error = new Error('Sitemap exceeded configured size limit.');
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
        const error = new Error('Sitemap exceeded configured size limit.');
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

async function membershipFetch(value, externalSignal) {
  const url = membershipHttpUrl(value);
  if (!url) {
    return {
      requestedUrl: value || '',
      url: value || '',
      status: 0,
      statusText: '',
      redirected: false,
      contentType: '',
      text: '',
      sizeBytes: 0,
      error: 'invalid-url',
    };
  }

  const linked = membershipController(MEMBERSHIP_REQUEST_TIMEOUT_MS, externalSignal);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: linked.controller.signal,
    });
    let body = { text: '', sizeBytes: 0 };
    if (response.ok) body = await membershipReadBody(response, MEMBERSHIP_MAX_DOC_BYTES);
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
    else if (error && error.name === 'AbortError') {
      reason = externalSignal && externalSignal.aborted
        ? 'cancelled'
        : linked.timedOut()
          ? 'timeout'
          : 'cancelled';
    }
    return {
      requestedUrl: url,
      url,
      status: 0,
      statusText: '',
      redirected: false,
      contentType: '',
      text: '',
      sizeBytes: 0,
      error: reason,
    };
  } finally {
    linked.cleanup();
  }
}

function membershipRecordMatch(foundMap, target, entry, sitemapUrl) {
  const key = SitemapMembership.normalizeUrl(target);
  if (!key || foundMap.has(key) || !entry) return;
  foundMap.set(key, {
    sitemapUrl,
    loc: entry.loc,
    lastmod: entry.lastmod || '',
  });
}

async function checkSitemapMembership(message) {
  const pageUrl = membershipHttpUrl(message.pageUrl);
  const canonicalUrl = membershipHttpUrl(message.canonicalUrl || message.pageUrl);
  if (!pageUrl || !canonicalUrl) {
    return {
      error: 'invalid-url',
      source: { url: message.pageUrl || '', found: false, match: null },
      canonical: { url: message.canonicalUrl || message.pageUrl || '', found: false, match: null },
      documents: [],
      sitemaps: [],
    };
  }

  const operationId = String(message.operationId || `sitemap-membership-${Date.now()}`);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MEMBERSHIP_SCAN_TIMEOUT_MS);
  sitemapMembershipOperations.set(operationId, controller);

  const seeds = membershipSeeds(pageUrl, message.sitemapUrls);
  const queue = seeds.slice();
  const queued = new Set(queue);
  const targets = SitemapMembership.uniqueTargets(pageUrl, canonicalUrl);
  const foundMap = new Map();
  const documents = [];
  let totalBytes = 0;
  let capped = false;

  try {
    while (
      queue.length
      && documents.length < MEMBERSHIP_MAX_DOCUMENTS
      && foundMap.size < targets.length
      && !controller.signal.aborted
    ) {
      const capacity = MEMBERSHIP_MAX_DOCUMENTS - documents.length;
      const batch = queue.splice(0, Math.min(MEMBERSHIP_CONCURRENCY, capacity));
      const results = await Promise.all(batch.map(async (url) => {
        const resource = await membershipFetch(url, controller.signal);
        if (resource.error || resource.status !== 200) return { resource, parsed: null };
        return { resource, parsed: SitemapXml.parse(resource.text, resource.url || url) };
      }));

      for (const result of results) {
        const resource = result.resource;
        totalBytes += resource.sizeBytes || 0;
        const parsed = result.parsed;
        documents.push({
          requestedUrl: resource.requestedUrl,
          url: resource.url,
          status: resource.status,
          statusText: resource.statusText,
          redirected: Boolean(resource.redirected),
          error: resource.error,
          contentType: resource.contentType || '',
          sizeBytes: resource.sizeBytes || 0,
          type: parsed ? parsed.type : 'unknown',
          entries: parsed ? parsed.entries.length : 0,
          warnings: parsed ? parsed.warnings : [],
        });

        if (parsed && parsed.type === 'urlset') {
          for (const target of targets) {
            if (foundMap.has(target)) continue;
            const match = SitemapXml.findEntry(parsed, target);
            if (match) membershipRecordMatch(foundMap, target, match, resource.url || resource.requestedUrl);
          }
        }

        if (parsed && parsed.type === 'sitemapindex') {
          for (const entry of parsed.entries) {
            const child = membershipHttpUrl(entry.loc);
            if (!child || queued.has(child)) continue;
            queued.add(child);
            if (queued.size <= MEMBERSHIP_MAX_DOCUMENTS * 20) queue.push(child);
            else capped = true;
          }
        }
      }

      if (totalBytes > MEMBERSHIP_MAX_TOTAL_BYTES) {
        capped = true;
        break;
      }
    }

    if (queue.length && documents.length >= MEMBERSHIP_MAX_DOCUMENTS) capped = true;
    const sourceKey = SitemapMembership.normalizeUrl(pageUrl);
    const canonicalKey = SitemapMembership.normalizeUrl(canonicalUrl);
    const sourceMatch = foundMap.get(sourceKey) || null;
    const canonicalMatch = foundMap.get(canonicalKey) || null;

    return {
      operationId,
      error: controller.signal.aborted ? (timedOut ? 'timeout' : 'cancelled') : null,
      source: { url: pageUrl, found: Boolean(sourceMatch), match: sourceMatch },
      canonical: { url: canonicalUrl, found: Boolean(canonicalMatch), match: canonicalMatch },
      sameTarget: sourceKey === canonicalKey,
      sitemaps: seeds,
      documents,
      scannedDocuments: documents.length,
      discoveredDocuments: queued.size,
      totalBytes,
      capped,
      cancelled: controller.signal.aborted && !timedOut,
      timedOut,
      limits: {
        maxDocuments: MEMBERSHIP_MAX_DOCUMENTS,
        maxDocumentBytes: MEMBERSHIP_MAX_DOC_BYTES,
        maxTotalBytes: MEMBERSHIP_MAX_TOTAL_BYTES,
        requestTimeoutMs: MEMBERSHIP_REQUEST_TIMEOUT_MS,
        scanTimeoutMs: MEMBERSHIP_SCAN_TIMEOUT_MS,
      },
    };
  } finally {
    clearTimeout(timer);
    sitemapMembershipOperations.delete(operationId);
  }
}

function cancelSitemapMembership(operationId) {
  const controller = sitemapMembershipOperations.get(String(operationId || ''));
  if (!controller) return { cancelled: false };
  controller.abort();
  return { cancelled: true };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.checkSitemapMembership') return checkSitemapMembership(message);
  if (message.type === 'seoInspector.cancelSitemapMembership') {
    return Promise.resolve(cancelSitemapMembership(message.operationId));
  }
  return undefined;
});
