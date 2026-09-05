(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PaginationAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PAGE_PARAMS = new Set(['page', 'p', 'pg', 'pageno', 'page_no', 'offset', 'start']);

  function clean(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      url.hash = '';
      return url;
    } catch (_error) {
      return null;
    }
  }

  function isPageParam(name) {
    const key = clean(name).toLowerCase();
    return PAGE_PARAMS.has(key) || /^page\d*$/.test(key);
  }

  function pageSignal(value) {
    const url = safeUrl(value);
    if (!url) return { detected: false, number: 1, source: '', raw: '' };
    for (const [name, raw] of url.searchParams.entries()) {
      if (!isPageParam(name)) continue;
      const number = Number.parseInt(String(raw || ''), 10);
      const key = String(name).toLowerCase();
      if ((key === 'offset' || key === 'start') && Number.isInteger(number) && number > 0) {
        return { detected: true, number: null, source: name, raw: String(raw) };
      }
      if (Number.isInteger(number) && number >= 1) return { detected: true, number, source: name, raw: String(raw) };
      return { detected: true, number: null, source: name, raw: String(raw) };
    }
    const pathMatch = url.pathname.match(/(?:^|\/)(?:page|p)\/(\d+)(?:\/|$)/i);
    if (pathMatch) {
      return { detected: true, number: Number.parseInt(pathMatch[1], 10) || null, source: 'path', raw: pathMatch[1] };
    }
    return { detected: false, number: 1, source: '', raw: '' };
  }

  function familyKey(value) {
    const url = safeUrl(value);
    if (!url) return '';
    for (const name of Array.from(url.searchParams.keys())) {
      if (isPageParam(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    url.pathname = url.pathname
      .replace(/(?:^|\/)(?:page|p)\/\d+(?=\/|$)/ig, '')
      .replace(/\/+/g, '/');
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    return url.href;
  }

  function normalizedValue(value) {
    return clean(value).toLocaleLowerCase();
  }

  function paginationFamilies(rows) {
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || row.available === false) continue;
      const url = safeUrl(row.url);
      if (!url) continue;
      const key = familyKey(url.href);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return Array.from(groups.entries())
      .map(([key, items]) => {
        const distinctUrls = Array.from(new Set(items.map((item) => safeUrl(item.url)).filter(Boolean).map((url) => url.href)));
        const hasPaginationSignal = items.some((item) => pageSignal(item.url).detected);
        return { key, items, distinctUrls, hasPaginationSignal };
      })
      .filter((group) => group.distinctUrls.length > 1 && group.hasPaginationSignal);
  }

  function duplicateGroups(rows, field) {
    const output = [];
    for (const family of paginationFamilies(rows)) {
      const values = new Map();
      for (const row of family.items) {
        const value = normalizedValue(row && row[field]);
        if (!value) continue;
        if (!values.has(value)) values.set(value, []);
        values.get(value).push(row);
      }
      for (const items of values.values()) {
        const urls = Array.from(new Set(items.map((item) => String(item.url || '')))).filter(Boolean);
        if (urls.length < 2) continue;
        output.push({
          family: family.key,
          field,
          value: clean(items[0] && items[0][field]).slice(0, 500),
          count: urls.length,
          urls,
          tabIds: items.map((item) => Number(item.tabId) || 0).filter(Boolean),
        });
      }
    }
    return output.sort((a, b) => b.count - a.count || a.family.localeCompare(b.family) || a.value.localeCompare(b.value));
  }

  function annotateRows(rows) {
    const output = (Array.isArray(rows) ? rows : []).map((row) => Object.assign({}, row, {
      paginationFamily: familyKey(row && row.url),
      duplicatePaginationTitle: false,
      duplicatePaginationDescription: false,
    }));
    const titleUrls = new Set(duplicateGroups(output, 'title').flatMap((group) => group.urls));
    const descriptionUrls = new Set(duplicateGroups(output, 'description').flatMap((group) => group.urls));
    output.forEach((row) => {
      row.duplicatePaginationTitle = titleUrls.has(row.url);
      row.duplicatePaginationDescription = descriptionUrls.has(row.url);
    });
    return {
      rows: output,
      titles: duplicateGroups(output, 'title'),
      descriptions: duplicateGroups(output, 'description'),
    };
  }

  function normalizeResultUrl(value) {
    const url = safeUrl(value);
    return url ? url.href : '';
  }

  function summarizeLinkResults(links, results) {
    const byUrl = new Map();
    for (const result of Array.isArray(results) ? results : []) {
      const key = normalizeResultUrl(result && result.url);
      if (key) byUrl.set(key, result);
    }
    const rows = [];
    for (const link of Array.isArray(links) ? links : []) {
      const href = normalizeResultUrl(link && link.href);
      if (!href) continue;
      const result = byUrl.get(href) || null;
      let state = 'unchecked';
      if (result) {
        if (result.error || !Number(result.status)) state = 'unknown';
        else if (Number(result.status) >= 400) state = 'broken';
        else if (result.redirected || (Number(result.status) >= 300 && Number(result.status) < 400)) state = 'redirect';
        else state = 'ok';
      }
      rows.push({
        href,
        label: clean(link && link.label),
        ref: link && link.ref || null,
        status: result ? Number(result.status) || 0 : 0,
        finalUrl: result ? normalizeResultUrl(result.finalUrl) || href : href,
        error: result ? clean(result.error) : '',
        state,
      });
    }
    return {
      rows,
      checked: rows.filter((row) => row.state !== 'unchecked').length,
      ok: rows.filter((row) => row.state === 'ok').length,
      broken: rows.filter((row) => row.state === 'broken').length,
      redirect: rows.filter((row) => row.state === 'redirect').length,
      unknown: rows.filter((row) => row.state === 'unknown').length,
      brokenRefs: rows.filter((row) => row.state === 'broken' && row.ref).map((row) => row.ref).slice(0, 50),
    };
  }

  return {
    PAGE_PARAMS,
    isPageParam,
    pageSignal,
    familyKey,
    paginationFamilies,
    duplicateGroups,
    annotateRows,
    summarizeLinkResults,
  };
});
