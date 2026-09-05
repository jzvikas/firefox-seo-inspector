'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CustomRules = require('../src/lib/custom-rules.js');
const DomainProfiles = require('../src/lib/domain-profiles.js');

test('hostname normalization accepts URLs, case differences, ports, and trailing dots', () => {
  assert.equal(DomainProfiles.normalizeHostname('HTTPS://Example.COM:8443/path'), 'example.com');
  assert.equal(DomainProfiles.normalizeHostname('example.com.'), 'example.com');
  assert.equal(DomainProfiles.normalizeHostname('localhost:8080'), 'localhost');
  assert.equal(DomainProfiles.normalizeHostname('not a host /'), '');
});

test('store normalization is exact-hostname based and deterministic', () => {
  const store = DomainProfiles.normalizeStore({
    profiles: {
      'WWW.Example.com': { enabled: true, label: ' WWW ' },
      'example.com': { enabled: true, label: 'Apex' },
    },
  });
  assert.deepEqual(Object.keys(store.profiles).sort(), ['example.com', 'www.example.com']);
  assert.equal(store.profiles['www.example.com'].label, 'WWW');
  assert.equal(DomainProfiles.findProfile(store, 'https://shop.example.com/'), null);
  assert.equal(DomainProfiles.findProfile(store, 'https://www.example.com/').hostname, 'www.example.com');
});

test('partial profile rules override only fields that were explicitly supplied', () => {
  const base = CustomRules.normalize({
    thresholds: { titleMin: 20, titleMax: 55, descriptionMin: 60, descriptionMax: 150, oversizedImageRatio: 2, imageMaxBytes: 500000 },
    required: { schema: false, hreflang: false },
    severityOverrides: { 'title.short': 'critical' },
  });
  const profile = DomainProfiles.normalizeProfile({
    hostname: 'example.com',
    rules: {
      thresholds: { titleMax: 70, imageMaxBytes: 800000 },
      required: { schema: true },
      severityOverrides: { 'description.short': 'info' },
    },
  });
  const effective = DomainProfiles.mergeRules(base, profile);
  assert.equal(effective.thresholds.titleMin, 20);
  assert.equal(effective.thresholds.titleMax, 70);
  assert.equal(effective.thresholds.imageMaxBytes, 800000);
  assert.equal(effective.required.schema, true);
  assert.equal(effective.required.hreflang, false);
  assert.equal(effective.severityOverrides['title.short'], 'critical');
  assert.equal(effective.severityOverrides['description.short'], 'info');
});

test('domain ignore rules are additive with global disabled checks', () => {
  const base = CustomRules.normalize({ disabledChecks: ['links.javascript'] });
  const profile = DomainProfiles.normalizeProfile({
    hostname: 'example.com',
    ignoreChecks: ['title.short', 'profile.schema.expected', 'title.short'],
  });
  const effective = DomainProfiles.mergeRules(base, profile);
  assert.deepEqual(effective.disabledChecks, ['links.javascript', 'profile.schema.expected', 'title.short']);
});

test('expected schema and hreflang requirements create stable profile issues', () => {
  const profile = DomainProfiles.normalizeProfile({
    hostname: 'example.com',
    expected: { schemaTypes: ['Product', 'BreadcrumbList'], hreflang: ['lt', 'en-US', 'x-default'] },
  });
  const rules = DomainProfiles.mergeRules(CustomRules.normalize(null), profile);
  const evaluation = DomainProfiles.applyEvaluation({ issues: [], score: 100, severityCounts: {} }, {
    schemas: [{ valid: true, types: ['Product'] }],
    hreflang: [{ lang: 'LT' }, { lang: 'x-default' }],
  }, profile, rules);
  assert.deepEqual(evaluation.issues.map((item) => item.id).sort(), ['profile.hreflang.expected', 'profile.schema.expected']);
  assert.match(evaluation.issues.find((item) => item.id === 'profile.schema.expected').message, /BreadcrumbList/);
  assert.match(evaluation.issues.find((item) => item.id === 'profile.hreflang.expected').message, /en-us/);
  assert.equal(evaluation.score, 90);
});

test('domain ignore can suppress profile expectation findings too', () => {
  const profile = DomainProfiles.normalizeProfile({
    hostname: 'example.com',
    expected: { schemaTypes: ['Product'], hreflang: ['lt'] },
    ignoreChecks: ['profile.schema.expected'],
  });
  const rules = DomainProfiles.mergeRules(CustomRules.normalize(null), profile);
  const evaluation = DomainProfiles.applyEvaluation({ issues: [], score: 100 }, { schemas: [], hreflang: [] }, profile, rules);
  assert.deepEqual(evaluation.issues.map((item) => item.id), ['profile.hreflang.expected']);
  assert.equal(evaluation.score, 95);
});

test('disabled profiles do not override global rules or add expectations', () => {
  const store = DomainProfiles.normalizeStore({
    profiles: {
      'example.com': {
        enabled: false,
        rules: { thresholds: { titleMax: 99 } },
        expected: { schemaTypes: ['Product'] },
      },
    },
  });
  const base = CustomRules.normalize({ thresholds: { titleMax: 60 } });
  const resolved = DomainProfiles.resolve(store, 'https://example.com/item', base);
  assert.equal(resolved.profile, null);
  assert.equal(resolved.rules.thresholds.titleMax, 60);
});

test('upsert and remove keep unrelated profiles intact', () => {
  let store = DomainProfiles.upsert(null, { hostname: 'a.example', label: 'A' });
  store = DomainProfiles.upsert(store, { hostname: 'b.example', label: 'B' });
  assert.deepEqual(Object.keys(store.profiles), ['a.example', 'b.example']);
  store = DomainProfiles.remove(store, 'a.example');
  assert.deepEqual(Object.keys(store.profiles), ['b.example']);
  assert.equal(store.profiles['b.example'].label, 'B');
});

test('profile validation rejects inverted and invalid explicit values', () => {
  const errors = DomainProfiles.validateProfile({
    hostname: 'example.com',
    rules: { thresholds: { titleMin: 80, titleMax: 50, imageMaxBytes: 1 } },
    expected: { schemaTypes: ['Bad type !'], hreflang: ['not_valid'] },
  });
  assert.ok(errors.some((item) => item.includes('title minimum')));
  assert.ok(errors.some((item) => item.includes('imageMaxBytes')));
  assert.ok(errors.some((item) => item.includes('schema type')));
  assert.ok(errors.some((item) => item.includes('hreflang')));
});

test('profile summary exposes only bounded policy metadata', () => {
  const summary = DomainProfiles.profileSummary({
    hostname: 'example.com',
    label: 'Shop',
    rules: { thresholds: { titleMax: 70 } },
    expected: { schemaTypes: ['Product'], hreflang: ['lt'] },
    ignoreChecks: ['title.short'],
  });
  assert.deepEqual(summary, {
    version: 1,
    hostname: 'example.com',
    label: 'Shop',
    enabled: true,
    expectedSchemaTypes: ['Product'],
    expectedHreflang: ['lt'],
    ignoredChecks: ['title.short'],
  });
});
