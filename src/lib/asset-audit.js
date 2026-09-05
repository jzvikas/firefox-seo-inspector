(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssetAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LARGE_JS_BYTES = 250 * 1024;
  const LARGE_CSS_BYTES = 100 * 1024;
  const ASSET_LIMIT = 1000;

  function arrayFrom(value) {
    return Array.prototype.slice.call(value || []);
  }

  function attr(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return '';
    const value = node.getAttribute(name);
    return value === null || value === undefined ? '' : String(value);
  }

  function hasAttr(node, name) {
    return Boolean(node && typeof node.hasAttribute === 'function' && node.hasAttribute(name));
  }

  function normalizeUrl(value, baseUrl) {
    if (!value) return '';
    try {
      const url = new URL(value, baseUrl || undefined);
      url.hash = '';
      return url.href;
    } catch (_error) {
      return String(value || '');
    }
  }

  function hostOf(value) {
    try { return new URL(value).hostname.toLowerCase(); }
    catch (_error) { return ''; }
  }

  function isThirdParty(value, baseUrl) {
    try { return new URL(value, baseUrl).origin !== new URL(baseUrl).origin; }
    catch (_error) { return false; }
  }

  function relTokens(node) {
    return attr(node, 'rel').toLowerCase().split(/\s+/).filter(Boolean);
  }

  function performanceMap(performanceReport, kind) {
    const map = new Map();
    const resources = performanceReport && Array.isArray(performanceReport.resources) ? performanceReport.resources : [];
    resources.forEach((resource) => {
      if (!resource || resource.kind !== kind || !resource.url) return;
      const key = normalizeUrl(resource.url);
      const current = map.get(key);
      if (!current || (Number(resource.sizeBytes) || 0) > (Number(current.sizeBytes) || 0)) map.set(key, resource);
    });
    return map;
  }

  function resourceData(map, url) {
    const resource = map.get(normalizeUrl(url));
    if (!resource) return { sizeBytes: 0, sizeKnown: false, duration: 0, resourceTiming: false };
    const sizeBytes = Math.max(0, Number(resource.sizeBytes) || 0);
    return {
      sizeBytes,
      sizeKnown: sizeBytes > 0,
      duration: Math.max(0, Number(resource.duration) || 0),
      resourceTiming: true,
    };
  }

  function collectScripts(doc, baseUrl, performanceReport) {
    const perf = performanceMap(performanceReport, 'javascript');
    const nodes = arrayFrom(doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('script') : []).slice(0, ASSET_LIMIT);
    return nodes.map((script, index) => {
      const rawSrc = attr(script, 'src');
      const url = normalizeUrl(rawSrc, baseUrl);
      const external = Boolean(rawSrc);
      const type = attr(script, 'type').trim().toLowerCase();
      const timing = external ? resourceData(perf, url) : { sizeBytes: 0, sizeKnown: false, duration: 0, resourceTiming: false };
      return {
        index,
        external,
        inline: !external,
        url,
        thirdParty: external ? isThirdParty(url, baseUrl) : false,
        host: external ? hostOf(url) : '',
        async: hasAttr(script, 'async'),
        defer: hasAttr(script, 'defer'),
        module: type === 'module',
        nomodule: hasAttr(script, 'nomodule'),
        type: type || 'classic',
        inlineBytes: external ? 0 : String(script.textContent || '').length,
        sizeBytes: timing.sizeBytes,
        sizeKnown: timing.sizeKnown,
        duration: timing.duration,
        resourceTiming: timing.resourceTiming,
      };
    });
  }

  function collectStylesheets(doc, baseUrl, performanceReport) {
    const perf = performanceMap(performanceReport, 'css');
    const links = arrayFrom(doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('link[rel]') : []);
    const external = links.filter((link) => relTokens(link).includes('stylesheet')).slice(0, ASSET_LIMIT).map((link, index) => {
      const url = normalizeUrl(attr(link, 'href'), baseUrl);
      const timing = resourceData(perf, url);
      return {
        index,
        url,
        thirdParty: isThirdParty(url, baseUrl),
        host: hostOf(url),
        media: attr(link, 'media') || 'all',
        disabled: hasAttr(link, 'disabled'),
        sizeBytes: timing.sizeBytes,
        sizeKnown: timing.sizeKnown,
        duration: timing.duration,
        resourceTiming: timing.resourceTiming,
      };
    });
    const inlineStyles = arrayFrom(doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('style') : []).slice(0, ASSET_LIMIT).map((style, index) => ({
      index,
      bytes: String(style.textContent || '').length,
      media: attr(style, 'media') || 'all',
    }));
    return { external, inlineStyles };
  }

  function duplicateGroups(items) {
    const groups = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || !item.url) return;
      const key = normalizeUrl(item.url);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return Array.from(groups.entries())
      .filter(([, values]) => values.length > 1)
      .map(([url, values]) => ({ url, count: values.length }))
      .sort((a, b) => b.count - a.count || a.url.localeCompare(b.url));
  }

  function groupThirdPartyScripts(scripts) {
    const groups = new Map();
    (Array.isArray(scripts) ? scripts : []).forEach((script) => {
      if (!script || !script.external || !script.thirdParty || !script.host) return;
      if (!groups.has(script.host)) groups.set(script.host, { host: script.host, count: 0, knownBytes: 0, knownSizeCount: 0, urls: [] });
      const group = groups.get(script.host);
      group.count += 1;
      if (script.sizeKnown) {
        group.knownBytes += script.sizeBytes;
        group.knownSizeCount += 1;
      }
      group.urls.push(script.url);
    });
    return Array.from(groups.values()).sort((a, b) => b.knownBytes - a.knownBytes || b.count - a.count || a.host.localeCompare(b.host));
  }

  function summarizeScripts(scripts) {
    const items = Array.isArray(scripts) ? scripts : [];
    return {
      total: items.length,
      external: items.filter((item) => item.external).length,
      inline: items.filter((item) => item.inline).length,
      async: items.filter((item) => item.async).length,
      defer: items.filter((item) => item.defer).length,
      module: items.filter((item) => item.module).length,
      nomodule: items.filter((item) => item.nomodule).length,
      thirdParty: items.filter((item) => item.external && item.thirdParty).length,
    };
  }

  function buildIssues(scripts, stylesheets, duplicateScripts, duplicateStylesheets) {
    const largeJs = (scripts || []).filter((item) => item.external && item.sizeKnown && item.sizeBytes >= LARGE_JS_BYTES);
    const largeCss = (stylesheets || []).filter((item) => item.sizeKnown && item.sizeBytes >= LARGE_CSS_BYTES);
    const issues = [];
    if (duplicateScripts.length) issues.push({ severity: 'warning', code: 'duplicate-js', title: 'Duplicate JavaScript URLs', message: `${duplicateScripts.length} JavaScript URL(s) are included more than once.` });
    if (duplicateStylesheets.length) issues.push({ severity: 'warning', code: 'duplicate-css', title: 'Duplicate stylesheet URLs', message: `${duplicateStylesheets.length} stylesheet URL(s) are included more than once.` });
    if (largeJs.length) issues.push({ severity: 'warning', code: 'large-js', title: 'Large JavaScript resources', message: `${largeJs.length} JavaScript resource(s) are at least ${Math.round(LARGE_JS_BYTES / 1024)} KiB based on known Resource Timing size.` });
    if (largeCss.length) issues.push({ severity: 'warning', code: 'large-css', title: 'Large CSS resources', message: `${largeCss.length} stylesheet resource(s) are at least ${Math.round(LARGE_CSS_BYTES / 1024)} KiB based on known Resource Timing size.` });
    return { issues, largeJs, largeCss };
  }

  function collect(doc, baseUrl, performanceReport) {
    const scripts = collectScripts(doc, baseUrl, performanceReport);
    const stylesheetData = collectStylesheets(doc, baseUrl, performanceReport);
    const stylesheets = stylesheetData.external;
    const duplicateScripts = duplicateGroups(scripts.filter((item) => item.external));
    const duplicateStylesheets = duplicateGroups(stylesheets);
    const thirdPartyGroups = groupThirdPartyScripts(scripts);
    const issueData = buildIssues(scripts, stylesheets, duplicateScripts, duplicateStylesheets);
    return {
      thresholds: { largeJsBytes: LARGE_JS_BYTES, largeCssBytes: LARGE_CSS_BYTES },
      scripts,
      scriptSummary: summarizeScripts(scripts),
      stylesheets,
      inlineStyles: stylesheetData.inlineStyles,
      duplicateScripts,
      duplicateStylesheets,
      thirdPartyGroups,
      largeJs: issueData.largeJs,
      largeCss: issueData.largeCss,
      issues: issueData.issues,
      capped: {
        scripts: Boolean(doc && typeof doc.querySelectorAll === 'function' && doc.querySelectorAll('script').length > ASSET_LIMIT),
        stylesheets: Boolean(doc && typeof doc.querySelectorAll === 'function' && doc.querySelectorAll('link[rel]').length > ASSET_LIMIT),
        inlineStyles: Boolean(doc && typeof doc.querySelectorAll === 'function' && doc.querySelectorAll('style').length > ASSET_LIMIT),
      },
    };
  }

  return {
    LARGE_JS_BYTES,
    LARGE_CSS_BYTES,
    ASSET_LIMIT,
    normalizeUrl,
    hostOf,
    isThirdParty,
    performanceMap,
    resourceData,
    collectScripts,
    collectStylesheets,
    duplicateGroups,
    groupThirdPartyScripts,
    summarizeScripts,
    buildIssues,
    collect,
  };
});
