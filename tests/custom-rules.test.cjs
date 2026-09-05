'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CustomRules = require('../src/lib/custom-rules.js');

function ids(items) {
  return items.map((item) => item.id);
}

function baseEvaluation(issues = []) {
  return { issues, score: 100, severityCounts: { critical: 0, warning: 0, info: 0 }, indexability: { verdict: 'Indexable' } };
}

test('defaults preserve the existing audit thresholds and required core metadata', () => {
  const config = CustomRules.normalize(null);
  assert.equal(config.version, 1);
  assert.equal(config.thresholds.titleMin, 15);
  assert.equal(config.thresholds.titleMax, 60);
  assert.equal(config.thresholds.descriptionMin, 50);
  assert.equal(config.thresholds.descriptionMax, 160);
  assert.equal(config.thresholds.imageMaxBytes, 512 * 1024);
  assert.equal(config.required.title, true);
  assert.equal(config.required.description, true);
  assert.equal(config.required.canonical, true);
  assert.equal(config.required.h1, true);
  assert.equal(config.required.schema, false);
  assert.equal(config.required.hreflang, false);
  assert.equal(config.required.https, false);
});

test('normalization clamps numeric values and swaps inverted text ranges safely', () => {
  const config = CustomRules.normalize({ thresholds: {
    titleMin: 90, titleMax: 30, descriptionMin: 300, descriptionMax: 100,
    oversizedImageRatio: 999, imageMaxBytes: -1,
  } });
  assert.deepEqual([config.thresholds.titleMin, config.thresholds.titleMax], [30, 90]);
  assert.deepEqual([config.thresholds.descriptionMin, config.thresholds.descriptionMax], [100, 300]);
  assert.equal(config.thresholds.oversizedImageRatio, 20);
  assert.equal(config.thresholds.imageMaxBytes, 1024);
});

test('validation reports invalid numeric values and inverted ranges instead of silently saving them', () => {
  const errors = CustomRules.validate({ thresholds: {
    titleMin: 70, titleMax: 60, descriptionMin: 50, descriptionMax: 160,
    oversizedImageRatio: 2, imageMaxBytes: 512 * 1024,
  } });
  assert.ok(errors.some((item) => item.includes('Title minimum cannot exceed')));
});

test('disabled checks are deduplicated and invalid identifiers are discarded', () => {
  const config = CustomRules.normalize({ disabledChecks: ['title.short', 'title.short', 'bad id!', 'schema.invalid'] });
  assert.deepEqual(config.disabledChecks, ['schema.invalid', 'title.short']);
  assert.equal(CustomRules.isEnabled(config, 'title.short'), false);
  assert.equal(CustomRules.isEnabled(config, 'title.long'), true);
});

test('severity overrides accept only supported severities and stable rule identifiers', () => {
  const config = CustomRules.normalize({ severityOverrides: {
    'title.short': 'critical', 'schema.invalid': 'INFO', 'title.long': 'fatal', 'bad id!': 'warning',
  } });
  assert.deepEqual(config.severityOverrides, { 'schema.invalid': 'info', 'title.short': 'critical' });
});

test('issue policy disables checks and applies severity overrides without mutating source issues', () => {
  const source = [
    { id: 'title.short', severity: 'warning', title: 'Short' },
    { id: 'schema.invalid', severity: 'critical', title: 'Schema' },
  ];
  const output = CustomRules.applyIssuePolicy(source, {
    disabledChecks: ['schema.invalid'], severityOverrides: { 'title.short': 'critical' },
  });
  assert.deepEqual(ids(output), ['title.short']);
  assert.equal(output[0].severity, 'critical');
  assert.equal(source[0].severity, 'warning');
});

test('SEO core options contain normalized thresholds only', () => {
  const options = CustomRules.toSeoCoreOptions({ thresholds: {
    titleMin: 10, titleMax: 70, descriptionMin: 40, descriptionMax: 180,
    oversizedImageRatio: 3, imageMaxBytes: 100000,
  } });
  assert.deepEqual(options, {
    titleMin: 10, titleMax: 70, descriptionMin: 40, descriptionMax: 180, oversizedImageRatio: 3,
  });
});

test('optional core requirements suppress only their corresponding missing issues', () => {
  const evaluation = baseEvaluation([
    { id: 'title.missing', severity: 'critical' },
    { id: 'description.missing', severity: 'warning' },
    { id: 'canonical.missing', severity: 'warning' },
    { id: 'headings.h1.missing', severity: 'warning' },
    { id: 'viewport.missing', severity: 'warning' },
  ]);
  const result = CustomRules.applyEvaluation(evaluation, { url: 'https://example.com/', schemas: [], hreflang: [] }, {
    required: { title: false, description: false, canonical: false, h1: false },
  });
  assert.deepEqual(ids(result.issues), ['viewport.missing']);
  assert.equal(result.score, 95);
});

test('required schema, hreflang, and HTTPS add explicit policy issues', () => {
  const result = CustomRules.applyEvaluation(baseEvaluation(), {
    url: 'http://example.com/', schemas: [], hreflang: [],
  }, { required: { schema: true, hreflang: true, https: true } });
  assert.deepEqual(ids(result.issues).sort(), ['hreflang.required', 'https.required', 'schema.required']);
  assert.equal(result.severityCounts.critical, 1);
  assert.equal(result.severityCounts.warning, 2);
  assert.equal(result.score, 70);
});

test('valid typed schema, hreflang, and HTTPS satisfy required policy', () => {
  const result = CustomRules.applyEvaluation(baseEvaluation(), {
    url: 'https://example.com/',
    schemas: [{ valid: true, types: ['Organization'] }],
    hreflang: [{ lang: 'en', href: 'https://example.com/' }],
  }, { required: { schema: true, hreflang: true, https: true } });
  assert.deepEqual(result.issues, []);
  assert.equal(result.score, 100);
});

test('disabled and severity policies are applied before score and counts are recalculated', () => {
  const result = CustomRules.applyEvaluation(baseEvaluation([
    { id: 'title.short', severity: 'warning' },
    { id: 'schema.invalid', severity: 'critical' },
  ]), { url: 'https://example.com/', schemas: [], hreflang: [] }, {
    disabledChecks: ['schema.invalid'],
    severityOverrides: { 'title.short': 'critical' },
  });
  assert.deepEqual(ids(result.issues), ['title.short']);
  assert.equal(result.issues[0].severity, 'critical');
  assert.equal(result.score, 80);
  assert.deepEqual(result.severityCounts, { critical: 1, warning: 0, info: 0 });
});

test('image file-size issue is emitted only for known sizes above the configured threshold', () => {
  const analysis = { rows: [
    { sizeBytes: 90000, image: { ref: { selector: 'img', index: 0 } } },
    { sizeBytes: 150000, image: { ref: { selector: 'img', index: 1 } } },
    { sizeBytes: 0, image: { ref: { selector: 'img', index: 2 } } },
  ] };
  const config = CustomRules.normalize({ thresholds: { imageMaxBytes: 100000 }, severityOverrides: { 'images.fileSize': 'critical' } });
  const issue = CustomRules.imageSizeIssue(analysis, config);
  assert.equal(issue.id, 'images.fileSize');
  assert.equal(issue.severity, 'critical');
  assert.equal(issue.refs.length, 1);
});

test('image file-size check can be disabled independently', () => {
  const issue = CustomRules.imageSizeIssue({ rows: [{ sizeBytes: 999999, image: {} }] }, {
    thresholds: { imageMaxBytes: 100000 }, disabledChecks: ['images.fileSize'],
  });
  assert.equal(issue, null);
});
