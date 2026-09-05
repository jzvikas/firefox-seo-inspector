'use strict';

const LINK_NETWORK_MAX_TARGETS = 250;
const LINK_NETWORK_CONCURRENCY = 6;
const LINK_NETWORK_REQUEST_TIMEOUT_MS = 10000;
const LINK_NETWORK_SCAN_TIMEOUT_MS = 30000;
const LINK_NETWORK_CACHE_MAX = 1000;
const linkNetworkOperations = new Map();
const linkNetworkCache = new Map();

function linkRequestController(timeoutMs, externalSignal) {
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

function cacheLinkResult(url, result) {
  if (!url || !result || result.error) return;
  if (linkNetworkCache.has(url)) linkNetworkCache.delete(url);
  linkNetworkCache.set(url, { ...result, cached: false, cachedAt: Date.now() });
  while (linkNetworkCache.size > LINK_NETWORK_CACHE_MAX) {
    linkNetworkCache.delete(linkNetworkCache.keys().next().value);
  }
}

function cachedLinkResult(url) {
  const result = linkNetworkCache.get(url);
  if (!result) return null;
  linkNetworkCache.delete(url);
  linkNetworkCache.set(url, result);
  return { ...result, cached: true };
}

async function checkLinkTarget(url, externalSignal, force) {
  if (!force) {
    const cached = cachedLinkResult(url);
    if (cached) return cached;
  }

  const linked = linkRequestController(LINK_NETWORK_REQUEST_TIMEOUT_MS, externalSignal);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: linked.controller.signal,
    });
    const result = {
      url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || response.url !== url,
      finalUrl: response.url || url,
      error: null,
      cached: false,
    };
    cacheLinkResult(url, result);
    return result;
  } catch (error) {
    const reason = error && error.name === 'AbortError'
      ? (externalSignal && externalSignal.aborted ? 'cancelled' : linked.timedOut() ? 'timeout' : 'cancelled')
      : 'network';
    return {
      url,
      status: 0,
      statusText: '',
      redirected: false,
      finalUrl: url,
      error: reason,
      cached: false,
    };
  } finally {
    linked.cleanup();
  }
}

function notifyLinkProgress(operationId, checked, requested, result) {
  browser.runtime.sendMessage({
    type: 'seoInspector.linkCheckProgress',
    operationId,
    checked,
    requested,
    result,
  }).catch(() => {});
}

async function checkLinksBounded(message) {
  const operationId = String(message.operationId || `links-${Date.now()}`);
  const selection = LinkNetwork.selectUrls(message.urls, LINK_NETWORK_MAX_TARGETS);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, LINK_NETWORK_SCAN_TIMEOUT_MS);
  linkNetworkOperations.set(operationId, controller);

  const results = new Array(selection.urls.length);
  let cursor = 0;
  let completed = 0;
  const force = Boolean(message.force);

  async function worker() {
    while (cursor < selection.urls.length && !controller.signal.aborted) {
      const index = cursor;
      cursor += 1;
      const result = await checkLinkTarget(selection.urls[index], controller.signal, force);
      results[index] = result;
      completed += 1;
      notifyLinkProgress(operationId, completed, selection.urls.length, result);
    }
  }

  try {
    const workerCount = Math.min(LINK_NETWORK_CONCURRENCY, selection.urls.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    const finalResults = results.filter(Boolean);
    return {
      operationId,
      results: finalResults,
      checked: finalResults.length,
      requested: selection.urls.length,
      cached: finalResults.filter((item) => item.cached).length,
      capped: selection.capped,
      cancelled: controller.signal.aborted && !timedOut,
      timedOut,
      limits: {
        maxTargets: LINK_NETWORK_MAX_TARGETS,
        concurrency: LINK_NETWORK_CONCURRENCY,
        requestTimeoutMs: LINK_NETWORK_REQUEST_TIMEOUT_MS,
        scanTimeoutMs: LINK_NETWORK_SCAN_TIMEOUT_MS,
        cacheEntries: LINK_NETWORK_CACHE_MAX,
      },
    };
  } finally {
    clearTimeout(timer);
    linkNetworkOperations.delete(operationId);
  }
}

function cancelLinkCheck(operationId) {
  const controller = linkNetworkOperations.get(String(operationId || ''));
  if (!controller) return { cancelled: false };
  controller.abort();
  return { cancelled: true };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.checkLinksBounded') return checkLinksBounded(message);
  if (message.type === 'seoInspector.cancelLinks') {
    return Promise.resolve(cancelLinkCheck(message.operationId));
  }
  return undefined;
});
