(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LinkAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GENERIC_ANCHORS = new Set([
    'click here',
    'here',
    'read more',
    'more',
    'learn more',
    'details',
    'view details',
    'view more',
    'this',
    'link',
    'website',
    'visit website',
    'continue',
  ]);

  function normalizeLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

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

  function isGenericAnchor(value) {
    const label = normalizeLabel(value);
    if (!label) return false;
    return GENERIC_ANCHORS.has(label);
  }

  function groupByLabel(links) {
    const groups = new Map();
    for (const link of Array.isArray(links) ? links : []) {
      if (!link || link.kind !== 'http') continue;
      const label = normalizeLabel(link.label);
      const url = normalizeUrl(link.href);
      if (!label || !url) continue;
      if (!groups.has(label)) groups.set(label, { label, urls: new Set(), refs: [], count: 0 });
      const group = groups.get(label);
      group.urls.add(url);
      group.count += 1;
      if (link.ref) group.refs.push(link.ref);
    }
    return Array.from(groups.values())
      .filter((group) => group.urls.size > 1)
      .map((group) => ({ label: group.label, urls: Array.from(group.urls).sort(), refs: group.refs, count: group.count }))
      .sort((a, b) => b.urls.length - a.urls.length || b.count - a.count || a.label.localeCompare(b.label));
  }

  function groupByUrl(links) {
    const groups = new Map();
    for (const link of Array.isArray(links) ? links : []) {
      if (!link || link.kind !== 'http') continue;
      const label = normalizeLabel(link.label);
      const url = normalizeUrl(link.href);
      if (!label || !url) continue;
      if (!groups.has(url)) groups.set(url, { url, labels: new Set(), refs: [], count: 0 });
      const group = groups.get(url);
      group.labels.add(label);
      group.count += 1;
      if (link.ref) group.refs.push(link.ref);
    }
    return Array.from(groups.values())
      .filter((group) => group.labels.size > 1)
      .map((group) => ({ url: group.url, labels: Array.from(group.labels).sort(), refs: group.refs, count: group.count }))
      .sort((a, b) => b.labels.length - a.labels.length || b.count - a.count || a.url.localeCompare(b.url));
  }

  function analyze(links) {
    const httpLinks = (Array.isArray(links) ? links : []).filter((link) => link && link.kind === 'http');
    const generic = httpLinks.filter((link) => isGenericAnchor(link.label));
    const empty = httpLinks.filter((link) => !normalizeLabel(link.label));
    return {
      totalHttp: httpLinks.length,
      generic,
      empty,
      sameAnchorDifferentUrls: groupByLabel(httpLinks),
      differentAnchorsSameUrl: groupByUrl(httpLinks),
    };
  }

  function resultFor(link, resultMap) {
    if (!resultMap || typeof resultMap.get !== 'function') return null;
    return resultMap.get(normalizeUrl(link && link.href)) || null;
  }

  function statusKind(result) {
    if (!result || result.error || !Number(result.status)) return 'unknown';
    const status = Number(result.status);
    if (status >= 400) return 'broken';
    if (result.redirected || (status >= 300 && status < 400)) return 'redirect';
    return 'ok';
  }

  function matchesFilter(link, resultMap, filter) {
    const value = String(filter || 'all');
    if (value === 'all') return true;
    if (!link) return false;
    if (value === 'external') return link.kind === 'http' && !link.internal;
    if (value === 'nofollow') return Boolean(link.nofollow);
    if (value === 'sponsored') return Boolean(link.sponsored);
    if (value === 'ugc') return Boolean(link.ugc);
    if (value === 'generic') return link.kind === 'http' && isGenericAnchor(link.label);
    const status = statusKind(resultFor(link, resultMap));
    if (value === 'broken') return status === 'broken';
    if (value === 'redirecting') return status === 'redirect';
    return true;
  }

  function filterLinks(links, resultMap, filter) {
    return (Array.isArray(links) ? links : []).filter((link) => matchesFilter(link, resultMap, filter));
  }

  return {
    GENERIC_ANCHORS,
    normalizeLabel,
    normalizeUrl,
    isGenericAnchor,
    groupByLabel,
    groupByUrl,
    analyze,
    resultFor,
    statusKind,
    matchesFilter,
    filterLinks,
  };
});
