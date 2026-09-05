(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Regression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SNAPSHOT_VERSION = 2;
  const HEADING_LIMIT = 300;
  const HREFLANG_LIMIT = 300;

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

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

  function sortedUnique(values) {
    return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))).sort();
  }

  function schemaTypes(schemas) {
    return sortedUnique((schemas || []).flatMap((schema) => schema && Array.isArray(schema.types) ? schema.types : []));
  }

  function summarizeNetworkResults(results) {
    const summary = { checked: 0, broken: 0, redirect: 0, unknown: 0 };
    for (const result of Array.isArray(results) ? results : []) {
      if (!result || typeof result !== 'object') continue;
      summary.checked += 1;
      if (result.error || !Number(result.status)) summary.unknown += 1;
      else if (Number(result.status) >= 400) summary.broken += 1;
      else if (result.redirected) summary.redirect += 1;
    }
    return summary;
  }

  function headingCounts(headings) {
    const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
    for (const heading of headings || []) {
      const level = Number(heading && heading.level);
      if (level >= 1 && level <= 6) counts[`h${level}`] += 1;
    }
    return counts;
  }

  function imageIssueCounts(images) {
    const rows = Array.isArray(images) ? images : [];
    let missingAlt = 0;
    let missingDimensions = 0;
    let oversized = 0;
    for (const image of rows) {
      if (!image || typeof image !== 'object') continue;
      if (!image.altPresent) missingAlt += 1;
      if (!image.widthAttr || !image.heightAttr) missingDimensions += 1;
      if (Number(image.naturalWidth) > 0 && Number(image.renderedWidth) > 0 && Number(image.naturalWidth) > Number(image.renderedWidth) * 2) oversized += 1;
    }
    return { missingAlt, missingDimensions, oversized };
  }

  function securityHeaders(securityAudit) {
    const output = {};
    const rows = securityAudit && Array.isArray(securityAudit.headers) ? securityAudit.headers : [];
    for (const row of rows) {
      if (!row || !row.key) continue;
      output[String(row.key)] = {
        state: String(row.state || ''),
        value: String(row.value || ''),
      };
    }
    return output;
  }

  function makeSnapshot(report, options) {
    const source = report || {};
    const facts = source.facts || source || {};
    const evaluation = source.evaluation || { score: null, issues: [] };
    const indexability = evaluation.indexability || null;
    const response = source.responseMeta || {};
    const performance = source.performance || {};
    const performanceSummary = performance.summary || {};
    const thirdParty = performanceSummary.thirdParty || {};
    const security = source.securityAudit || {};
    const mixed = security.mixed || {};
    const headings = Array.isArray(facts.headings) ? facts.headings : [];
    const links = Array.isArray(facts.links) ? facts.links : [];
    const images = Array.isArray(facts.images) ? facts.images : [];
    const schemas = Array.isArray(facts.schemas) ? facts.schemas : [];
    const hreflang = Array.isArray(facts.hreflang) ? facts.hreflang : [];
    const opts = options || {};
    const linkNetwork = summarizeNetworkResults(opts.linkResults);
    const imageNetwork = summarizeNetworkResults(opts.imageNetworkResults);
    const imageIssues = imageIssueCounts(images);
    const types = schemaTypes(schemas);
    const issueIds = sortedUnique((evaluation.issues || []).map((item) => item && item.id));
    const robots = sortedUnique((facts.robots || []).map((item) => item && item.content));
    const headerRobots = sortedUnique(response.xRobotsTag || []);

    return {
      version: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      url: normalizeUrl(facts.url),
      title: facts.title || '',
      description: facts.description || '',
      canonical: facts.canonical ? facts.canonical.href || '' : '',
      robots,
      h1: headings.filter((item) => Number(item.level) === 1).map((item) => item.text || ''),
      headingCount: headings.length,
      linkCount: links.length,
      imageCount: images.length,
      schemaTypes: types,
      hreflangCount: hreflang.length,
      score: evaluation.score,
      issueIds,
      indexability: indexability ? {
        verdict: String(indexability.verdict || ''),
        indexable: Boolean(indexability.indexable),
        reasons: sortedUnique((indexability.reasons || []).map((item) => item && item.code)),
      } : null,
      directives: {
        meta: robots,
        header: headerRobots,
      },
      headings: {
        counts: headingCounts(headings),
        outline: headings.slice(0, HEADING_LIMIT).map((item) => `${Number(item.level) || 0}:${text(item.text)}`),
        capped: headings.length > HEADING_LIMIT,
      },
      links: {
        total: links.length,
        internal: links.filter((item) => item && item.internal).length,
        external: links.filter((item) => item && item.kind === 'http' && !item.internal).length,
        checked: linkNetwork.checked,
        broken: linkNetwork.broken,
        redirect: linkNetwork.redirect,
        unknown: linkNetwork.unknown,
      },
      images: {
        total: images.length,
        missingAlt: imageIssues.missingAlt,
        missingDimensions: imageIssues.missingDimensions,
        oversized: imageIssues.oversized,
        checked: imageNetwork.checked,
        broken: imageNetwork.broken,
        redirect: imageNetwork.redirect,
        unknown: imageNetwork.unknown,
      },
      schema: {
        types,
        invalid: schemas.filter((item) => item && item.valid === false).length,
      },
      hreflang: {
        count: hreflang.length,
        entries: hreflang.slice(0, HREFLANG_LIMIT)
          .map((item) => `${String(item && item.lang || '').toLowerCase()}|${normalizeUrl(item && item.href || '')}`)
          .sort(),
        capped: hreflang.length > HREFLANG_LIMIT,
      },
      http: {
        statusCode: typeof response.statusCode === 'number' ? response.statusCode : null,
        statusLine: String(response.statusLine || ''),
        xRobotsTag: headerRobots,
        contentType: sortedUnique(response.contentType || []),
        contentLanguage: sortedUnique(response.contentLanguage || []),
        cacheControl: sortedUnique(response.cacheControl || []),
      },
      performance: {
        requestCount: Number(performanceSummary.requestCount) || 0,
        totalBytes: Number(performanceSummary.totalBytes) || 0,
        knownSizeCount: Number(performanceSummary.knownSizeCount) || 0,
        thirdPartyRequests: Number(thirdParty.count) || 0,
        thirdPartyBytes: Number(thirdParty.bytes) || 0,
        domNodes: Number(performance.dom && performance.dom.nodeCount) || 0,
        domDepth: Number(performance.dom && performance.dom.maxDepth) || 0,
        ttfb: Number(performance.navigation && performance.navigation.ttfb) || 0,
        load: Number(performance.navigation && performance.navigation.total) || 0,
      },
      security: {
        https: Boolean(security.transport && security.transport.https),
        mixedActive: Number(mixed.active) || 0,
        mixedPassive: Number(mixed.passive) || 0,
        headers: securityHeaders(security),
        issueCodes: sortedUnique((security.issues || []).map((item) => item && item.code)),
      },
    };
  }

  function equal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function change(id, category, label, before, after, direction, severity) {
    return {
      id,
      field: label,
      category,
      label,
      before,
      after,
      direction: direction || 'changed',
      severity: severity || 'info',
    };
  }

  function addIfChanged(changes, id, category, label, before, after, direction, severity) {
    if (!equal(before, after)) changes.push(change(id, category, label, before, after, direction, severity));
  }

  function countDirection(before, after, increaseIsBad) {
    const a = Number(before);
    const b = Number(after);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return 'changed';
    const worse = increaseIsBad ? b > a : b < a;
    return worse ? 'regression' : 'improvement';
  }

  function statusHealthy(value) {
    const status = Number(value);
    return status >= 200 && status < 400;
  }

  function hasNoindex(values) {
    return (values || []).some((value) => String(value).toLowerCase().split(/[,\s]+/).includes('noindex'));
  }

  function headerStrength(state) {
    const value = String(state || '').toLowerCase();
    if (value === 'present' || value === 'covered') return 2;
    if (value === 'review') return 1;
    if (value === 'missing') return 0;
    return null;
  }

  function performanceDirection(before, after, minimumAbsolute, minimumRatio) {
    const a = Number(before);
    const b = Number(after);
    if (!(a > 0) || !(b >= 0) || a === b) return null;
    const delta = b - a;
    const ratio = Math.abs(delta) / a;
    if (Math.abs(delta) < minimumAbsolute || ratio < minimumRatio) return null;
    return delta > 0 ? 'regression' : 'improvement';
  }

  function analyze(before, after) {
    if (!before || !after) return { changes: [], regressions: [], improvements: [], changed: [], summary: { regressions: 0, improvements: 0, changed: 0 } };
    const changes = [];

    const titleDirection = !text(after.title) && text(before.title) ? 'regression' : text(after.title) && !text(before.title) ? 'improvement' : 'changed';
    addIfChanged(changes, 'metadata.title', 'Metadata', 'Title', before.title, after.title, titleDirection, titleDirection === 'regression' ? 'warning' : 'info');
    const descriptionDirection = !text(after.description) && text(before.description) ? 'regression' : text(after.description) && !text(before.description) ? 'improvement' : 'changed';
    addIfChanged(changes, 'metadata.description', 'Metadata', 'Description', before.description, after.description, descriptionDirection, descriptionDirection === 'regression' ? 'warning' : 'info');
    addIfChanged(changes, 'canonical.url', 'Canonical', 'Canonical', before.canonical, after.canonical, !text(after.canonical) && text(before.canonical) ? 'regression' : 'changed', !text(after.canonical) && text(before.canonical) ? 'warning' : 'info');

    const beforeRobots = Array.isArray(before.robots) ? before.robots : [];
    const afterRobots = Array.isArray(after.robots) ? after.robots : [];
    if (!equal(beforeRobots, afterRobots)) {
      const gainedNoindex = !hasNoindex(beforeRobots) && hasNoindex(afterRobots);
      const lostNoindex = hasNoindex(beforeRobots) && !hasNoindex(afterRobots);
      changes.push(change('indexability.robots', 'Indexability', 'Robots directives', beforeRobots, afterRobots, gainedNoindex ? 'regression' : lostNoindex ? 'improvement' : 'changed', gainedNoindex ? 'critical' : 'info'));
    }

    if (before.indexability && after.indexability) {
      const becameBlocked = Boolean(before.indexability.indexable) && !Boolean(after.indexability.indexable);
      const becameIndexable = !Boolean(before.indexability.indexable) && Boolean(after.indexability.indexable);
      addIfChanged(changes, 'indexability.verdict', 'Indexability', 'Indexability verdict', before.indexability.verdict, after.indexability.verdict, becameBlocked ? 'regression' : becameIndexable ? 'improvement' : 'changed', becameBlocked ? 'critical' : 'warning');
      addIfChanged(changes, 'indexability.reasons', 'Indexability', 'Indexability reasons', before.indexability.reasons, after.indexability.reasons, 'changed', 'info');
    }

    addIfChanged(changes, 'headings.h1', 'Headings', 'H1', before.h1, after.h1, Array.isArray(before.h1) && before.h1.length && Array.isArray(after.h1) && !after.h1.length ? 'regression' : 'changed', Array.isArray(before.h1) && before.h1.length && Array.isArray(after.h1) && !after.h1.length ? 'warning' : 'info');
    if (before.headings && after.headings) {
      addIfChanged(changes, 'headings.structure', 'Headings', 'Heading structure', before.headings.outline, after.headings.outline, 'changed', 'info');
    } else addIfChanged(changes, 'headings.count', 'Headings', 'Heading count', before.headingCount, after.headingCount, 'changed', 'info');

    if (before.links && after.links) {
      addIfChanged(changes, 'links.count', 'Links', 'Link count', before.links.total, after.links.total, 'changed', 'info');
      if (before.links.checked > 0 && after.links.checked > 0) {
        addIfChanged(changes, 'links.broken', 'Links', 'Broken links', before.links.broken, after.links.broken, countDirection(before.links.broken, after.links.broken, true), Number(after.links.broken) > Number(before.links.broken) ? 'critical' : 'info');
        addIfChanged(changes, 'links.redirect', 'Links', 'Redirecting links', before.links.redirect, after.links.redirect, countDirection(before.links.redirect, after.links.redirect, true), Number(after.links.redirect) > Number(before.links.redirect) ? 'warning' : 'info');
      }
    } else addIfChanged(changes, 'links.count', 'Links', 'Link count', before.linkCount, after.linkCount, 'changed', 'info');

    if (before.images && after.images) {
      for (const [key, label] of [['missingAlt', 'Images missing alt'], ['missingDimensions', 'Images missing dimensions'], ['oversized', 'Oversized images']]) {
        addIfChanged(changes, `images.${key}`, 'Images', label, before.images[key], after.images[key], countDirection(before.images[key], after.images[key], true), Number(after.images[key]) > Number(before.images[key]) ? 'warning' : 'info');
      }
      if (before.images.checked > 0 && after.images.checked > 0) {
        addIfChanged(changes, 'images.broken', 'Images', 'Broken images', before.images.broken, after.images.broken, countDirection(before.images.broken, after.images.broken, true), Number(after.images.broken) > Number(before.images.broken) ? 'critical' : 'info');
      }
    } else addIfChanged(changes, 'images.count', 'Images', 'Image count', before.imageCount, after.imageCount, 'changed', 'info');

    if (before.schema && after.schema) {
      addIfChanged(changes, 'schema.types', 'Structured data', 'Schema types', before.schema.types, after.schema.types, 'changed', 'info');
      addIfChanged(changes, 'schema.invalid', 'Structured data', 'Invalid JSON-LD blocks', before.schema.invalid, after.schema.invalid, countDirection(before.schema.invalid, after.schema.invalid, true), Number(after.schema.invalid) > Number(before.schema.invalid) ? 'critical' : 'info');
    } else addIfChanged(changes, 'schema.types', 'Structured data', 'Schema types', before.schemaTypes, after.schemaTypes, 'changed', 'info');

    if (before.hreflang && after.hreflang) addIfChanged(changes, 'hreflang.entries', 'International', 'Hreflang declarations', before.hreflang.entries, after.hreflang.entries, 'changed', 'warning');
    else addIfChanged(changes, 'hreflang.count', 'International', 'Hreflang count', before.hreflangCount, after.hreflangCount, 'changed', 'info');

    if (before.http && after.http) {
      if (!equal(before.http.statusCode, after.http.statusCode)) {
        const beforeHealthy = statusHealthy(before.http.statusCode);
        const afterHealthy = statusHealthy(after.http.statusCode);
        changes.push(change('http.status', 'HTTP', 'HTTP status', before.http.statusCode, after.http.statusCode, beforeHealthy && !afterHealthy ? 'regression' : !beforeHealthy && afterHealthy ? 'improvement' : 'changed', beforeHealthy && !afterHealthy ? 'critical' : 'info'));
      }
      if (!equal(before.http.xRobotsTag, after.http.xRobotsTag)) {
        const gainedNoindex = !hasNoindex(before.http.xRobotsTag) && hasNoindex(after.http.xRobotsTag);
        changes.push(change('http.x-robots-tag', 'HTTP', 'X-Robots-Tag', before.http.xRobotsTag, after.http.xRobotsTag, gainedNoindex ? 'regression' : 'changed', gainedNoindex ? 'critical' : 'info'));
      }
      addIfChanged(changes, 'http.content-type', 'HTTP', 'Content-Type', before.http.contentType, after.http.contentType, 'changed', 'info');
      addIfChanged(changes, 'http.content-language', 'HTTP', 'Content-Language', before.http.contentLanguage, after.http.contentLanguage, 'changed', 'info');
      addIfChanged(changes, 'http.cache-control', 'HTTP', 'Cache-Control', before.http.cacheControl, after.http.cacheControl, 'changed', 'info');
    }

    if (before.performance && after.performance) {
      const metrics = [
        ['requestCount', 'Requests', 10, 0.2, 'warning'],
        ['totalBytes', 'Known transferred bytes', 102400, 0.2, 'warning'],
        ['thirdPartyRequests', 'Third-party requests', 5, 0.2, 'warning'],
        ['thirdPartyBytes', 'Third-party known bytes', 102400, 0.2, 'warning'],
        ['domNodes', 'DOM nodes', 100, 0.2, 'warning'],
        ['domDepth', 'DOM depth', 5, 0.2, 'warning'],
        ['ttfb', 'TTFB', 100, 0.2, 'warning'],
        ['load', 'Navigation duration', 500, 0.2, 'warning'],
      ];
      for (const [key, label, absolute, ratio, severity] of metrics) {
        if ((key === 'totalBytes' || key === 'thirdPartyBytes') && (!before.performance.knownSizeCount || !after.performance.knownSizeCount)) continue;
        const direction = performanceDirection(before.performance[key], after.performance[key], absolute, ratio);
        if (direction) changes.push(change(`performance.${key}`, 'Performance', label, before.performance[key], after.performance[key], direction, direction === 'regression' ? severity : 'info'));
      }
    }

    if (before.security && after.security) {
      if (before.security.https !== after.security.https) {
        changes.push(change('security.https', 'Security', 'HTTPS transport', before.security.https, after.security.https, before.security.https && !after.security.https ? 'regression' : 'improvement', before.security.https && !after.security.https ? 'critical' : 'info'));
      }
      addIfChanged(changes, 'security.mixed-active', 'Security', 'Active mixed content', before.security.mixedActive, after.security.mixedActive, countDirection(before.security.mixedActive, after.security.mixedActive, true), Number(after.security.mixedActive) > Number(before.security.mixedActive) ? 'critical' : 'info');
      addIfChanged(changes, 'security.mixed-passive', 'Security', 'Passive mixed content', before.security.mixedPassive, after.security.mixedPassive, countDirection(before.security.mixedPassive, after.security.mixedPassive, true), Number(after.security.mixedPassive) > Number(before.security.mixedPassive) ? 'warning' : 'info');
      const keys = sortedUnique(Object.keys(before.security.headers || {}).concat(Object.keys(after.security.headers || {})));
      for (const key of keys) {
        const oldHeader = (before.security.headers || {})[key];
        const newHeader = (after.security.headers || {})[key];
        if (!oldHeader || !newHeader || equal(oldHeader, newHeader)) continue;
        const oldStrength = headerStrength(oldHeader.state);
        const newStrength = headerStrength(newHeader.state);
        const direction = oldStrength !== null && newStrength !== null && newStrength !== oldStrength ? (newStrength < oldStrength ? 'regression' : 'improvement') : 'changed';
        changes.push(change(`security.header.${key}`, 'Security', `Security header: ${key}`, oldHeader, newHeader, direction, direction === 'regression' ? 'warning' : 'info'));
      }
    }

    if (!equal(before.score, after.score)) {
      const direction = Number(after.score) < Number(before.score) ? 'regression' : Number(after.score) > Number(before.score) ? 'improvement' : 'changed';
      changes.push(change('audit.score', 'Audit', 'SEO score', before.score, after.score, direction, direction === 'regression' ? 'warning' : 'info'));
    }

    const regressions = changes.filter((item) => item.direction === 'regression');
    const improvements = changes.filter((item) => item.direction === 'improvement');
    const changed = changes.filter((item) => item.direction === 'changed');
    return {
      changes,
      regressions,
      improvements,
      changed,
      summary: { regressions: regressions.length, improvements: improvements.length, changed: changed.length },
    };
  }

  return {
    SNAPSHOT_VERSION,
    HEADING_LIMIT,
    HREFLANG_LIMIT,
    normalizeUrl,
    summarizeNetworkResults,
    headingCounts,
    imageIssueCounts,
    securityHeaders,
    makeSnapshot,
    performanceDirection,
    analyze,
  };
});
