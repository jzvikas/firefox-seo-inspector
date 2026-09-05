(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MultiTabAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_TABS = 100;
  const CONCURRENCY = 6;
  const INDEXABILITY_VALUES = new Set(['Indexable', 'Noindex', 'Blocked', 'Canonicalized', 'Redirected', 'Error', 'Unknown']);

  function cleanText(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 500);
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_error) {
      return false;
    }
  }

  function selectTabs(tabs, maxTabs) {
    const limit = Math.max(1, Math.min(MAX_TABS, Number(maxTabs) || MAX_TABS));
    const seen = new Set();
    const output = [];
    for (const tab of Array.isArray(tabs) ? tabs : []) {
      if (!tab || !Number.isInteger(tab.id) || seen.has(tab.id) || !isHttpUrl(tab.url)) continue;
      seen.add(tab.id);
      output.push({ id: tab.id, url: String(tab.url), title: cleanText(tab.title, 200), windowId: Number(tab.windowId) || 0, active: Boolean(tab.active) });
      if (output.length >= limit) break;
    }
    return output;
  }

  function robotsSummary(facts) {
    const rows = Array.isArray(facts && facts.robots) ? facts.robots : [];
    return rows.map((item) => cleanText(item && item.content, 120)).filter(Boolean).join(' | ');
  }

  function firstH1(facts) {
    const rows = Array.isArray(facts && facts.headings) ? facts.headings : [];
    const h1 = rows.find((item) => Number(item && item.level) === 1);
    return h1 ? cleanText(h1.text, 300) : '';
  }

  function h1Count(facts) {
    return (Array.isArray(facts && facts.headings) ? facts.headings : []).filter((item) => Number(item && item.level) === 1).length;
  }

  function verdict(report) {
    const raw = cleanText(report && report.evaluation && report.evaluation.indexability && report.evaluation.indexability.verdict, 40) || 'Unknown';
    return INDEXABILITY_VALUES.has(raw) ? raw : 'Unknown';
  }

  function summarizeReport(tab, report) {
    const facts = report && report.facts ? report.facts : {};
    const evaluation = report && report.evaluation ? report.evaluation : {};
    const responseMeta = report && report.responseMeta ? report.responseMeta : {};
    const issues = Array.isArray(evaluation.issues) ? evaluation.issues : [];
    const severity = evaluation.severityCounts || {};
    const url = isHttpUrl(facts.url) ? String(facts.url) : String(tab && tab.url || '');
    return {
      tabId: Number(tab && tab.id) || 0,
      windowId: Number(tab && tab.windowId) || 0,
      available: true,
      error: '',
      url,
      tabTitle: cleanText(tab && tab.title, 200),
      title: cleanText(facts.title, 500),
      description: cleanText(facts.description, 1200),
      h1: firstH1(facts),
      h1Count: h1Count(facts),
      canonical: cleanText(facts.canonical && facts.canonical.href, 1200),
      robots: robotsSummary(facts),
      indexability: verdict(report),
      statusCode: Number(responseMeta.statusCode) || 0,
      score: Number.isFinite(Number(evaluation.score)) ? Number(evaluation.score) : null,
      critical: Number(severity.critical) || issues.filter((item) => item && item.severity === 'critical').length,
      warnings: Number(severity.warning) || issues.filter((item) => item && item.severity === 'warning').length,
      issueCount: issues.length,
      duplicateTitle: false,
      duplicateDescription: false,
      duplicateH1: false,
    };
  }

  function unavailableRow(tab, reason) {
    return {
      tabId: Number(tab && tab.id) || 0,
      windowId: Number(tab && tab.windowId) || 0,
      available: false,
      error: cleanText(reason || 'unavailable', 200),
      url: String(tab && tab.url || ''),
      tabTitle: cleanText(tab && tab.title, 200),
      title: '', description: '', h1: '', h1Count: 0, canonical: '', robots: '',
      indexability: 'Unknown', statusCode: 0, score: null, critical: 0, warnings: 0, issueCount: 0,
      duplicateTitle: false, duplicateDescription: false, duplicateH1: false,
    };
  }

  function normalizedDuplicateValue(value) {
    return cleanText(value, 2000).toLocaleLowerCase();
  }

  function duplicateGroups(rows, field) {
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || !row.available) continue;
      const value = normalizedDuplicateValue(row[field]);
      if (!value) continue;
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(row);
    }
    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({ key, value: cleanText(items[0][field], 500), count: items.length, tabIds: items.map((item) => item.tabId), urls: items.map((item) => item.url) }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }

  function annotateDuplicates(rows) {
    const output = (Array.isArray(rows) ? rows : []).map((row) => Object.assign({}, row));
    const specs = [['title', 'duplicateTitle'], ['description', 'duplicateDescription'], ['h1', 'duplicateH1']];
    for (const [field, flag] of specs) {
      const ids = new Set(duplicateGroups(output, field).flatMap((group) => group.tabIds));
      output.forEach((row) => { row[flag] = ids.has(row.tabId); });
    }
    return output;
  }

  function duplicateSummary(rows) {
    const annotated = annotateDuplicates(rows);
    return {
      rows: annotated,
      titles: duplicateGroups(annotated, 'title'),
      descriptions: duplicateGroups(annotated, 'description'),
      h1: duplicateGroups(annotated, 'h1'),
    };
  }

  function sortRows(rows, key, direction) {
    const allowed = new Set(['url', 'title', 'statusCode', 'indexability', 'score', 'issueCount', 'critical', 'warnings', 'h1']);
    const field = allowed.has(key) ? key : 'url';
    const dir = direction === 'desc' ? -1 : 1;
    return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
      const av = a && a[field];
      const bv = b && b[field];
      if (typeof av === 'number' || typeof bv === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
      return String(av || '').localeCompare(String(bv || '')) * dir;
    });
  }

  function filterRows(rows, options) {
    const opts = options || {};
    const query = cleanText(opts.query, 200).toLocaleLowerCase();
    const indexability = cleanText(opts.indexability, 40);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (!row) return false;
      if (opts.availableOnly && !row.available) return false;
      if (opts.issuesOnly && !(row.issueCount > 0)) return false;
      if (opts.duplicatesOnly && !(row.duplicateTitle || row.duplicateDescription || row.duplicateH1)) return false;
      if (indexability && indexability !== 'All' && row.indexability !== indexability) return false;
      if (query) {
        const haystack = [row.url, row.title, row.description, row.h1, row.canonical, row.robots, row.tabTitle].join('\n').toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function csvCell(value) {
    const text = String(value === null || value === undefined ? '' : value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCsv(rows) {
    const columns = [
      ['url', 'URL'], ['statusCode', 'Status'], ['title', 'Title'], ['description', 'Description'], ['h1', 'H1'], ['h1Count', 'H1 count'],
      ['canonical', 'Canonical'], ['robots', 'Robots'], ['indexability', 'Indexability'], ['score', 'Score'], ['critical', 'Critical'], ['warnings', 'Warnings'],
      ['issueCount', 'Issues'], ['duplicateTitle', 'Duplicate title'], ['duplicateDescription', 'Duplicate description'], ['duplicateH1', 'Duplicate H1'], ['available', 'Available'], ['error', 'Error'],
    ];
    const lines = [columns.map(([, label]) => csvCell(label)).join(',')];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      lines.push(columns.map(([key]) => csvCell(row && row[key])).join(','));
    });
    return `${lines.join('\r\n')}\r\n`;
  }

  function toJson(rows, duplicateData) {
    return JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), rows: Array.isArray(rows) ? rows : [], duplicates: duplicateData || null }, null, 2);
  }

  return {
    MAX_TABS,
    CONCURRENCY,
    isHttpUrl,
    selectTabs,
    summarizeReport,
    unavailableRow,
    duplicateGroups,
    annotateDuplicates,
    duplicateSummary,
    sortRows,
    filterRows,
    csvCell,
    toCsv,
    toJson,
  };
});
