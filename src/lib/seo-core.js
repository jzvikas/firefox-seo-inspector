(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SeoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_RULES = Object.freeze({
    titleMin: 15,
    titleMax: 60,
    descriptionMin: 50,
    descriptionMax: 160,
    oversizedImageRatio: 2,
    maxLinksForStatusCheck: 250,
  });

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizedUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      url.hash = '';
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
        url.port = '';
      }
      return url.href;
    } catch (_error) {
      return String(value).trim();
    }
  }

  function hasDirective(values, directive) {
    const wanted = directive.toLowerCase();
    return (values || []).some((value) => String(value)
      .toLowerCase()
      .split(',')
      .flatMap((part) => part.trim().split(/\s+/))
      .includes(wanted));
  }

  function issue(id, severity, category, titleValue, message, refs) {
    return {
      id,
      severity,
      category,
      title: titleValue,
      message,
      refs: Array.isArray(refs) ? refs : [],
    };
  }

  function evaluateFacts(facts, responseMeta, customRules) {
    const rules = Object.assign({}, DEFAULT_RULES, customRules || {});
    const issues = [];
    const titleValue = text(facts.title);
    const description = text(facts.description);
    const canonical = facts.canonical || {};
    const headings = Array.isArray(facts.headings) ? facts.headings : [];
    const images = Array.isArray(facts.images) ? facts.images : [];
    const links = Array.isArray(facts.links) ? facts.links : [];
    const hreflang = Array.isArray(facts.hreflang) ? facts.hreflang : [];
    const schemas = Array.isArray(facts.schemas) ? facts.schemas : [];
    const robots = Array.isArray(facts.robots) ? facts.robots.map((entry) => entry.content || '') : [];
    const headerRobots = responseMeta && Array.isArray(responseMeta.xRobotsTag) ? responseMeta.xRobotsTag : [];

    if (!titleValue) {
      issues.push(issue('title.missing', 'critical', 'Metadata', 'Missing title', 'The page has no non-empty <title> element.'));
    } else {
      if (titleValue.length < rules.titleMin) {
        issues.push(issue('title.short', 'warning', 'Metadata', 'Title is short', `${titleValue.length} characters; configured minimum is ${rules.titleMin}.`));
      }
      if (titleValue.length > rules.titleMax) {
        issues.push(issue('title.long', 'warning', 'Metadata', 'Title is long', `${titleValue.length} characters; configured maximum is ${rules.titleMax}.`));
      }
    }

    if (!description) {
      issues.push(issue('description.missing', 'warning', 'Metadata', 'Missing meta description', 'No non-empty meta description was found.'));
    } else {
      if (description.length < rules.descriptionMin) {
        issues.push(issue('description.short', 'warning', 'Metadata', 'Meta description is short', `${description.length} characters; configured minimum is ${rules.descriptionMin}.`));
      }
      if (description.length > rules.descriptionMax) {
        issues.push(issue('description.long', 'warning', 'Metadata', 'Meta description is long', `${description.length} characters; configured maximum is ${rules.descriptionMax}.`));
      }
    }

    if (!facts.viewport) {
      issues.push(issue('viewport.missing', 'warning', 'Metadata', 'Missing viewport meta tag', 'No viewport meta tag was found.'));
    }

    if (!canonical.count) {
      issues.push(issue('canonical.missing', 'warning', 'Canonical', 'Missing canonical', 'No canonical link element was found.'));
    } else if (canonical.count > 1) {
      issues.push(issue('canonical.multiple', 'critical', 'Canonical', 'Multiple canonicals', `${canonical.count} canonical link elements were found.`));
    }

    if (canonical.href && facts.url && normalizedUrl(canonical.href) !== normalizedUrl(facts.url)) {
      issues.push(issue('canonical.different', 'warning', 'Canonical', 'Canonical points elsewhere', canonical.href));
    }

    if (hasDirective(robots, 'noindex')) {
      issues.push(issue('robots.meta.noindex', 'critical', 'Indexability', 'Meta robots contains noindex', 'The page asks compliant crawlers not to index it.'));
    }
    if (hasDirective(headerRobots, 'noindex')) {
      issues.push(issue('robots.header.noindex', 'critical', 'Indexability', 'X-Robots-Tag contains noindex', 'The HTTP response asks compliant crawlers not to index this page.'));
    }
    if (hasDirective(robots, 'nofollow') || hasDirective(headerRobots, 'nofollow')) {
      issues.push(issue('robots.nofollow', 'warning', 'Indexability', 'Page-level nofollow found', 'A robots directive asks compliant crawlers not to follow links from this page.'));
    }

    const h1 = headings.filter((item) => item.level === 1);
    if (h1.length === 0) {
      issues.push(issue('headings.h1.missing', 'warning', 'Headings', 'Missing H1', 'No H1 heading was found.'));
    } else if (h1.length > 1) {
      issues.push(issue('headings.h1.multiple', 'warning', 'Headings', 'Multiple H1 headings', `${h1.length} H1 headings were found.`, h1.map((item) => item.ref)));
    }

    let previousLevel = null;
    const jumpRefs = [];
    for (const heading of headings) {
      if (previousLevel !== null && heading.level > previousLevel + 1) jumpRefs.push(heading.ref);
      previousLevel = heading.level;
    }
    if (jumpRefs.length) {
      issues.push(issue('headings.jump', 'warning', 'Headings', 'Heading levels are skipped', `${jumpRefs.length} heading transition${jumpRefs.length === 1 ? '' : 's'} skip one or more levels.`, jumpRefs));
    }

    if (!text(facts.lang)) {
      issues.push(issue('html.lang.missing', 'warning', 'International', 'Missing html lang attribute', 'The root HTML element has no language value.'));
    }

    const hreflangSeen = new Map();
    const duplicateHreflangRefs = [];
    for (const item of hreflang) {
      const key = String(item.lang || '').toLowerCase();
      if (!key) continue;
      if (hreflangSeen.has(key)) {
        duplicateHreflangRefs.push(item.ref);
      } else {
        hreflangSeen.set(key, item.href);
      }
    }
    if (duplicateHreflangRefs.length) {
      issues.push(issue('hreflang.duplicate', 'warning', 'International', 'Duplicate hreflang values', `${duplicateHreflangRefs.length} duplicate hreflang declaration${duplicateHreflangRefs.length === 1 ? '' : 's'} found.`, duplicateHreflangRefs));
    }

    const missingAlt = images.filter((image) => !image.altPresent);
    if (missingAlt.length) {
      issues.push(issue('images.alt.missing', 'warning', 'Images', 'Images missing alt attributes', `${missingAlt.length} image${missingAlt.length === 1 ? '' : 's'} have no alt attribute.`, missingAlt.map((image) => image.ref)));
    }

    const oversized = images.filter((image) => {
      if (!image.naturalWidth || !image.renderedWidth) return false;
      return image.naturalWidth > image.renderedWidth * rules.oversizedImageRatio;
    });
    if (oversized.length) {
      issues.push(issue('images.oversized', 'warning', 'Images', 'Oversized images', `${oversized.length} image${oversized.length === 1 ? '' : 's'} are rendered at less than half their intrinsic width.`, oversized.map((image) => image.ref)));
    }

    const missingDimensions = images.filter((image) => !image.widthAttr || !image.heightAttr);
    if (missingDimensions.length) {
      issues.push(issue('images.dimensions.missing', 'warning', 'Images', 'Images missing explicit dimensions', `${missingDimensions.length} image${missingDimensions.length === 1 ? '' : 's'} lack a width or height attribute.`, missingDimensions.map((image) => image.ref)));
    }

    const emptyLinks = links.filter((link) => !text(link.label) && link.kind === 'http');
    if (emptyLinks.length) {
      issues.push(issue('links.label.missing', 'warning', 'Links', 'Links without descriptive text', `${emptyLinks.length} HTTP link${emptyLinks.length === 1 ? '' : 's'} have no text, aria-label, title, or image alt label.`, emptyLinks.map((link) => link.ref)));
    }

    const unsafeLinks = links.filter((link) => link.kind === 'javascript');
    if (unsafeLinks.length) {
      issues.push(issue('links.javascript', 'warning', 'Links', 'javascript: links found', `${unsafeLinks.length} javascript: link${unsafeLinks.length === 1 ? '' : 's'} found.`, unsafeLinks.map((link) => link.ref)));
    }

    const invalidSchemas = schemas.filter((schema) => schema.valid === false);
    if (invalidSchemas.length) {
      issues.push(issue('schema.invalid', 'critical', 'Structured data', 'Invalid JSON-LD', `${invalidSchemas.length} JSON-LD block${invalidSchemas.length === 1 ? '' : 's'} could not be parsed.`, invalidSchemas.map((schema) => schema.ref)));
    }

    const schemaTypes = new Set(schemas.flatMap((schema) => schema.types || []));
    if (schemaTypes.has('Product')) {
      const product = schemas.find((schema) => (schema.types || []).includes('Product') && schema.valid);
      if (product && product.summary) {
        if (!product.summary.name) {
          issues.push(issue('schema.product.name', 'warning', 'Structured data', 'Product schema missing name', 'A Product JSON-LD object was found without a name.'));
        }
        if (!product.summary.hasOffers) {
          issues.push(issue('schema.product.offers', 'warning', 'Structured data', 'Product schema missing offers', 'A Product JSON-LD object was found without offers.'));
        }
      }
    }

    if (responseMeta && typeof responseMeta.statusCode === 'number' && responseMeta.statusCode >= 400) {
      issues.push(issue('http.error', 'critical', 'HTTP', `HTTP ${responseMeta.statusCode}`, responseMeta.statusLine || 'The main document returned an error status.'));
    }

    const score = calculateScore(issues);
    const severityCounts = countSeverities(issues);
    return { issues, score, severityCounts };
  }

  function calculateScore(issues) {
    let score = 100;
    for (const item of issues || []) {
      if (item.severity === 'critical') score -= 20;
      else if (item.severity === 'warning') score -= 5;
    }
    return Math.max(0, Math.min(100, score));
  }

  function countSeverities(issues) {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const item of issues || []) {
      if (Object.prototype.hasOwnProperty.call(counts, item.severity)) counts[item.severity] += 1;
    }
    return counts;
  }

  function schemaTypes(schemas) {
    return Array.from(new Set((schemas || []).flatMap((schema) => schema.types || []))).sort();
  }

  function makeSnapshot(report) {
    const facts = report && report.facts ? report.facts : report || {};
    const evaluation = report && report.evaluation ? report.evaluation : { score: null, issues: [] };
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      url: normalizedUrl(facts.url),
      title: facts.title || '',
      description: facts.description || '',
      canonical: facts.canonical ? facts.canonical.href || '' : '',
      robots: (facts.robots || []).map((item) => item.content || '').sort(),
      h1: (facts.headings || []).filter((item) => item.level === 1).map((item) => item.text || ''),
      headingCount: (facts.headings || []).length,
      linkCount: (facts.links || []).length,
      imageCount: (facts.images || []).length,
      schemaTypes: schemaTypes(facts.schemas),
      hreflangCount: (facts.hreflang || []).length,
      score: evaluation.score,
      issueIds: (evaluation.issues || []).map((item) => item.id).sort(),
    };
  }

  function diffSnapshots(before, after) {
    if (!before || !after) return [];
    const fields = ['title', 'description', 'canonical', 'robots', 'h1', 'headingCount', 'linkCount', 'imageCount', 'schemaTypes', 'hreflangCount', 'score', 'issueIds'];
    const changes = [];
    for (const field of fields) {
      const oldValue = before[field];
      const newValue = after[field];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ field, before: oldValue, after: newValue });
      }
    }
    return changes;
  }

  function diffPageFacts(rendered, raw) {
    const pairs = [
      ['title', rendered.title || '', raw.title || ''],
      ['description', rendered.description || '', raw.description || ''],
      ['canonical', rendered.canonical ? rendered.canonical.href || '' : '', raw.canonical ? raw.canonical.href || '' : ''],
      ['H1 count', (rendered.headings || []).filter((h) => h.level === 1).length, (raw.headings || []).filter((h) => h.level === 1).length],
      ['Heading count', (rendered.headings || []).length, (raw.headings || []).length],
      ['Link count', (rendered.links || []).length, (raw.links || []).length],
      ['Image count', (rendered.images || []).length, (raw.images || []).length],
      ['Schema types', schemaTypes(rendered.schemas), schemaTypes(raw.schemas)],
    ];
    return pairs
      .filter((pair) => JSON.stringify(pair[1]) !== JSON.stringify(pair[2]))
      .map((pair) => ({ field: pair[0], rendered: pair[1], raw: pair[2] }));
  }

  function summarizeLinkResults(results) {
    const summary = { ok: 0, broken: 0, redirect: 0, unknown: 0 };
    for (const result of results || []) {
      if (result.error || !result.status) summary.unknown += 1;
      else if (result.status >= 400) summary.broken += 1;
      else if (result.redirected) summary.redirect += 1;
      else summary.ok += 1;
    }
    return summary;
  }

  return {
    DEFAULT_RULES,
    evaluateFacts,
    calculateScore,
    countSeverities,
    makeSnapshot,
    diffSnapshots,
    diffPageFacts,
    summarizeLinkResults,
    normalizedUrl,
    hasDirective,
    schemaTypes,
  };
});
