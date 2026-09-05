(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SitemapMembership = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = '';
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
      return url.href;
    } catch (_error) {
      return String(value || '');
    }
  }

  function sameUrl(left, right) {
    const a = normalizeUrl(left);
    const b = normalizeUrl(right);
    return Boolean(a && b && a === b);
  }

  function uniqueTargets(pageUrl, canonicalUrl) {
    const values = [normalizeUrl(pageUrl), normalizeUrl(canonicalUrl || pageUrl)].filter(Boolean);
    return Array.from(new Set(values));
  }

  function issue(severity, code, message) {
    return { severity, code, message };
  }

  function analyze(input) {
    const data = input || {};
    const pageUrl = normalizeUrl(data.pageUrl);
    const canonicalUrl = normalizeUrl(data.canonicalUrl || data.pageUrl);
    const sourceFound = Boolean(data.sourceFound);
    const canonicalFound = Boolean(data.canonicalFound);
    const verdict = String(data.verdict || '');
    const statusCode = Number(data.statusCode) || 0;
    const redirectHops = Number(data.redirectHops) || 0;
    const sourceIsCanonical = sameUrl(pageUrl, canonicalUrl);
    const issues = [];

    if (sourceFound && !sourceIsCanonical) {
      issues.push(issue(
        'warning',
        'noncanonical-source-in-sitemap',
        'The current source URL is present in a sitemap even though it canonicalizes to another URL.',
      ));
    }

    if (sourceFound && (verdict === 'Redirected' || redirectHops > 0 || (statusCode >= 300 && statusCode < 400))) {
      issues.push(issue(
        'warning',
        'redirect-source-in-sitemap',
        'The current URL is present in a sitemap but the navigation redirects.',
      ));
    }

    if (sourceFound && (verdict === 'Noindex' || verdict === 'Blocked')) {
      issues.push(issue(
        'warning',
        'nonindexable-source-in-sitemap',
        `The current URL is present in a sitemap while its indexability verdict is ${verdict}.`,
      ));
    }

    if (sourceFound && (verdict === 'Error' || statusCode >= 400)) {
      issues.push(issue(
        'critical',
        'error-source-in-sitemap',
        `The current URL is present in a sitemap but returns an error${statusCode ? ` (HTTP ${statusCode})` : ''}.`,
      ));
    }

    return {
      pageUrl,
      canonicalUrl,
      sourceFound,
      canonicalFound,
      sourceIsCanonical,
      issues,
      counts: {
        warning: issues.filter((item) => item.severity === 'warning').length,
        critical: issues.filter((item) => item.severity === 'critical').length,
      },
    };
  }

  return {
    normalizeUrl,
    sameUrl,
    uniqueTargets,
    analyze,
  };
});
