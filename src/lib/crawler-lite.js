(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CrawlerLite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_URLS = 250;
  const MAX_DEPTH = 3;
  const CONCURRENCY = 6;
  const REQUEST_TIMEOUT_MS = 12000;
  const MAX_HTML_BYTES = 2 * 1024 * 1024;

  function text(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 1000);
  }

  function normalizeUrl(value, base) {
    try {
      const url = new URL(String(value || ''), base || undefined);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      url.hash = '';
      return url.href;
    } catch (_error) {
      return '';
    }
  }

  function hostname(value) {
    try { return new URL(value).hostname.toLowerCase(); } catch (_error) { return ''; }
  }

  function sameHostname(url, seedUrl) {
    const left = hostname(url);
    const right = hostname(seedUrl);
    return Boolean(left && right && left === right);
  }

  function clampInteger(value, fallback, min, max) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function normalizeOptions(input) {
    const source = input || {};
    return {
      urlLimit: clampInteger(source.urlLimit, 100, 1, MAX_URLS),
      depthLimit: clampInteger(source.depthLimit, 2, 0, MAX_DEPTH),
      sameHostnameOnly: source.sameHostnameOnly !== false,
    };
  }

  function discoverLinks(facts, seedUrl, options) {
    const opts = normalizeOptions(options);
    const pageUrl = normalizeUrl(facts && facts.url) || normalizeUrl(seedUrl);
    const output = [];
    const seen = new Set();
    for (const link of Array.isArray(facts && facts.links) ? facts.links : []) {
      if (!link || link.kind !== 'http') continue;
      const url = normalizeUrl(link.href || link.rawHref, pageUrl);
      if (!url || seen.has(url)) continue;
      if (opts.sameHostnameOnly && !sameHostname(url, seedUrl)) continue;
      seen.add(url);
      output.push(url);
    }
    return output;
  }

  function nextFrontier(discovered, seenInput, remaining) {
    const seen = seenInput instanceof Set ? seenInput : new Set(Array.isArray(seenInput) ? seenInput : []);
    const limit = Math.max(0, Number(remaining) || 0);
    const output = [];
    for (const value of Array.isArray(discovered) ? discovered : []) {
      const url = normalizeUrl(value);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      output.push(url);
      if (output.length >= limit) break;
    }
    return { urls: output, seen };
  }

  function firstH1(facts) {
    const headings = Array.isArray(facts && facts.headings) ? facts.headings : [];
    const h1 = headings.find((item) => Number(item && item.level) === 1);
    return h1 ? text(h1.text, 300) : '';
  }

  function robots(facts) {
    return (Array.isArray(facts && facts.robots) ? facts.robots : [])
      .map((item) => text(item && item.content, 120))
      .filter(Boolean)
      .join(' | ');
  }

  function indexability(report) {
    return text(report && report.evaluation && report.evaluation.indexability && report.evaluation.indexability.verdict, 40) || 'Unknown';
  }

  function pageTypeSummary(report) {
    const value = report && report.pageType ? report.pageType : {};
    const traits = value.traits || {};
    return {
      pageType: text(value.label || value.primary, 80),
      pageTypePrimary: text(value.primary, 40),
      pageTypeConfidence: text(value.confidence, 20),
      pageTraits: [traits.faceted ? 'Faceted' : '', traits.pagination ? 'Pagination' : ''].filter(Boolean).join(' · '),
    };
  }

  function summarize(resource, report, depth, sourceUrl) {
    const facts = report && report.facts ? report.facts : {};
    const evaluation = report && report.evaluation ? report.evaluation : {};
    const responseMeta = report && report.responseMeta ? report.responseMeta : (resource && resource.responseMeta ? resource.responseMeta : {});
    const issues = Array.isArray(evaluation.issues) ? evaluation.issues : [];
    const counts = evaluation.severityCounts || {};
    const requestedUrl = normalizeUrl(resource && resource.requestedUrl) || normalizeUrl(facts.url);
    const finalUrl = normalizeUrl(resource && resource.url) || normalizeUrl(facts.url) || requestedUrl;
    return Object.assign({
      depth: clampInteger(depth, 0, 0, MAX_DEPTH),
      sourceUrl: normalizeUrl(sourceUrl) || '',
      requestedUrl,
      url: finalUrl,
      redirected: Boolean(resource && resource.redirected) || Boolean(requestedUrl && finalUrl && requestedUrl !== finalUrl),
      statusCode: Number(responseMeta.statusCode || (resource && resource.status)) || 0,
      available: true,
      error: '',
      title: text(facts.title, 500),
      description: text(facts.description, 1200),
      h1: firstH1(facts),
      canonical: text(facts.canonical && facts.canonical.href, 1200),
      robots: robots(facts),
      indexability: indexability(report),
      score: Number.isFinite(Number(evaluation.score)) ? Number(evaluation.score) : null,
      critical: Number(counts.critical) || issues.filter((item) => item && item.severity === 'critical').length,
      warnings: Number(counts.warning) || issues.filter((item) => item && item.severity === 'warning').length,
      issueCount: issues.length,
      linkCount: Array.isArray(facts.links) ? facts.links.filter((item) => item && item.kind === 'http').length : 0,
      duplicateTitle: false,
      duplicateDescription: false,
      duplicateH1: false,
    }, pageTypeSummary(report));
  }

  function errorRow(url, depth, sourceUrl, resource) {
    const normalized = normalizeUrl(url);
    const finalUrl = normalizeUrl(resource && resource.url) || normalized;
    return {
      depth: clampInteger(depth, 0, 0, MAX_DEPTH),
      sourceUrl: normalizeUrl(sourceUrl) || '',
      requestedUrl: normalized,
      url: finalUrl,
      redirected: Boolean(resource && resource.redirected) || Boolean(normalized && finalUrl && normalized !== finalUrl),
      statusCode: Number(resource && resource.status) || 0,
      available: false,
      error: text(resource && resource.error || 'network', 100),
      title: '', description: '', h1: '', canonical: '', robots: '', indexability: 'Unknown', score: null,
      pageType: '', pageTypePrimary: '', pageTypeConfidence: '', pageTraits: '',
      critical: 0, warnings: 0, issueCount: 0, linkCount: 0,
      duplicateTitle: false, duplicateDescription: false, duplicateH1: false,
    };
  }

  function duplicateGroups(rows, field) {
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || !row.available) continue;
      const value = text(row[field], 2000).toLocaleLowerCase();
      if (!value) continue;
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(row);
    }
    return Array.from(groups.values())
      .filter((items) => items.length > 1)
      .map((items) => ({ value: text(items[0][field], 500), count: items.length, urls: items.map((item) => item.url) }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  function annotateDuplicates(rows) {
    const output = (Array.isArray(rows) ? rows : []).map((row) => Object.assign({}, row));
    for (const [field, flag] of [['title', 'duplicateTitle'], ['description', 'duplicateDescription'], ['h1', 'duplicateH1']]) {
      const urls = new Set(duplicateGroups(output, field).flatMap((group) => group.urls));
      output.forEach((row) => { row[flag] = urls.has(row.url); });
    }
    return {
      rows: output,
      titles: duplicateGroups(output, 'title'),
      descriptions: duplicateGroups(output, 'description'),
      h1: duplicateGroups(output, 'h1'),
    };
  }

  function filterRows(rows, input) {
    const options = input || {};
    const query = text(options.query, 200).toLocaleLowerCase();
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (!row) return false;
      if (options.errorsOnly && row.available && row.statusCode < 400) return false;
      if (options.redirectsOnly && !row.redirected) return false;
      if (options.duplicatesOnly && !(row.duplicateTitle || row.duplicateDescription || row.duplicateH1)) return false;
      if (options.issuesOnly && !(row.issueCount > 0)) return false;
      if (query) {
        const haystack = [row.url, row.title, row.description, row.h1, row.canonical, row.robots, row.pageType, row.pageTraits].join('\n').toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function sortRows(rows, key, direction) {
    const allowed = new Set(['depth', 'url', 'pageType', 'statusCode', 'title', 'h1', 'indexability', 'score', 'issueCount']);
    const field = allowed.has(key) ? key : 'depth';
    const dir = direction === 'desc' ? -1 : 1;
    return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
      const av = a && a[field];
      const bv = b && b[field];
      if (typeof av === 'number' || typeof bv === 'number') {
        const delta = (Number(av) || 0) - (Number(bv) || 0);
        if (delta) return delta * dir;
      } else {
        const delta = String(av || '').localeCompare(String(bv || ''));
        if (delta) return delta * dir;
      }
      return String(a && a.url || '').localeCompare(String(b && b.url || ''));
    });
  }

  function csvCell(value) {
    const valueText = String(value === null || value === undefined ? '' : value);
    return /[",\r\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText;
  }

  function toCsv(rows) {
    const columns = [
      ['depth', 'Depth'], ['requestedUrl', 'Requested URL'], ['url', 'Final URL'], ['statusCode', 'Status'], ['redirected', 'Redirected'],
      ['pageType', 'Page type'], ['pageTypeConfidence', 'Page type confidence'], ['pageTraits', 'Page traits'],
      ['title', 'Title'], ['description', 'Description'], ['h1', 'H1'], ['canonical', 'Canonical'], ['robots', 'Robots'], ['indexability', 'Indexability'],
      ['score', 'Score'], ['critical', 'Critical'], ['warnings', 'Warnings'], ['issueCount', 'Issues'], ['linkCount', 'Links'],
      ['duplicateTitle', 'Duplicate title'], ['duplicateDescription', 'Duplicate description'], ['duplicateH1', 'Duplicate H1'], ['sourceUrl', 'Discovered from'], ['error', 'Error'],
    ];
    const lines = [columns.map(([, label]) => csvCell(label)).join(',')];
    for (const row of Array.isArray(rows) ? rows : []) lines.push(columns.map(([key]) => csvCell(row && row[key])).join(','));
    return `${lines.join('\r\n')}\r\n`;
  }

  function toJson(seedUrl, options, rows, duplicates) {
    return JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      seedUrl: normalizeUrl(seedUrl),
      options: normalizeOptions(options),
      rows: Array.isArray(rows) ? rows : [],
      duplicates: duplicates || null,
    }, null, 2);
  }

  return {
    MAX_URLS,
    MAX_DEPTH,
    CONCURRENCY,
    REQUEST_TIMEOUT_MS,
    MAX_HTML_BYTES,
    normalizeUrl,
    hostname,
    sameHostname,
    normalizeOptions,
    discoverLinks,
    nextFrontier,
    summarize,
    errorRow,
    duplicateGroups,
    annotateDuplicates,
    filterRows,
    sortRows,
    csvCell,
    toCsv,
    toJson,
  };
});
