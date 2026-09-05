(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Indexability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERDICTS = Object.freeze({
    INDEXABLE: 'Indexable',
    NOINDEX: 'Noindex',
    BLOCKED: 'Blocked',
    CANONICALIZED: 'Canonicalized',
    REDIRECTED: 'Redirected',
    ERROR: 'Error',
  });

  function normalizeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      url.hash = '';
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
      return url.href;
    } catch (_error) {
      return String(value).trim();
    }
  }

  function parseDirectives(values) {
    const directives = [];
    for (const value of values || []) {
      const raw = typeof value === 'object' && value !== null ? value.content : value;
      String(raw || '')
        .toLowerCase()
        .split(',')
        .flatMap((part) => part.trim().split(/\s+/))
        .filter(Boolean)
        .forEach((directive) => directives.push(directive));
    }
    return Array.from(new Set(directives));
  }

  function urlParts(value) {
    try {
      const url = new URL(value);
      return {
        protocol: url.protocol,
        hostname: url.hostname.toLowerCase(),
        pathname: url.pathname,
        search: url.search,
        origin: url.origin,
      };
    } catch (_error) {
      return null;
    }
  }

  function stripTrailingSlash(pathname) {
    if (pathname === '/') return '/';
    return pathname.replace(/\/+$/, '') || '/';
  }

  function canonicalDiagnostics(pageUrl, canonicalUrl) {
    const page = urlParts(pageUrl);
    const canonical = urlParts(canonicalUrl);
    if (!page || !canonical) {
      return {
        crossDomain: false,
        protocolMismatch: false,
        hostnameMismatch: false,
        trailingSlashMismatch: false,
        queryMismatch: false,
      };
    }
    return {
      crossDomain: page.hostname !== canonical.hostname,
      protocolMismatch: page.protocol !== canonical.protocol,
      hostnameMismatch: page.hostname !== canonical.hostname,
      trailingSlashMismatch: stripTrailingSlash(page.pathname) === stripTrailingSlash(canonical.pathname)
        && page.pathname !== canonical.pathname,
      queryMismatch: page.search !== canonical.search,
    };
  }

  function redirectDiagnostics(chain) {
    const redirects = Array.isArray(chain) ? chain : [];
    const visited = new Set();
    let loop = false;
    for (const hop of redirects) {
      const from = normalizeUrl(hop.from || hop.url || '');
      const to = normalizeUrl(hop.to || hop.redirectUrl || '');
      if (from && visited.has(from)) loop = true;
      if (from) visited.add(from);
      if (to && visited.has(to)) loop = true;
      if (to) visited.add(to);
    }
    return {
      hopCount: redirects.length,
      loop,
      excessive: redirects.length > 5,
    };
  }

  function reason(code, label, detail) {
    return { code, label, detail: detail || '' };
  }

  function analyze(facts, responseMeta, extra) {
    const pageFacts = facts || {};
    const response = responseMeta || {};
    const options = extra || {};
    const metaDirectives = parseDirectives(pageFacts.robots || []);
    const headerDirectives = parseDirectives(response.xRobotsTag || []);
    const allDirectives = Array.from(new Set(metaDirectives.concat(headerDirectives)));
    const explicitIndex = allDirectives.includes('index');
    const noindexMeta = metaDirectives.includes('noindex');
    const noindexHeader = headerDirectives.includes('noindex');
    const noindex = noindexMeta || noindexHeader;
    const directiveConflict = explicitIndex && noindex;
    const canonical = pageFacts.canonical || {};
    const pageUrl = normalizeUrl(pageFacts.url || response.url || '');
    const canonicalUrl = normalizeUrl(canonical.href || '');
    const canonicalDifferent = canonical.count === 1 && canonicalUrl && pageUrl && canonicalUrl !== pageUrl;
    const redirects = Array.isArray(response.redirectChain) ? response.redirectChain : [];
    const redirectInfo = redirectDiagnostics(redirects);
    const statusCode = typeof response.statusCode === 'number' ? response.statusCode : null;
    const robotsBlocked = Boolean(options.robotsTxt && options.robotsTxt.blocked);
    const reasons = [];

    if (statusCode !== null && statusCode >= 400) {
      reasons.push(reason('http.error', `HTTP ${statusCode}`, response.statusLine || 'The page returned an error response.'));
    }
    if (robotsBlocked) {
      reasons.push(reason('robots.blocked', 'Blocked by robots.txt', options.robotsTxt.rule || 'The current URL is disallowed for the selected crawler.'));
    }
    if (noindexMeta) reasons.push(reason('robots.meta.noindex', 'Meta robots noindex', 'The rendered page contains a noindex directive.'));
    if (noindexHeader) reasons.push(reason('robots.header.noindex', 'X-Robots-Tag noindex', 'The HTTP response contains a noindex directive.'));
    if (directiveConflict) reasons.push(reason('robots.conflict', 'Conflicting index directives', 'Both explicit index and noindex directives are present. Noindex wins for compliant crawlers.'));
    if (redirects.length) {
      reasons.push(reason('redirect.detected', `${redirects.length} redirect hop${redirects.length === 1 ? '' : 's'}`, `${redirects[0].from || ''} → ${(redirects[redirects.length - 1] || {}).to || pageUrl}`));
    }
    if (redirectInfo.loop) reasons.push(reason('redirect.loop', 'Redirect loop detected', 'A URL repeats within the captured redirect chain.'));
    if (redirectInfo.excessive) reasons.push(reason('redirect.excessive', 'Excessive redirect chain', `${redirects.length} redirect hops were captured.`));
    if (canonicalDifferent) reasons.push(reason('canonical.different', 'Canonical points elsewhere', canonicalUrl));
    if (canonical.count > 1) reasons.push(reason('canonical.multiple', 'Multiple canonical elements', `${canonical.count} canonical elements were found.`));

    let verdict = VERDICTS.INDEXABLE;
    if (statusCode !== null && statusCode >= 400) verdict = VERDICTS.ERROR;
    else if (robotsBlocked) verdict = VERDICTS.BLOCKED;
    else if (noindex) verdict = VERDICTS.NOINDEX;
    else if (redirects.length) verdict = VERDICTS.REDIRECTED;
    else if (canonicalDifferent) verdict = VERDICTS.CANONICALIZED;

    if (!reasons.length) reasons.push(reason('indexable', 'No blocking directive detected', 'The current checks did not find a reason that prevents this URL from being indexable.'));

    return {
      verdict,
      indexable: verdict === VERDICTS.INDEXABLE,
      reasons,
      directives: {
        meta: metaDirectives,
        header: headerDirectives,
        conflict: directiveConflict,
      },
      canonical: {
        count: canonical.count || 0,
        url: canonicalUrl,
        different: Boolean(canonicalDifferent),
        diagnostics: canonicalDiagnostics(pageUrl, canonicalUrl),
      },
      redirects,
      redirectDiagnostics: redirectInfo,
      statusCode,
      pageUrl,
      responseUrl: normalizeUrl(response.url || pageUrl),
      robotsTxt: options.robotsTxt || null,
    };
  }

  function diff(rendered, raw) {
    if (!rendered || !raw) return [];
    const fields = [
      ['Verdict', rendered.verdict, raw.verdict],
      ['Meta directives', rendered.directives && rendered.directives.meta, raw.directives && raw.directives.meta],
      ['Header directives', rendered.directives && rendered.directives.header, raw.directives && raw.directives.header],
      ['Canonical', rendered.canonical && rendered.canonical.url, raw.canonical && raw.canonical.url],
    ];
    return fields
      .filter((item) => JSON.stringify(item[1]) !== JSON.stringify(item[2]))
      .map((item) => ({ field: item[0], rendered: item[1], raw: item[2] }));
  }

  return {
    VERDICTS,
    analyze,
    diff,
    parseDirectives,
    canonicalDiagnostics,
    redirectDiagnostics,
    normalizeUrl,
  };
});
