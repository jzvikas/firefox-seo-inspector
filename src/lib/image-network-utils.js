(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ImageNetworkUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function httpUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      url.hash = '';
      return url.href;
    } catch (_error) {
      return null;
    }
  }

  function headerValue(headers, name) {
    if (!headers || typeof headers.get !== 'function') return '';
    return headers.get(name) || '';
  }

  function contentLength(headers) {
    const value = Number(headerValue(headers, 'content-length'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function totalFromContentRange(value) {
    const match = String(value || '').match(/\/\s*(\d+)\s*$/);
    const total = match ? Number(match[1]) : 0;
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  function sizeFromRangeResponse(status, headers) {
    const rangeTotal = totalFromContentRange(headerValue(headers, 'content-range'));
    if (rangeTotal) return { sizeBytes: rangeTotal, sizeSource: 'content-range' };
    const length = contentLength(headers);
    if (Number(status) === 200 && length) return { sizeBytes: length, sizeSource: 'content-length' };
    return { sizeBytes: 0, sizeSource: '' };
  }

  function shouldRangeFallback(head) {
    const item = head || {};
    if (item.error) return true;
    if (item.status === 405 || item.status === 501) return true;
    return !item.sizeBytes && item.status > 0 && item.status < 400;
  }

  function uniqueUrls(values, maxTargets) {
    const limit = Math.max(0, Number(maxTargets) || 0);
    const urls = [];
    const seen = new Set();
    let capped = false;
    for (const value of Array.isArray(values) ? values : []) {
      const raw = typeof value === 'string' ? value : value && value.src;
      const url = httpUrl(raw);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      if (!limit || urls.length < limit) urls.push(url);
      else capped = true;
    }
    return { urls, capped };
  }

  return {
    httpUrl,
    headerValue,
    contentLength,
    totalFromContentRange,
    sizeFromRangeResponse,
    shouldRangeFallback,
    uniqueUrls,
  };
});
