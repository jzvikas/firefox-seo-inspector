'use strict';

const CRAWLER_MAX_BYTES = 2 * 1024 * 1024;
const CRAWLER_TIMEOUT_MS = 12000;
const crawlerControllers = new Map();

function crawlerHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    return url.href;
  } catch (_error) {
    return '';
  }
}

function crawlerHeader(response, name) {
  const value = response && response.headers ? response.headers.get(name) : null;
  return value ? [String(value)] : [];
}

function crawlerResponseMeta(response, finalUrl) {
  return {
    url: finalUrl,
    statusCode: response.status,
    statusLine: response.statusText || '',
    xRobotsTag: crawlerHeader(response, 'x-robots-tag'),
    contentType: crawlerHeader(response, 'content-type'),
    contentLanguage: crawlerHeader(response, 'content-language'),
    link: crawlerHeader(response, 'link'),
    cacheControl: crawlerHeader(response, 'cache-control'),
  };
}

function crawlerSecurityMeta(response, finalUrl) {
  return {
    url: finalUrl,
    statusCode: response.status,
    contentSecurityPolicy: crawlerHeader(response, 'content-security-policy'),
    contentSecurityPolicyReportOnly: crawlerHeader(response, 'content-security-policy-report-only'),
    strictTransportSecurity: crawlerHeader(response, 'strict-transport-security'),
    xFrameOptions: crawlerHeader(response, 'x-frame-options'),
    referrerPolicy: crawlerHeader(response, 'referrer-policy'),
    permissionsPolicy: crawlerHeader(response, 'permissions-policy'),
    xContentTypeOptions: crawlerHeader(response, 'x-content-type-options'),
  };
}

async function crawlerReadBody(response) {
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > CRAWLER_MAX_BYTES) {
    const error = new Error('too-large');
    error.code = 'too-large';
    throw error;
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > CRAWLER_MAX_BYTES) {
      const error = new Error('too-large');
      error.code = 'too-large';
      throw error;
    }
    return { text: new TextDecoder().decode(buffer), sizeBytes: buffer.byteLength };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sizeBytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      sizeBytes += chunk.value.byteLength;
      if (sizeBytes > CRAWLER_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        const error = new Error('too-large');
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

function crawlerRegister(scanId, controller) {
  const key = String(scanId || '');
  if (!crawlerControllers.has(key)) crawlerControllers.set(key, new Set());
  crawlerControllers.get(key).add(controller);
}

function crawlerUnregister(scanId, controller) {
  const key = String(scanId || '');
  const set = crawlerControllers.get(key);
  if (!set) return;
  set.delete(controller);
  if (!set.size) crawlerControllers.delete(key);
}

function crawlerCancel(scanId) {
  const key = String(scanId || '');
  const set = crawlerControllers.get(key);
  if (!set) return 0;
  const count = set.size;
  for (const controller of set) controller.abort();
  crawlerControllers.delete(key);
  return count;
}

async function crawlerFetch(message) {
  const requestedUrl = crawlerHttpUrl(message && message.url);
  const scanId = String(message && message.scanId || '');
  if (!requestedUrl || !scanId) {
    return { requestedUrl, url: '', status: 0, redirected: false, sizeBytes: 0, text: '', error: 'invalid-request', responseMeta: null, securityResponseMeta: null };
  }
  const controller = new AbortController();
  crawlerRegister(scanId, controller);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, CRAWLER_TIMEOUT_MS);
  let response = null;
  try {
    response = await fetch(requestedUrl, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    const finalUrl = crawlerHttpUrl(response.url || requestedUrl) || requestedUrl;
    const contentType = response.headers.get('content-type') || '';
    const htmlLike = !contentType || /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
    const base = {
      requestedUrl,
      url: finalUrl,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || finalUrl !== requestedUrl,
      responseMeta: crawlerResponseMeta(response, finalUrl),
      securityResponseMeta: crawlerSecurityMeta(response, finalUrl),
      limits: { maxBytes: CRAWLER_MAX_BYTES, timeoutMs: CRAWLER_TIMEOUT_MS },
    };
    if (!htmlLike) return Object.assign(base, { sizeBytes: 0, text: '', error: 'not-html' });
    const body = await crawlerReadBody(response);
    return Object.assign(base, { sizeBytes: body.sizeBytes, text: body.text, error: null });
  } catch (error) {
    const finalUrl = response ? crawlerHttpUrl(response.url || requestedUrl) || requestedUrl : requestedUrl;
    let reason = error && error.code ? String(error.code) : 'network';
    if (error && error.name === 'AbortError') reason = timedOut ? 'timeout' : 'cancelled';
    return {
      requestedUrl,
      url: finalUrl,
      status: response ? response.status : 0,
      statusText: response ? response.statusText || '' : '',
      redirected: response ? response.redirected || finalUrl !== requestedUrl : false,
      sizeBytes: 0,
      text: '',
      error: reason,
      responseMeta: response ? crawlerResponseMeta(response, finalUrl) : null,
      securityResponseMeta: response ? crawlerSecurityMeta(response, finalUrl) : null,
      limits: { maxBytes: CRAWLER_MAX_BYTES, timeoutMs: CRAWLER_TIMEOUT_MS },
    };
  } finally {
    clearTimeout(timer);
    crawlerUnregister(scanId, controller);
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.crawler.fetch') return crawlerFetch(message);
  if (message.type === 'seoInspector.crawler.cancel') return Promise.resolve({ cancelled: crawlerCancel(message.scanId) });
  return undefined;
});
