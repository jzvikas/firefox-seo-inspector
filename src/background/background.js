'use strict';

const RESPONSE_KEY_PREFIX = 'response-meta:';
const LINK_CHECK_LIMIT = 250;
const LINK_CHECK_CONCURRENCY = 6;
const LINK_CHECK_TIMEOUT_MS = 10000;
const navigationRequests = new Map();

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

async function checkOneLink(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
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
    clearTimeout(timer);
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

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'seoInspector.getResponseMeta') return responseMetaForSender(sender);
  if (message.type === 'seoInspector.checkLinks') return checkLinks(message.urls);
  if (message.type === 'seoInspector.checkTarget') return checkTarget(message.url);
  return undefined;
});
