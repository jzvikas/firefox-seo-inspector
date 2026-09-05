'use strict';

const COMPARE_PAGE_MAX_BYTES = 2 * 1024 * 1024;
const COMPARE_PAGE_TIMEOUT_MS = 12000;
const COMPARE_SCAN_TIMEOUT_MS = 15000;
const compareOperations = new Map();

function compareHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch (_error) {
    return null;
  }
}

function compareHeader(response, name) {
  const value = response && response.headers ? response.headers.get(name) : null;
  return value ? [String(value)] : [];
}

function compareResponseMeta(response, finalUrl) {
  return {
    url: finalUrl,
    statusCode: response.status,
    statusLine: response.statusText || '',
    xRobotsTag: compareHeader(response, 'x-robots-tag'),
    contentType: compareHeader(response, 'content-type'),
    contentLanguage: compareHeader(response, 'content-language'),
    link: compareHeader(response, 'link'),
    cacheControl: compareHeader(response, 'cache-control'),
  };
}

function compareSecurityResponseMeta(response, finalUrl) {
  return {
    url: finalUrl,
    statusCode: response.status,
    contentSecurityPolicy: compareHeader(response, 'content-security-policy'),
    contentSecurityPolicyReportOnly: compareHeader(response, 'content-security-policy-report-only'),
    strictTransportSecurity: compareHeader(response, 'strict-transport-security'),
    xFrameOptions: compareHeader(response, 'x-frame-options'),
    referrerPolicy: compareHeader(response, 'referrer-policy'),
    permissionsPolicy: compareHeader(response, 'permissions-policy'),
    xContentTypeOptions: compareHeader(response, 'x-content-type-options'),
  };
}

function compareLinkedController(timeoutMs, externalSignal) {
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

async function compareReadBody(response, maxBytes) {
  const lengthHeader = response.headers.get('content-length');
  const announced = Number(lengthHeader);
  if (Number.isFinite(announced) && announced > maxBytes) {
    if (response.body && typeof response.body.cancel === 'function') response.body.cancel().catch(() => {});
    const error = new Error('Response exceeded configured size limit.');
    error.code = 'too-large';
    throw error;
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      const error = new Error('Response exceeded configured size limit.');
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

async function fetchComparePage(value, externalSignal) {
  const requestedUrl = compareHttpUrl(value);
  if (!requestedUrl) {
    return { requestedUrl: String(value || ''), url: '', status: 0, redirected: false, sizeBytes: 0, text: '', error: 'invalid-url', responseMeta: null, securityResponseMeta: null };
  }

  const linked = compareLinkedController(COMPARE_PAGE_TIMEOUT_MS, externalSignal || null);
  let response = null;

  try {
    response = await fetch(requestedUrl, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: linked.controller.signal,
    });
    const finalUrl = compareHttpUrl(response.url || requestedUrl) || requestedUrl;
    const contentType = response.headers.get('content-type') || '';
    const htmlLike = !contentType || /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
    if (!htmlLike) {
      if (response.body && typeof response.body.cancel === 'function') response.body.cancel().catch(() => {});
      return {
        requestedUrl,
        url: finalUrl,
        status: response.status,
        statusText: response.statusText || '',
        redirected: response.redirected || finalUrl !== requestedUrl,
        sizeBytes: 0,
        text: '',
        error: 'not-html',
        responseMeta: compareResponseMeta(response, finalUrl),
        securityResponseMeta: compareSecurityResponseMeta(response, finalUrl),
        limits: { maxBytes: COMPARE_PAGE_MAX_BYTES, timeoutMs: COMPARE_PAGE_TIMEOUT_MS },
      };
    }

    const body = await compareReadBody(response, COMPARE_PAGE_MAX_BYTES);
    return {
      requestedUrl,
      url: finalUrl,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || finalUrl !== requestedUrl,
      sizeBytes: body.sizeBytes,
      text: body.text,
      error: null,
      responseMeta: compareResponseMeta(response, finalUrl),
      securityResponseMeta: compareSecurityResponseMeta(response, finalUrl),
      limits: { maxBytes: COMPARE_PAGE_MAX_BYTES, timeoutMs: COMPARE_PAGE_TIMEOUT_MS },
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
    const finalUrl = response ? compareHttpUrl(response.url || requestedUrl) || requestedUrl : requestedUrl;
    return {
      requestedUrl,
      url: finalUrl,
      status: response ? response.status : 0,
      statusText: response ? response.statusText || '' : '',
      redirected: response ? response.redirected || finalUrl !== requestedUrl : false,
      sizeBytes: 0,
      text: '',
      error: reason,
      responseMeta: response ? compareResponseMeta(response, finalUrl) : null,
      securityResponseMeta: response ? compareSecurityResponseMeta(response, finalUrl) : null,
      limits: { maxBytes: COMPARE_PAGE_MAX_BYTES, timeoutMs: COMPARE_PAGE_TIMEOUT_MS },
    };
  } finally {
    linked.cleanup();
  }
}

async function fetchComparePages(message) {
  const operationId = String(message && message.operationId || `compare-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const previous = compareOperations.get(operationId);
  if (previous) previous.abort();
  const controller = new AbortController();
  compareOperations.set(operationId, controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, COMPARE_SCAN_TIMEOUT_MS);

  try {
    const [left, right] = await Promise.all([
      fetchComparePage(message && message.urlA, controller.signal),
      fetchComparePage(message && message.urlB, controller.signal),
    ]);
    return {
      operationId,
      left,
      right,
      cancelled: controller.signal.aborted && !timedOut,
      timedOut,
      limits: {
        maxBytesPerUrl: COMPARE_PAGE_MAX_BYTES,
        requestTimeoutMs: COMPARE_PAGE_TIMEOUT_MS,
        scanTimeoutMs: COMPARE_SCAN_TIMEOUT_MS,
      },
    };
  } finally {
    clearTimeout(timer);
    if (compareOperations.get(operationId) === controller) compareOperations.delete(operationId);
  }
}

function cancelComparePages(operationId) {
  const controller = compareOperations.get(String(operationId || ''));
  if (!controller) return { cancelled: false };
  controller.abort();
  return { cancelled: true };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.fetchComparePage') return fetchComparePage(message.url, null);
  if (message.type === 'seoInspector.fetchComparePages') return fetchComparePages(message);
  if (message.type === 'seoInspector.cancelComparePages') return Promise.resolve(cancelComparePages(message.operationId));
  return undefined;
});
