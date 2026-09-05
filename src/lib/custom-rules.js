(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CustomRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'customRules:v1';
  const SCHEMA_VERSION = 1;
  const SEVERITIES = Object.freeze(['critical', 'warning', 'info']);

  const CHECKS = Object.freeze([
    { id: 'title.missing', label: 'Missing title', category: 'Metadata', severity: 'critical' },
    { id: 'title.short', label: 'Title below minimum length', category: 'Metadata', severity: 'warning' },
    { id: 'title.long', label: 'Title above maximum length', category: 'Metadata', severity: 'warning' },
    { id: 'description.missing', label: 'Missing meta description', category: 'Metadata', severity: 'warning' },
    { id: 'description.short', label: 'Meta description below minimum length', category: 'Metadata', severity: 'warning' },
    { id: 'description.long', label: 'Meta description above maximum length', category: 'Metadata', severity: 'warning' },
    { id: 'viewport.missing', label: 'Missing viewport', category: 'Metadata', severity: 'warning' },
    { id: 'canonical.missing', label: 'Missing canonical', category: 'Canonical', severity: 'warning' },
    { id: 'canonical.multiple', label: 'Multiple canonicals', category: 'Canonical', severity: 'critical' },
    { id: 'canonical.different', label: 'Canonical points elsewhere', category: 'Canonical', severity: 'warning' },
    { id: 'robots.meta.noindex', label: 'Meta robots noindex', category: 'Indexability', severity: 'critical' },
    { id: 'robots.header.noindex', label: 'X-Robots-Tag noindex', category: 'Indexability', severity: 'critical' },
    { id: 'robots.nofollow', label: 'Page-level nofollow', category: 'Indexability', severity: 'warning' },
    { id: 'headings.h1.missing', label: 'Missing H1', category: 'Headings', severity: 'warning' },
    { id: 'headings.h1.multiple', label: 'Multiple H1 headings', category: 'Headings', severity: 'warning' },
    { id: 'headings.jump', label: 'Skipped heading levels', category: 'Headings', severity: 'warning' },
    { id: 'html.lang.missing', label: 'Missing HTML lang', category: 'International', severity: 'warning' },
    { id: 'hreflang.duplicate', label: 'Duplicate hreflang values', category: 'International', severity: 'warning' },
    { id: 'hreflang.required', label: 'Required hreflang missing', category: 'International', severity: 'warning' },
    { id: 'images.alt.missing', label: 'Images missing alt', category: 'Images', severity: 'warning' },
    { id: 'images.oversized', label: 'Oversized image dimensions', category: 'Images', severity: 'warning' },
    { id: 'images.dimensions.missing', label: 'Images missing dimensions', category: 'Images', severity: 'warning' },
    { id: 'images.fileSize', label: 'Images above file-size limit', category: 'Images', severity: 'warning' },
    { id: 'links.label.missing', label: 'Links without descriptive text', category: 'Links', severity: 'warning' },
    { id: 'links.javascript', label: 'javascript: links', category: 'Links', severity: 'warning' },
    { id: 'schema.invalid', label: 'Invalid JSON-LD', category: 'Structured data', severity: 'critical' },
    { id: 'schema.product.name', label: 'Product schema missing name', category: 'Structured data', severity: 'warning' },
    { id: 'schema.product.offers', label: 'Product schema missing offers', category: 'Structured data', severity: 'warning' },
    { id: 'schema.required', label: 'Required structured data missing', category: 'Structured data', severity: 'warning' },
    { id: 'https.required', label: 'HTTPS required', category: 'HTTP', severity: 'critical' },
    { id: 'http.error', label: 'Main document HTTP error', category: 'HTTP', severity: 'critical' },
  ]);

  const DEFAULT_CONFIG = Object.freeze({
    version: SCHEMA_VERSION,
    thresholds: Object.freeze({
      titleMin: 15,
      titleMax: 60,
      descriptionMin: 50,
      descriptionMax: 160,
      oversizedImageRatio: 2,
      imageMaxBytes: 512 * 1024,
    }),
    required: Object.freeze({
      title: true,
      description: true,
      canonical: true,
      h1: true,
      schema: false,
      hreflang: false,
      https: false,
    }),
    disabledChecks: Object.freeze([]),
    severityOverrides: Object.freeze({}),
  });

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function finiteNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function validRuleId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value);
  }

  function normalize(input) {
    const source = plainObject(input) ? input : {};
    const thresholds = plainObject(source.thresholds) ? source.thresholds : {};
    const required = plainObject(source.required) ? source.required : {};
    const severityOverrides = plainObject(source.severityOverrides) ? source.severityOverrides : {};

    let titleMin = Math.round(finiteNumber(thresholds.titleMin, DEFAULT_CONFIG.thresholds.titleMin, 0, 500));
    let titleMax = Math.round(finiteNumber(thresholds.titleMax, DEFAULT_CONFIG.thresholds.titleMax, 1, 500));
    let descriptionMin = Math.round(finiteNumber(thresholds.descriptionMin, DEFAULT_CONFIG.thresholds.descriptionMin, 0, 2000));
    let descriptionMax = Math.round(finiteNumber(thresholds.descriptionMax, DEFAULT_CONFIG.thresholds.descriptionMax, 1, 2000));
    if (titleMin > titleMax) [titleMin, titleMax] = [titleMax, titleMin];
    if (descriptionMin > descriptionMax) [descriptionMin, descriptionMax] = [descriptionMax, descriptionMin];

    const disabledChecks = Array.from(new Set((Array.isArray(source.disabledChecks) ? source.disabledChecks : [])
      .filter(validRuleId)))
      .sort();
    const normalizedSeverity = {};
    Object.keys(severityOverrides).sort().forEach((id) => {
      const severity = String(severityOverrides[id] || '').toLowerCase();
      if (validRuleId(id) && SEVERITIES.includes(severity)) normalizedSeverity[id] = severity;
    });

    const normalizedRequired = {};
    Object.keys(DEFAULT_CONFIG.required).forEach((key) => {
      normalizedRequired[key] = typeof required[key] === 'boolean' ? required[key] : DEFAULT_CONFIG.required[key];
    });

    return {
      version: SCHEMA_VERSION,
      thresholds: {
        titleMin,
        titleMax,
        descriptionMin,
        descriptionMax,
        oversizedImageRatio: finiteNumber(thresholds.oversizedImageRatio, DEFAULT_CONFIG.thresholds.oversizedImageRatio, 1, 20),
        imageMaxBytes: Math.round(finiteNumber(thresholds.imageMaxBytes, DEFAULT_CONFIG.thresholds.imageMaxBytes, 1024, 100 * 1024 * 1024)),
      },
      required: normalizedRequired,
      disabledChecks,
      severityOverrides: normalizedSeverity,
    };
  }

  function validate(input) {
    const errors = [];
    const source = plainObject(input) ? input : {};
    const thresholds = plainObject(source.thresholds) ? source.thresholds : {};
    const numeric = [
      ['Title minimum', thresholds.titleMin, 0, 500],
      ['Title maximum', thresholds.titleMax, 1, 500],
      ['Description minimum', thresholds.descriptionMin, 0, 2000],
      ['Description maximum', thresholds.descriptionMax, 1, 2000],
      ['Oversized image ratio', thresholds.oversizedImageRatio, 1, 20],
      ['Image file-size limit', thresholds.imageMaxBytes, 1024, 100 * 1024 * 1024],
    ];
    numeric.forEach(([label, value, min, max]) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || number > max) errors.push(`${label} must be between ${min} and ${max}.`);
    });
    if (Number(thresholds.titleMin) > Number(thresholds.titleMax)) errors.push('Title minimum cannot exceed title maximum.');
    if (Number(thresholds.descriptionMin) > Number(thresholds.descriptionMax)) errors.push('Description minimum cannot exceed description maximum.');
    return errors;
  }

  function isEnabled(config, id) {
    const normalized = normalize(config);
    return !normalized.disabledChecks.includes(id);
  }

  function severityFor(config, id, fallback) {
    const normalized = normalize(config);
    return normalized.severityOverrides[id] || fallback;
  }

  function applyIssuePolicy(issues, config) {
    const normalized = normalize(config);
    const disabled = new Set(normalized.disabledChecks);
    return (Array.isArray(issues) ? issues : [])
      .filter((item) => item && !disabled.has(item.id))
      .map((item) => {
        const severity = normalized.severityOverrides[item.id];
        return severity ? Object.assign({}, item, { severity }) : item;
      });
  }

  function toSeoCoreOptions(config) {
    const normalized = normalize(config);
    return {
      titleMin: normalized.thresholds.titleMin,
      titleMax: normalized.thresholds.titleMax,
      descriptionMin: normalized.thresholds.descriptionMin,
      descriptionMax: normalized.thresholds.descriptionMax,
      oversizedImageRatio: normalized.thresholds.oversizedImageRatio,
    };
  }

  function policyIssue(id, severity, category, title, message) {
    return { id, severity, category, title, message, refs: [] };
  }

  function scoreIssues(issues) {
    let score = 100;
    (issues || []).forEach((item) => {
      if (item.severity === 'critical') score -= 20;
      else if (item.severity === 'warning') score -= 5;
    });
    return Math.max(0, Math.min(100, score));
  }

  function severityCounts(issues) {
    const counts = { critical: 0, warning: 0, info: 0 };
    (issues || []).forEach((item) => {
      if (Object.prototype.hasOwnProperty.call(counts, item.severity)) counts[item.severity] += 1;
    });
    return counts;
  }

  function applyEvaluation(evaluation, facts, config) {
    const normalized = normalize(config);
    const source = evaluation && typeof evaluation === 'object' ? evaluation : {};
    const pageFacts = facts && typeof facts === 'object' ? facts : {};
    const suppressMissing = new Set();
    if (!normalized.required.title) suppressMissing.add('title.missing');
    if (!normalized.required.description) suppressMissing.add('description.missing');
    if (!normalized.required.canonical) suppressMissing.add('canonical.missing');
    if (!normalized.required.h1) suppressMissing.add('headings.h1.missing');

    let issues = (Array.isArray(source.issues) ? source.issues : []).filter((item) => !suppressMissing.has(item.id));
    const existing = new Set(issues.map((item) => item.id));
    const schemas = Array.isArray(pageFacts.schemas) ? pageFacts.schemas : [];
    const hasValidSchema = schemas.some((item) => item && item.valid !== false && Array.isArray(item.types) && item.types.length);
    const hreflang = Array.isArray(pageFacts.hreflang) ? pageFacts.hreflang : [];

    if (normalized.required.schema && !hasValidSchema && !existing.has('schema.required')) {
      issues.push(policyIssue('schema.required', 'warning', 'Structured data', 'Structured data is required', 'No valid typed structured-data block was found.'));
    }
    if (normalized.required.hreflang && !hreflang.length && !existing.has('hreflang.required')) {
      issues.push(policyIssue('hreflang.required', 'warning', 'International', 'Hreflang is required', 'No hreflang declaration was found.'));
    }
    let protocol = '';
    try { protocol = new URL(pageFacts.url || '').protocol; } catch (_error) {}
    if (normalized.required.https && protocol !== 'https:' && !existing.has('https.required')) {
      issues.push(policyIssue('https.required', 'critical', 'HTTP', 'HTTPS is required', 'The audited page URL does not use HTTPS.'));
    }

    issues = applyIssuePolicy(issues, normalized);
    return Object.assign({}, source, {
      issues,
      score: scoreIssues(issues),
      severityCounts: severityCounts(issues),
      rulesVersion: normalized.version,
    });
  }

  function imageSizeIssue(analysis, config) {
    const normalized = normalize(config);
    if (!isEnabled(normalized, 'images.fileSize')) return null;
    const limit = normalized.thresholds.imageMaxBytes;
    const rows = analysis && Array.isArray(analysis.rows) ? analysis.rows : [];
    const oversized = rows.filter((row) => Number(row.sizeBytes) > limit);
    if (!oversized.length) return null;
    return {
      id: 'images.fileSize',
      severity: severityFor(normalized, 'images.fileSize', 'warning'),
      category: 'Images',
      title: 'Images exceed configured file-size limit',
      message: `${oversized.length} image${oversized.length === 1 ? '' : 's'} exceed ${limit} bytes.`,
      refs: oversized.map((row) => row.image && row.image.ref).filter(Boolean),
    };
  }

  return {
    STORAGE_KEY,
    SCHEMA_VERSION,
    SEVERITIES,
    CHECKS,
    DEFAULT_CONFIG,
    normalize,
    validate,
    isEnabled,
    severityFor,
    applyIssuePolicy,
    toSeoCoreOptions,
    applyEvaluation,
    scoreIssues,
    severityCounts,
    imageSizeIssue,
  };
});
