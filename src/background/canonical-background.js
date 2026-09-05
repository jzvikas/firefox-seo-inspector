'use strict';

const CANONICAL_MAX_LEVELS = 5;
const CANONICAL_MAX_HTML_BYTES = 2 * 1024 * 1024;
const CANONICAL_REQUEST_TIMEOUT_MS = 10000;
const CANONICAL_SCAN_TIMEOUT_MS = 30000;
const canonicalOperations = new Map();
const canonicalPendingTraces = [];
const canonicalTraceByRequest = new Map();

function canonicalHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch (_error) {
    return null;
  }
}

function canonicalLinkedController(timeoutMs, externalSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
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
      if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
    },
  };
}

function canonicalCleanupTrace(trace) {
  const index = canonicalPendingTraces.indexOf(trace);
  if (index >= 0) canonicalPendingTraces.splice(index, 1);
  if (trace && trace.requestId) canonicalTraceByRequest.delete(trace.requestId);
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId >= 0) return;
    const url = CanonicalChain.normalizeUrl(details.url);
    const now = Date.now();
    const trace = canonicalPendingTraces.find((item) => (
      !item.requestId
      && item.expectedUrl === url
      && now - item.createdAt < CANONICAL_REQUEST_TIMEOUT_MS + 2000
    ));
    if (!trace) return;
    trace.requestId = details.requestId;
    canonicalTraceByRequest.set(details.requestId, trace);
  },
  { urls: ['http://*/*', 'https://*/*'] },
);

browser.webRequest.onBeforeRedirect.addListener(
  (details) => {
    const trace = canonicalTraceByRequest.get(details.requestId);
    if (!trace) return;
    trace.redirects.push({
      from: details.url,
      to: details.redirectUrl,
      statusCode: details.statusCode,
      statusLine: details.statusLine || '',
    });
  },
  { urls: ['http://*/*', 'https://*/*'] },
);

browser.webRequest.onErrorOccurred.addListener(
  (details) => {
    const trace = canonicalTraceByRequest.get(details.requestId);
    if (trace) trace.webRequestError = details.error || 'network';
  },
  { urls: ['http://*/*', 'https://*/*'] },
);

async function canonicalReadHtml(response) {
  const length = Number(response.headers.get('content-length')) || 0;
  if (length > CANONICAL_MAX_HTML_BYTES) {
    const error = new Error('Canonical target HTML exceeds the configured size limit.');
    error.code = 'too-large';
    throw error;
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > CANONICAL_MAX_HTML_BYTES) {
      const error = new Error('Canonical target HTML exceeds the configured size limit.');
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
      if (sizeBytes > CANONICAL_MAX_HTML_BYTES) {
        await reader.cancel().catch(() => {});
        const error = new Error('Canonical target HTML exceeds the configured size limit.');
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

async function canonicalFetchLevel(value, externalSignal) {
  const url = canonicalHttpUrl(value);
  if (!url) {
    return {
      requestedUrl: value || '',
      finalUrl: value || '',
      status: 0,
      statusText: '',
      redirected: false,
      redirects: [],
      canonical: [],
      error: 'invalid-url',
      sizeBytes: 0,
      contentType: '',
    };
  }

  const trace = {
    expectedUrl: CanonicalChain.normalizeUrl(url),
    requestId: null,
    redirects: [],
    createdAt: Date.now(),
    webRequestError: null,
  };
  canonicalPendingTraces.push(trace);
  const linked = canonicalLinkedController(CANONICAL_REQUEST_TIMEOUT_MS, externalSignal);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: linked.controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    let canonical = [];
    let sizeBytes = 0;
    let bodyError = null;
    const mayBeHtml = !contentType || /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
    if (mayBeHtml && response.status > 0 && response.status < 400) {
      try {
        const body = await canonicalReadHtml(response);
        sizeBytes = body.sizeBytes;
        canonical = HeadSignals.parse(body.text, response.url || url).canonical;
      } catch (error) {
        bodyError = error && error.code ? error.code : 'body-read';
      }
    } else if (response.body && typeof response.body.cancel === 'function') {
      response.body.cancel().catch(() => {});
    }

    return {
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || trace.redirects.length > 0 || response.url !== url,
      redirects: trace.redirects.slice(),
      canonical,
      error: bodyError,
      sizeBytes,
      contentType,
    };
  } catch (error) {
    let reason = trace.webRequestError || 'network';
    if (error && error.name === 'AbortError') {
      reason = externalSignal && externalSignal.aborted
        ? 'cancelled'
        : linked.timedOut()
          ? 'timeout'
          : 'cancelled';
    }
    return {
      requestedUrl: url,
      finalUrl: trace.redirects.length ? trace.redirects[trace.redirects.length - 1].to : url,
      status: 0,
      statusText: '',
      redirected: trace.redirects.length > 0,
      redirects: trace.redirects.slice(),
      canonical: [],
      error: reason,
      sizeBytes: 0,
      contentType: '',
    };
  } finally {
    linked.cleanup();
    canonicalCleanupTrace(trace);
  }
}

async function checkCanonicalChain(message) {
  const operationId = String(message.operationId || `canonical-${Date.now()}`);
  const pageUrl = canonicalHttpUrl(message.pageUrl);
  const initialCanonical = canonicalHttpUrl(message.canonicalUrl);
  if (!pageUrl || !initialCanonical) {
    return CanonicalChain.analyze({
      pageUrl: message.pageUrl || '',
      initialCanonical: message.canonicalUrl || '',
      levels: [{ requestedUrl: message.canonicalUrl || '', status: 0, canonical: [], redirects: [], error: 'invalid-url' }],
    });
  }

  const controller = new AbortController();
  let scanTimedOut = false;
  const scanTimer = setTimeout(() => {
    scanTimedOut = true;
    controller.abort();
  }, CANONICAL_SCAN_TIMEOUT_MS);
  canonicalOperations.set(operationId, controller);

  const levels = [];
  const visited = new Set();
  let target = initialCanonical;
  let loop = false;
  let capped = false;

  try {
    for (let depth = 0; depth < CANONICAL_MAX_LEVELS && !controller.signal.aborted; depth += 1) {
      const normalizedTarget = CanonicalChain.normalizeUrl(target);
      if (visited.has(normalizedTarget)) {
        loop = true;
        break;
      }
      visited.add(normalizedTarget);

      const level = await canonicalFetchLevel(target, controller.signal);
      levels.push(level);
      if (level.error || !level.status || level.status >= 400) break;

      const finalUrl = CanonicalChain.normalizeUrl(level.finalUrl || target);
      const nextCanonical = Array.isArray(level.canonical) && level.canonical.length
        ? CanonicalChain.normalizeUrl(level.canonical[0])
        : '';
      if (!nextCanonical || nextCanonical === finalUrl) break;

      if (visited.has(nextCanonical) || (nextCanonical === CanonicalChain.normalizeUrl(pageUrl) && normalizedTarget !== CanonicalChain.normalizeUrl(pageUrl))) {
        loop = true;
        break;
      }

      target = nextCanonical;
      if (depth === CANONICAL_MAX_LEVELS - 1) capped = true;
    }

    if (!loop && !controller.signal.aborted && levels.length === CANONICAL_MAX_LEVELS) {
      const last = levels[levels.length - 1];
      const finalUrl = CanonicalChain.normalizeUrl(last.finalUrl || last.requestedUrl);
      const next = Array.isArray(last.canonical) && last.canonical.length
        ? CanonicalChain.normalizeUrl(last.canonical[0])
        : '';
      if (next && next !== finalUrl) capped = true;
    }

    const result = CanonicalChain.analyze({
      pageUrl,
      initialCanonical,
      levels,
      loop,
      capped,
      timedOut: scanTimedOut,
      cancelled: controller.signal.aborted && !scanTimedOut,
    });
    result.operationId = operationId;
    result.limits = {
      maxLevels: CANONICAL_MAX_LEVELS,
      maxHtmlBytes: CANONICAL_MAX_HTML_BYTES,
      requestTimeoutMs: CANONICAL_REQUEST_TIMEOUT_MS,
      scanTimeoutMs: CANONICAL_SCAN_TIMEOUT_MS,
    };
    return result;
  } finally {
    clearTimeout(scanTimer);
    canonicalOperations.delete(operationId);
  }
}

function cancelCanonicalChain(operationId) {
  const controller = canonicalOperations.get(String(operationId || ''));
  if (!controller) return { cancelled: false };
  controller.abort();
  return { cancelled: true };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.checkCanonicalChain') return checkCanonicalChain(message);
  if (message.type === 'seoInspector.cancelCanonicalChain') return Promise.resolve(cancelCanonicalChain(message.operationId));
  return undefined;
});
