(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HreflangAudit = api;
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

  function normalizeTag(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.toLowerCase() === 'x-default') return 'x-default';
    const parts = raw.split('-').filter(Boolean);
    return parts.map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^[A-Za-z]{4}$/.test(part)) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) return part.toUpperCase();
      return part.toLowerCase();
    }).join('-');
  }

  function isValidTag(value) {
    const tag = normalizeTag(value);
    if (tag === 'x-default') return true;
    if (!tag) return false;
    const parts = tag.split('-');
    if (!/^[a-z]{2,3}$/.test(parts[0])) return false;
    let index = 1;
    if (parts[index] && /^[A-Z][a-z]{3}$/.test(parts[index])) index += 1;
    if (parts[index] && /^(?:[A-Z]{2}|\d{3})$/.test(parts[index])) index += 1;
    for (; index < parts.length; index += 1) {
      if (!/^(?:[a-z0-9]{5,8}|\d[a-z0-9]{3})$/i.test(parts[index])) return false;
    }
    return true;
  }

  function directives(values) {
    const result = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const content = typeof value === 'string' ? value : value && value.content ? value.content : '';
      String(content).toLowerCase().split(/[;,]/).map((item) => item.trim()).filter(Boolean).forEach((item) => result.add(item.split(':')[0].trim()));
    }
    return result;
  }

  function hasNoindex(robots, xRobotsTag) {
    return directives(robots).has('noindex') || directives(xRobotsTag).has('noindex');
  }

  function local(entries, currentUrl) {
    const items = (Array.isArray(entries) ? entries : []).map((entry, index) => ({
      index,
      lang: String(entry.lang || '').trim(),
      normalizedLang: normalizeTag(entry.lang),
      href: normalizeUrl(entry.href),
      ref: entry.ref || null,
    }));
    const current = normalizeUrl(currentUrl);
    const issues = [];
    const byLang = new Map();
    for (const item of items) {
      if (!isValidTag(item.lang)) issues.push({ severity: 'warning', code: 'invalid-tag', index: item.index, message: `Invalid or unsupported hreflang tag: ${item.lang || '(empty)'}` });
      if (!byLang.has(item.normalizedLang)) byLang.set(item.normalizedLang, []);
      byLang.get(item.normalizedLang).push(item);
    }
    for (const [tag, values] of byLang.entries()) {
      if (!tag || values.length < 2) continue;
      const urls = new Set(values.map((item) => item.href));
      issues.push({ severity: 'warning', code: 'duplicate-tag', tag, message: urls.size > 1 ? `Hreflang ${tag} points to multiple URLs.` : `Hreflang ${tag} is declared ${values.length} times.` });
    }
    const self = items.filter((item) => item.href === current && item.normalizedLang !== 'x-default');
    if (items.length && !self.length) issues.push({ severity: 'warning', code: 'missing-self', message: 'No self-referencing hreflang was found for the current URL.' });
    const xDefault = items.filter((item) => item.normalizedLang === 'x-default');
    if (items.length && !xDefault.length) issues.push({ severity: 'warning', code: 'missing-x-default', message: 'No x-default hreflang was found.' });
    if (xDefault.length > 1) issues.push({ severity: 'warning', code: 'duplicate-x-default', message: 'Multiple x-default hreflang entries were found.' });

    return {
      currentUrl: current,
      items,
      selfTags: self.map((item) => item.normalizedLang),
      hasSelfReference: Boolean(self.length),
      hasXDefault: Boolean(xDefault.length),
      issues,
    };
  }

  function targetResult(item, current, sourceTags, network) {
    const data = network || {};
    const status = Number(data.status) || 0;
    const finalUrl = normalizeUrl(data.url || data.finalUrl || item.href);
    const canonical = data.canonical && data.canonical.length ? normalizeUrl(data.canonical[0]) : '';
    const targetHreflang = Array.isArray(data.hreflang) ? data.hreflang.map((entry) => ({
      lang: normalizeTag(entry.lang),
      href: normalizeUrl(entry.href),
    })) : [];
    const backlinks = targetHreflang.filter((entry) => entry.href === current);
    const reciprocal = sourceTags.length
      ? backlinks.some((entry) => sourceTags.includes(entry.lang))
      : backlinks.length > 0;
    const noindex = hasNoindex(data.robots, data.xRobotsTag);
    const canonicalMismatch = Boolean(canonical && canonical !== finalUrl);
    let level = 'ok';
    const problems = [];

    if (data.error || !status) {
      level = 'critical';
      problems.push(data.error || 'network');
    } else if (status >= 400) {
      level = 'critical';
      problems.push(`HTTP ${status}`);
    }
    if (data.redirected) {
      if (level === 'ok') level = 'warning';
      problems.push('redirect');
    }
    if (noindex) {
      level = 'critical';
      problems.push('noindex');
    }
    if (canonicalMismatch) {
      if (level === 'ok') level = 'warning';
      problems.push('canonical mismatch');
    }
    if (!reciprocal) {
      if (level === 'ok') level = 'warning';
      problems.push('missing reciprocal');
    }

    return {
      lang: item.normalizedLang,
      href: item.href,
      status,
      statusText: data.statusText || '',
      finalUrl,
      redirected: Boolean(data.redirected),
      canonical,
      noindex,
      reciprocal,
      canonicalMismatch,
      level,
      problems,
      error: data.error || null,
      sizeBytes: Number(data.sizeBytes) || 0,
    };
  }

  function analyze(entries, currentUrl, networkResults) {
    const localResult = local(entries, currentUrl);
    const map = new Map();
    for (const item of Array.isArray(networkResults) ? networkResults : []) {
      map.set(normalizeUrl(item.requestedUrl || item.url), item);
    }
    const targets = localResult.items.map((item) => targetResult(
      item,
      localResult.currentUrl,
      localResult.selfTags,
      map.get(item.href),
    ));
    return {
      ...localResult,
      targets,
      counts: {
        total: targets.length,
        critical: targets.filter((item) => item.level === 'critical').length,
        warning: targets.filter((item) => item.level === 'warning').length,
        ok: targets.filter((item) => item.level === 'ok').length,
      },
    };
  }

  return {
    normalizeUrl,
    normalizeTag,
    isValidTag,
    directives,
    hasNoindex,
    local,
    targetResult,
    analyze,
  };
});
