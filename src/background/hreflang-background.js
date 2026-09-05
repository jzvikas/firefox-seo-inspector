'use strict';

const HREFLANG_MAX_TARGETS = 40;
const HREFLANG_CONCURRENCY = 4;
const HREFLANG_MAX_BYTES = 2 * 1024 * 1024;
const HREFLANG_REQUEST_TIMEOUT_MS = 10000;
const HREFLANG_SCAN_TIMEOUT_MS = 30000;
const hreflangOperations = new Map();

function hreflangHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch (_error) {
    return null;
  }
}

function hreflangLinkedController(timeoutMs, externalSignal) {
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

async function readHreflangBody(response) {
  const length = Number(response.headers.get('content-length')) || 0;
  if (length > HREFLANG_MAX_BYTES) {
    const error = new Error('Target HTML exceeds the configured size limit.');
    error.code = 'too-large';
    throw error;
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > HREFLANG_MAX_BYTES) {
      const error = new Error('Target HTML exceeds the configured size limit.');
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
      if (sizeBytes > HREFLANG_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        const error = new Error('Target HTML exceeds the configured size limit.');
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

async function fetchHreflangTarget(value, externalSignal) {
  const url = hreflangHttpUrl(value);
  if (!url) return { requestedUrl: value || '', url: value || '', status: 0, statusText: '', redirected: false, error: 'invalid-url', canonical: [], hreflang: [], robots: [], xRobotsTag: [], sizeBytes: 0 };
  const linked = hreflangLinkedController(HREFLANG_REQUEST_TIMEOUT_MS, externalSignal);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: linked.controller.signal,
      cache: 'no-store',
    });
    let parsed = { canonical: [], hreflang: [], robots: [] };
    let sizeBytes = 0;
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && /(?:text\/html|application\/xhtml\+xml)/i.test(contentType || 'text/html')) {
      const body = await readHreflangBody(response);
      sizeBytes = body.sizeBytes;
      parsed = HeadSignals.parse(body.text, response.url || url);
    }
    const xRobots = response.headers.get('x-robots-tag');
    return {
      requestedUrl: url,
      url: response.url || url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || response.url !== url,
      error: null,
      contentType,
      canonical: parsed.canonical,
      hreflang: parsed.hreflang,
      robots: parsed.robots,
      xRobotsTag: xRobots ? [xRobots] : [],
      sizeBytes,
    };
  } catch (error) {
    let reason = 'network';
    if (error && error.code) reason = error.code;
    else if (error && error.name === 'AbortError') reason = externalSignal && externalSignal.aborted ? 'cancelled' : linked.timedOut() ? 'timeout' : 'cancelled';
    return { requestedUrl: url, url, status: 0, statusText: '', redirected: false, error: reason, canonical: [], hreflang: [], robots: [], xRobotsTag: [], sizeBytes: 0 };
  } finally {
    linked.cleanup();
  }
}

function hreflangTargetUrls(entries) {
  const output = [];
  const seen = new Set();
  let capped = false;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const url = hreflangHttpUrl(entry && entry.href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (output.length < HREFLANG_MAX_TARGETS) output.push(url);
    else capped = true;
  }
  return { urls: output, capped };
}

async function checkHreflangTargets(message) {
  const operationId = String(message.operationId || `hreflang-${Date.now()}`);
  const selected = hreflangTargetUrls(message.entries);
  const controller = new AbortController();
  let scanTimedOut = false;
  const timer = setTimeout(() => {
    scanTimedOut = true;
    controller.abort();
  }, HREFLANG_SCAN_TIMEOUT_MS);
  hreflangOperations.set(operationId, controller);

  const results = new Array(selected.urls.length);
  let cursor = 0;
  async function worker() {
    while (cursor < selected.urls.length && !controller.signal.aborted) {
      const index = cursor;
      cursor += 1;
      results[index] = await fetchHreflangTarget(selected.urls[index], controller.signal);
    }
  }

  try {
    const workers = Math.min(HREFLANG_CONCURRENCY, selected.urls.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    return {
      operationId,
      results: results.filter(Boolean),
      checked: results.filter(Boolean).length,
      requested: selected.urls.length,
      capped: selected.capped,
      cancelled: controller.signal.aborted && !scanTimedOut,
      timedOut: scanTimedOut,
      limits: {
        maxTargets: HREFLANG_MAX_TARGETS,
        concurrency: HREFLANG_CONCURRENCY,
        maxBytesPerTarget: HREFLANG_MAX_BYTES,
        requestTimeoutMs: HREFLANG_REQUEST_TIMEOUT_MS,
        scanTimeoutMs: HREFLANG_SCAN_TIMEOUT_MS,
      },
    };
  } finally {
    clearTimeout(timer);
    hreflangOperations.delete(operationId);
  }
}

function cancelHreflang(operationId) {
  const controller = hreflangOperations.get(String(operationId || ''));
  if (!controller) return { cancelled: false };
  controller.abort();
  return { cancelled: true };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.checkHreflang') return checkHreflangTargets(message);
  if (message.type === 'seoInspector.cancelHreflang') return Promise.resolve(cancelHreflang(message.operationId));
  return undefined;
});
