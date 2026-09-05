'use strict';

const IMAGE_MAX_TARGETS = 250;
const IMAGE_CONCURRENCY = 6;
const IMAGE_REQUEST_TIMEOUT_MS = 10000;
const IMAGE_SCAN_TIMEOUT_MS = 45000;
const imageOperations = new Map();

function imageController(timeoutMs, externalSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const externalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', externalAbort, { once: true });
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
      if (externalSignal) externalSignal.removeEventListener('abort', externalAbort);
    },
  };
}

function networkErrorResult(url, reason) {
  return {
    requestedUrl: url || '',
    finalUrl: url || '',
    status: 0,
    statusText: '',
    redirected: false,
    contentType: '',
    sizeBytes: 0,
    sizeSource: '',
    error: reason || 'network',
  };
}

async function headImage(url, externalSignal) {
  const linked = imageController(IMAGE_REQUEST_TIMEOUT_MS, externalSignal);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: linked.controller.signal,
    });
    const sizeBytes = ImageNetworkUtils.contentLength(response.headers);
    return {
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || response.url !== url,
      contentType: response.headers.get('content-type') || '',
      sizeBytes,
      sizeSource: sizeBytes ? 'content-length' : '',
      error: null,
    };
  } catch (error) {
    const reason = error && error.name === 'AbortError'
      ? (externalSignal && externalSignal.aborted ? 'cancelled' : linked.timedOut() ? 'timeout' : 'cancelled')
      : 'network';
    return networkErrorResult(url, reason);
  } finally {
    linked.cleanup();
  }
}

async function rangeImage(url, externalSignal) {
  const linked = imageController(IMAGE_REQUEST_TIMEOUT_MS, externalSignal);
  let response = null;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: linked.controller.signal,
    });
    const size = ImageNetworkUtils.sizeFromRangeResponse(response.status, response.headers);
    return {
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      statusText: response.statusText || '',
      redirected: response.redirected || response.url !== url,
      contentType: response.headers.get('content-type') || '',
      sizeBytes: size.sizeBytes,
      sizeSource: size.sizeSource,
      error: null,
    };
  } catch (error) {
    const reason = error && error.name === 'AbortError'
      ? (externalSignal && externalSignal.aborted ? 'cancelled' : linked.timedOut() ? 'timeout' : 'cancelled')
      : 'network';
    return networkErrorResult(url, reason);
  } finally {
    if (response && response.body && typeof response.body.cancel === 'function') response.body.cancel().catch(() => {});
    linked.cleanup();
  }
}

async function inspectImage(url, externalSignal) {
  const head = await headImage(url, externalSignal);
  if (externalSignal && externalSignal.aborted) return head;
  if (!ImageNetworkUtils.shouldRangeFallback(head)) return head;

  const ranged = await rangeImage(url, externalSignal);
  if (!ranged.error && ranged.status > 0) return ranged;
  if (!head.error && head.status > 0) return head;
  return ranged;
}

async function checkImages(message) {
  const operationId = String(message.operationId || `images-${Date.now()}`);
  const selected = ImageNetworkUtils.uniqueUrls(message.images, IMAGE_MAX_TARGETS);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, IMAGE_SCAN_TIMEOUT_MS);
  imageOperations.set(operationId, controller);

  const results = new Array(selected.urls.length);
  let cursor = 0;
  async function worker() {
    while (cursor < selected.urls.length && !controller.signal.aborted) {
      const index = cursor;
      cursor += 1;
      results[index] = await inspectImage(selected.urls[index], controller.signal);
    }
  }

  try {
    const workers = Math.min(IMAGE_CONCURRENCY, selected.urls.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    const finalResults = results.filter(Boolean);
    return {
      operationId,
      results: finalResults,
      checked: finalResults.length,
      requested: selected.urls.length,
      capped: selected.capped,
      cancelled: controller.signal.aborted && !timedOut,
      timedOut,
      limits: {
        maxTargets: IMAGE_MAX_TARGETS,
        concurrency: IMAGE_CONCURRENCY,
        requestTimeoutMs: IMAGE_REQUEST_TIMEOUT_MS,
        scanTimeoutMs: IMAGE_SCAN_TIMEOUT_MS,
      },
    };
  } finally {
    clearTimeout(timer);
    imageOperations.delete(operationId);
  }
}

function cancelImageCheck(operationId) {
  const controller = imageOperations.get(String(operationId || ''));
  if (!controller) return { cancelled: false };
  controller.abort();
  return { cancelled: true };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.checkImages') return checkImages(message);
  if (message.type === 'seoInspector.cancelImages') return Promise.resolve(cancelImageCheck(message.operationId));
  return undefined;
});
