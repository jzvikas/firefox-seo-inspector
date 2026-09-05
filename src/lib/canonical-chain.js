(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CanonicalChain = api;
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

  function normalizedList(values) {
    return (Array.isArray(values) ? values : []).map(normalizeUrl).filter(Boolean);
  }

  function redirectLoop(hops) {
    const items = Array.isArray(hops) ? hops : [];
    if (!items.length) return false;
    const path = [];
    for (const hop of items) {
      const from = normalizeUrl(hop.from);
      const to = normalizeUrl(hop.to);
      if (!path.length && from) path.push(from);
      if (to) path.push(to);
    }
    const seen = new Set();
    for (const url of path) {
      if (seen.has(url)) return true;
      seen.add(url);
    }
    return false;
  }

  function canonicalPath(pageUrl, initialCanonical, levels) {
    const source = normalizeUrl(pageUrl);
    const first = normalizeUrl(initialCanonical);
    const path = source ? [source] : [];
    if (first && first !== source) path.push(first);
    else if (first && !path.length) path.push(first);

    for (const level of Array.isArray(levels) ? levels : []) {
      const canonicals = normalizedList(level && level.canonical);
      const next = canonicals[0] || '';
      const finalUrl = normalizeUrl(level && (level.finalUrl || level.url || level.requestedUrl));
      if (!next || next === finalUrl) continue;
      if (!path.length || path[path.length - 1] !== next) path.push(next);
    }
    return path;
  }

  function canonicalLoop(path) {
    const values = Array.isArray(path) ? path : [];
    const seen = new Set();
    for (let index = 0; index < values.length; index += 1) {
      const url = normalizeUrl(values[index]);
      if (!url) continue;
      if (index === 1 && values.length === 2 && url === normalizeUrl(values[0])) continue;
      if (seen.has(url)) return true;
      seen.add(url);
    }
    return false;
  }

  function levelProblem(level, index) {
    const item = level || {};
    const status = Number(item.status) || 0;
    const problems = [];
    if (item.error) problems.push({ severity: 'critical', code: 'network-error', level: index, message: `Canonical target check failed: ${item.error}.` });
    else if (!status) problems.push({ severity: 'critical', code: 'missing-status', level: index, message: 'Canonical target did not return an HTTP status.' });
    else if (status >= 500) problems.push({ severity: 'critical', code: 'http-5xx', level: index, message: `Canonical target returns HTTP ${status}.` });
    else if (status >= 400) problems.push({ severity: 'critical', code: 'http-4xx', level: index, message: `Canonical target returns HTTP ${status}.` });
    if (Array.isArray(item.canonical) && item.canonical.length > 1) {
      problems.push({ severity: 'warning', code: 'multiple-canonical', level: index, message: `Canonical target declares ${item.canonical.length} canonical URLs.` });
    }
    return problems;
  }

  function analyze(input) {
    const data = input || {};
    const levels = Array.isArray(data.levels) ? data.levels : [];
    const allRedirects = [];
    for (const level of levels) {
      for (const hop of Array.isArray(level && level.redirects) ? level.redirects : []) allRedirects.push(hop);
    }
    const path = canonicalPath(data.pageUrl, data.initialCanonical, levels);
    const issues = [];
    levels.forEach((level, index) => issues.push(...levelProblem(level, index)));

    const hasCanonicalLoop = Boolean(data.loop) || canonicalLoop(path);
    const hasRedirectLoop = redirectLoop(allRedirects);
    const multiHop = path.length > 2;
    const targetRedirected = allRedirects.length > 0 || levels.some((level) => Boolean(level && level.redirected));

    if (hasCanonicalLoop) issues.push({ severity: 'critical', code: 'canonical-loop', message: `Canonical loop detected: ${path.join(' → ')}` });
    if (hasRedirectLoop) issues.push({ severity: 'critical', code: 'redirect-loop', message: 'A redirect loop was detected while checking the canonical target.' });
    if (multiHop) issues.push({ severity: 'warning', code: 'multi-hop-canonical', message: `Multi-hop canonical chain detected (${Math.max(0, path.length - 1)} canonical hops).` });
    if (targetRedirected) issues.push({ severity: 'warning', code: 'canonical-redirect', message: `Canonical target redirects through ${allRedirects.length} HTTP hop${allRedirects.length === 1 ? '' : 's'}.` });
    if (data.capped) issues.push({ severity: 'warning', code: 'canonical-cap', message: 'Canonical chain reached the configured depth limit before becoming stable.' });
    if (data.timedOut) issues.push({ severity: 'critical', code: 'scan-timeout', message: 'Canonical chain scan timed out.' });
    if (data.cancelled) issues.push({ severity: 'warning', code: 'scan-cancelled', message: 'Canonical chain scan was cancelled.' });

    const last = levels.length ? levels[levels.length - 1] : null;
    const targetStatus = levels.length ? Number(levels[0].status) || 0 : 0;
    const finalStatus = last ? Number(last.status) || 0 : 0;
    const finalUrl = last ? normalizeUrl(last.finalUrl || last.url || last.requestedUrl) : normalizeUrl(data.initialCanonical);
    const terminalCanonical = last && Array.isArray(last.canonical) && last.canonical.length
      ? normalizeUrl(last.canonical[0])
      : '';
    const stable = Boolean(last && !last.error && finalStatus > 0 && finalStatus < 400 && terminalCanonical && terminalCanonical === finalUrl && !hasCanonicalLoop && !data.capped);

    return {
      pageUrl: normalizeUrl(data.pageUrl),
      initialCanonical: normalizeUrl(data.initialCanonical),
      path,
      levels,
      redirects: allRedirects,
      targetStatus,
      finalStatus,
      finalUrl,
      terminalCanonical,
      stable,
      multiHop,
      canonicalLoop: hasCanonicalLoop,
      redirectLoop: hasRedirectLoop,
      redirected: targetRedirected,
      capped: Boolean(data.capped),
      timedOut: Boolean(data.timedOut),
      cancelled: Boolean(data.cancelled),
      issues,
      counts: {
        levels: levels.length,
        canonicalHops: Math.max(0, path.length - 1),
        redirectHops: allRedirects.length,
        critical: issues.filter((item) => item.severity === 'critical').length,
        warning: issues.filter((item) => item.severity === 'warning').length,
      },
    };
  }

  return {
    normalizeUrl,
    normalizedList,
    redirectLoop,
    canonicalPath,
    canonicalLoop,
    levelProblem,
    analyze,
  };
});
