(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LinkNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.hash = '';
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
      return url.href;
    } catch (_error) {
      return '';
    }
  }

  function selectUrls(values, maxTargets) {
    const limit = Math.max(1, Number(maxTargets) || 250);
    const urls = [];
    const seen = new Set();
    let capped = false;
    for (const value of Array.isArray(values) ? values : []) {
      const raw = typeof value === 'string' ? value : value && value.href;
      const url = normalizeUrl(raw);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      if (urls.length < limit) urls.push(url);
      else capped = true;
    }
    return { urls, capped };
  }

  function resultMap(results) {
    const map = new Map();
    for (const item of Array.isArray(results) ? results : []) {
      const key = normalizeUrl(item && item.url);
      if (key) map.set(key, item);
    }
    return map;
  }

  function statusKind(result) {
    if (!result || result.error || !Number(result.status)) return 'unknown';
    const status = Number(result.status);
    if (status >= 400) return 'broken';
    if (result.redirected || (status >= 300 && status < 400)) return 'redirect';
    return 'ok';
  }

  function summarize(links, results) {
    const map = resultMap(results);
    const counts = {
      checked: 0,
      ok: 0,
      redirect: 0,
      internalRedirect: 0,
      broken: 0,
      unknown: 0,
    };

    const seen = new Set();
    for (const link of Array.isArray(links) ? links : []) {
      if (!link || link.kind !== 'http') continue;
      const key = normalizeUrl(link.href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const result = map.get(key);
      if (!result) continue;
      counts.checked += 1;
      const kind = statusKind(result);
      counts[kind] += 1;
      if (kind === 'redirect' && link.internal) counts.internalRedirect += 1;
    }
    return counts;
  }

  return {
    normalizeUrl,
    selectUrls,
    resultMap,
    statusKind,
    summarize,
  };
});
