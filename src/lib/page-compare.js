(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PageCompare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_DETAIL_ITEMS = 80;
  const MAX_DETAIL_TEXT = 160;

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sortedUnique(values) {
    return Array.from(new Set((values || []).map((value) => cleanText(value)).filter(Boolean))).sort();
  }

  function capText(value) {
    const text = cleanText(value);
    return text.length > MAX_DETAIL_TEXT ? `${text.slice(0, MAX_DETAIL_TEXT - 1)}…` : text;
  }

  function capList(values) {
    const source = Array.isArray(values) ? values : [];
    const items = source.slice(0, MAX_DETAIL_ITEMS).map(capText);
    if (source.length > MAX_DETAIL_ITEMS) items.push(`… +${source.length - MAX_DETAIL_ITEMS} more`);
    return items;
  }

  function schemaTypes(schemas) {
    return sortedUnique((schemas || []).flatMap((schema) => schema && Array.isArray(schema.types) ? schema.types : []));
  }

  function issueSummary(evaluation) {
    const issues = evaluation && Array.isArray(evaluation.issues) ? evaluation.issues : [];
    return {
      total: issues.length,
      critical: issues.filter((item) => item && item.severity === 'critical').length,
      warning: issues.filter((item) => item && item.severity === 'warning').length,
      ids: sortedUnique(issues.map((item) => item && item.id)),
    };
  }

  function securityHeaderMap(report) {
    const rows = report && report.securityAudit && Array.isArray(report.securityAudit.headers)
      ? report.securityAudit.headers
      : [];
    const output = {};
    for (const row of rows) {
      if (!row || !row.key) continue;
      output[String(row.key)] = {
        state: String(row.state || ''),
        value: String(row.value || ''),
      };
    }
    return output;
  }

  function summarize(report) {
    const source = report || {};
    const facts = source.facts || {};
    const evaluation = source.evaluation || {};
    const response = source.responseMeta || {};
    const headings = Array.isArray(facts.headings) ? facts.headings : [];
    const links = Array.isArray(facts.links) ? facts.links : [];
    const images = Array.isArray(facts.images) ? facts.images : [];
    const schemas = Array.isArray(facts.schemas) ? facts.schemas : [];
    const hreflang = Array.isArray(facts.hreflang) ? facts.hreflang : [];
    const robots = sortedUnique((facts.robots || []).map((item) => item && item.content));
    const securityHeaders = securityHeaderMap(source);
    const issues = issueSummary(evaluation);
    const indexability = evaluation.indexability || null;

    const httpLinks = links.filter((item) => item && item.kind === 'http');
    const linkTargets = sortedUnique(httpLinks.map((item) => item.href));
    const imageSources = sortedUnique(images.map((item) => item && item.src));
    const headingOutline = headings.map((item) => `H${Number(item && item.level) || 0} ${cleanText(item && item.text)}`);
    const hreflangEntries = hreflang
      .map((item) => `${String(item && item.lang || '').toLowerCase()} → ${String(item && item.href || '')}`)
      .sort();

    return {
      url: String(facts.url || ''),
      status: typeof response.statusCode === 'number' ? response.statusCode : null,
      title: String(facts.title || ''),
      description: String(facts.description || ''),
      canonical: facts.canonical ? String(facts.canonical.href || '') : '',
      robots,
      indexability: indexability ? String(indexability.verdict || '') : '',
      score: typeof evaluation.score === 'number' ? evaluation.score : null,
      headings: {
        total: headings.length,
        h1: capList(headings.filter((item) => Number(item && item.level) === 1).map((item) => item.text || '')),
        outline: capList(headingOutline),
      },
      links: {
        total: links.length,
        internal: httpLinks.filter((item) => item.internal).length,
        external: httpLinks.filter((item) => !item.internal).length,
        nofollow: httpLinks.filter((item) => item.nofollow).length,
        sponsored: httpLinks.filter((item) => item.sponsored).length,
        ugc: httpLinks.filter((item) => item.ugc).length,
        targets: capList(linkTargets),
      },
      images: {
        total: images.length,
        missingAlt: images.filter((item) => item && !item.altPresent).length,
        missingDimensions: images.filter((item) => item && (!item.widthAttr || !item.heightAttr)).length,
        sources: capList(imageSources),
      },
      schema: {
        types: schemaTypes(schemas),
        invalid: schemas.filter((item) => item && item.valid === false).length,
      },
      hreflang: {
        count: hreflang.length,
        entries: capList(hreflangEntries),
      },
      headers: {
        xRobotsTag: sortedUnique(response.xRobotsTag || []),
        contentType: sortedUnique(response.contentType || []),
        contentLanguage: sortedUnique(response.contentLanguage || []),
        cacheControl: sortedUnique(response.cacheControl || []),
        csp: securityHeaders.csp || null,
        hsts: securityHeaders.hsts || null,
        xfo: securityHeaders.xfo || null,
        referrer: securityHeaders.referrer || null,
        permissions: securityHeaders.permissions || null,
        xcto: securityHeaders.xcto || null,
      },
      issues,
    };
  }

  function display(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.length ? value.join('\n') : '—';
    if (typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'state') || Object.prototype.hasOwnProperty.call(value, 'value')) {
        const state = cleanText(value.state);
        const raw = cleanText(value.value);
        return raw ? `${state || 'present'} · ${raw}` : (state || '—');
      }
      return JSON.stringify(value);
    }
    return String(value);
  }

  function row(category, field, left, right) {
    const leftDisplay = display(left);
    const rightDisplay = display(right);
    return {
      category,
      field,
      left,
      right,
      leftDisplay,
      rightDisplay,
      equal: leftDisplay === rightDisplay,
    };
  }

  function compareSummaries(left, right) {
    const rows = [
      row('Metadata', 'URL', left.url, right.url),
      row('Metadata', 'HTTP status', left.status, right.status),
      row('Metadata', 'SEO score', left.score, right.score),
      row('Metadata', 'Title', left.title, right.title),
      row('Metadata', 'Description', left.description, right.description),
      row('Metadata', 'Canonical', left.canonical, right.canonical),
      row('Metadata', 'Robots', left.robots, right.robots),
      row('Metadata', 'Indexability', left.indexability, right.indexability),

      row('Headings', 'Heading count', left.headings.total, right.headings.total),
      row('Headings', 'H1', left.headings.h1, right.headings.h1),
      row('Headings', 'Outline', left.headings.outline, right.headings.outline),

      row('Links', 'Total links', left.links.total, right.links.total),
      row('Links', 'Internal HTTP links', left.links.internal, right.links.internal),
      row('Links', 'External HTTP links', left.links.external, right.links.external),
      row('Links', 'nofollow links', left.links.nofollow, right.links.nofollow),
      row('Links', 'sponsored links', left.links.sponsored, right.links.sponsored),
      row('Links', 'UGC links', left.links.ugc, right.links.ugc),
      row('Links', 'HTTP targets', left.links.targets, right.links.targets),

      row('Images', 'Total images', left.images.total, right.images.total),
      row('Images', 'Missing alt', left.images.missingAlt, right.images.missingAlt),
      row('Images', 'Missing dimensions', left.images.missingDimensions, right.images.missingDimensions),
      row('Images', 'Image sources', left.images.sources, right.images.sources),

      row('Schema', 'Schema types', left.schema.types, right.schema.types),
      row('Schema', 'Invalid JSON-LD', left.schema.invalid, right.schema.invalid),

      row('Hreflang', 'Hreflang count', left.hreflang.count, right.hreflang.count),
      row('Hreflang', 'Declarations', left.hreflang.entries, right.hreflang.entries),

      row('Headers', 'X-Robots-Tag', left.headers.xRobotsTag, right.headers.xRobotsTag),
      row('Headers', 'Content-Type', left.headers.contentType, right.headers.contentType),
      row('Headers', 'Content-Language', left.headers.contentLanguage, right.headers.contentLanguage),
      row('Headers', 'Cache-Control', left.headers.cacheControl, right.headers.cacheControl),
      row('Headers', 'Content-Security-Policy', left.headers.csp, right.headers.csp),
      row('Headers', 'Strict-Transport-Security', left.headers.hsts, right.headers.hsts),
      row('Headers', 'X-Frame-Options', left.headers.xfo, right.headers.xfo),
      row('Headers', 'Referrer-Policy', left.headers.referrer, right.headers.referrer),
      row('Headers', 'Permissions-Policy', left.headers.permissions, right.headers.permissions),
      row('Headers', 'X-Content-Type-Options', left.headers.xcto, right.headers.xcto),

      row('Issues', 'Critical issues', left.issues.critical, right.issues.critical),
      row('Issues', 'Warnings', left.issues.warning, right.issues.warning),
      row('Issues', 'Total issues', left.issues.total, right.issues.total),
      row('Issues', 'Issue IDs', left.issues.ids, right.issues.ids),
    ];
    const changed = rows.filter((item) => !item.equal);
    return {
      left,
      right,
      rows,
      changed,
      summary: {
        rows: rows.length,
        changed: changed.length,
        equal: rows.length - changed.length,
      },
    };
  }

  function compareReports(leftReport, rightReport) {
    return compareSummaries(summarize(leftReport), summarize(rightReport));
  }

  return {
    MAX_DETAIL_ITEMS,
    MAX_DETAIL_TEXT,
    cleanText,
    sortedUnique,
    capText,
    capList,
    schemaTypes,
    issueSummary,
    securityHeaderMap,
    summarize,
    display,
    compareSummaries,
    compareReports,
  };
});
