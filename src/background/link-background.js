'use strict';

const LINK_NETWORK_MAX_TARGETS = 250;
const LINK_NETWORK_CONCURRENCY = 6;
const LINK_NETWORK_REQUEST_TIMEOUT_MS = 10000;
const LINK_NETWORK_SCAN_TIMEOUT_MS = 30000;
const linkNetworkOperations = new Map();

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

async function checkLinkTarget(url, externalSignal) {
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
    return {
      url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || response.url !== url,
      finalUrl: response.url || url,
      error: null,
    };
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
    };
  } finally {
    linked.cleanup();
  }
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

  async function worker() {
    while (cursor < selection.urls.length && !controller.signal.aborted) {
      const index = cursor;
      cursor += 1;
      results[index] = await checkLinkTarget(selection.urls[index], controller.signal);
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
      capped: selection.capped,
      cancelled: controller.signal.aborted && !timedOut,
      timedOut,
      limits: {
        maxTargets: LINK_NETWORK_MAX_TARGETS,
        concurrency: LINK_NETWORK_CONCURRENCY,
        requestTimeoutMs: LINK_NETWORK_REQUEST_TIMEOUT_MS,
        scanTimeoutMs: LINK_NETWORK_SCAN_TIMEOUT_MS,
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
