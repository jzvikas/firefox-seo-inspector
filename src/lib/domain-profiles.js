(function (root, factory) {
  const rules = typeof module === 'object' && module.exports ? require('./custom-rules.js') : root.CustomRules;
  const api = factory(rules);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DomainProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CustomRules) {
  'use strict';

  const STORAGE_KEY = 'domainProfiles:v1';
  const SCHEMA_VERSION = 1;
  const MAX_PROFILES = 200;
  const MAX_EXPECTATIONS = 50;
  const MAX_IGNORES = 100;

  const THRESHOLD_LIMITS = Object.freeze({
    titleMin: [0, 500],
    titleMax: [1, 500],
    descriptionMin: [0, 2000],
    descriptionMax: [1, 2000],
    oversizedImageRatio: [1, 20],
    imageMaxBytes: [1024, 100 * 1024 * 1024],
  });

  const REQUIRED_KEYS = Object.freeze(['title', 'description', 'canonical', 'h1', 'schema', 'hreflang', 'https']);
  const PROFILE_CHECKS = Object.freeze([
    { id: 'profile.schema.expected', label: 'Expected schema types', category: 'Domain profile', severity: 'warning' },
    { id: 'profile.hreflang.expected', label: 'Expected hreflang values', category: 'Domain profile', severity: 'warning' },
  ]);

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function normalizeHostname(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
      const parsed = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? new URL(text) : new URL(`https://${text}`);
      return String(parsed.hostname || '').trim().toLowerCase().replace(/\.$/, '');
    } catch (_error) {
      return '';
    }
  }

  function validRuleId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value);
  }

  function normalizeSchemaType(value) {
    const text = String(value || '').trim();
    if (!text || text.length > 120 || !/^[a-z0-9_:#./-]+$/i.test(text)) return '';
    return text;
  }

  function normalizeHreflang(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'x-default') return text;
    if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(text)) return '';
    return text;
  }

  function uniqueSorted(values, normalizer, limit) {
    const output = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = normalizer(value);
      const key = String(normalized || '').toLowerCase();
      if (!normalized || seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
      if (output.length >= limit) break;
    }
    return output.sort((a, b) => String(a).localeCompare(String(b)));
  }

  function normalizePartialRules(value) {
    const source = plainObject(value) ? value : {};
    const thresholdsSource = plainObject(source.thresholds) ? source.thresholds : {};
    const requiredSource = plainObject(source.required) ? source.required : {};
    const severitySource = plainObject(source.severityOverrides) ? source.severityOverrides : {};
    const thresholds = {};
    const required = {};
    const severityOverrides = {};

    Object.entries(THRESHOLD_LIMITS).forEach(([key, [min, max]]) => {
      if (!hasOwn(thresholdsSource, key)) return;
      const number = Number(thresholdsSource[key]);
      if (!Number.isFinite(number)) return;
      thresholds[key] = key === 'oversizedImageRatio'
        ? Math.min(max, Math.max(min, number))
        : Math.round(Math.min(max, Math.max(min, number)));
    });

    REQUIRED_KEYS.forEach((key) => {
      if (typeof requiredSource[key] === 'boolean') required[key] = requiredSource[key];
    });

    Object.keys(severitySource).sort().forEach((id) => {
      const severity = String(severitySource[id] || '').toLowerCase();
      if (validRuleId(id) && CustomRules && CustomRules.SEVERITIES.includes(severity)) severityOverrides[id] = severity;
    });

    return { thresholds, required, severityOverrides };
  }

  function normalizeProfile(input, hostnameHint) {
    const source = plainObject(input) ? input : {};
    const hostname = normalizeHostname(source.hostname || hostnameHint || '');
    const label = String(source.label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const expectedSource = plainObject(source.expected) ? source.expected : {};
    return {
      version: SCHEMA_VERSION,
      hostname,
      label,
      enabled: source.enabled !== false,
      rules: normalizePartialRules(source.rules),
      expected: {
        schemaTypes: uniqueSorted(expectedSource.schemaTypes, normalizeSchemaType, MAX_EXPECTATIONS),
        hreflang: uniqueSorted(expectedSource.hreflang, normalizeHreflang, MAX_EXPECTATIONS),
      },
      ignoreChecks: uniqueSorted(source.ignoreChecks, (value) => validRuleId(value) ? String(value) : '', MAX_IGNORES),
    };
  }

  function normalizeStore(input) {
    const source = plainObject(input) ? input : {};
    const profilesSource = plainObject(source.profiles) ? source.profiles : {};
    const profiles = {};
    Object.keys(profilesSource).sort().slice(0, MAX_PROFILES).forEach((key) => {
      const profile = normalizeProfile(profilesSource[key], key);
      if (profile.hostname) profiles[profile.hostname] = profile;
    });
    return { version: SCHEMA_VERSION, profiles };
  }

  function validateProfile(input) {
    const errors = [];
    const source = plainObject(input) ? input : {};
    if (!normalizeHostname(source.hostname || '')) errors.push('A valid hostname is required.');

    const rules = plainObject(source.rules) ? source.rules : {};
    const thresholds = plainObject(rules.thresholds) ? rules.thresholds : {};
    Object.entries(THRESHOLD_LIMITS).forEach(([key, [min, max]]) => {
      if (!hasOwn(thresholds, key)) return;
      const number = Number(thresholds[key]);
      if (!Number.isFinite(number) || number < min || number > max) errors.push(`${key} must be between ${min} and ${max}.`);
    });
    if (hasOwn(thresholds, 'titleMin') && hasOwn(thresholds, 'titleMax') && Number(thresholds.titleMin) > Number(thresholds.titleMax)) {
      errors.push('Profile title minimum cannot exceed profile title maximum.');
    }
    if (hasOwn(thresholds, 'descriptionMin') && hasOwn(thresholds, 'descriptionMax') && Number(thresholds.descriptionMin) > Number(thresholds.descriptionMax)) {
      errors.push('Profile description minimum cannot exceed profile description maximum.');
    }

    const expected = plainObject(source.expected) ? source.expected : {};
    (Array.isArray(expected.schemaTypes) ? expected.schemaTypes : []).forEach((value) => {
      if (!normalizeSchemaType(value)) errors.push(`Invalid expected schema type: ${String(value).slice(0, 80)}`);
    });
    (Array.isArray(expected.hreflang) ? expected.hreflang : []).forEach((value) => {
      if (!normalizeHreflang(value)) errors.push(`Invalid expected hreflang: ${String(value).slice(0, 80)}`);
    });
    return errors;
  }

  function findProfile(store, urlOrHostname) {
    const normalized = normalizeStore(store);
    const hostname = normalizeHostname(urlOrHostname);
    return hostname && normalized.profiles[hostname] ? normalized.profiles[hostname] : null;
  }

  function mergeRules(baseConfig, profileInput) {
    const base = CustomRules.normalize(baseConfig);
    const profile = normalizeProfile(profileInput);
    if (!profile.hostname || !profile.enabled) return base;
    const thresholds = Object.assign({}, base.thresholds, profile.rules.thresholds);
    const required = Object.assign({}, base.required, profile.rules.required);
    const severityOverrides = Object.assign({}, base.severityOverrides, profile.rules.severityOverrides);
    const disabledChecks = Array.from(new Set(base.disabledChecks.concat(profile.ignoreChecks))).sort();
    return CustomRules.normalize({ thresholds, required, severityOverrides, disabledChecks });
  }

  function issue(id, title, message) {
    return { id, severity: 'warning', category: 'Domain profile', title, message, refs: [] };
  }

  function applyEvaluation(evaluation, facts, profileInput, effectiveRules) {
    const profile = normalizeProfile(profileInput);
    if (!profile.hostname || !profile.enabled) return evaluation;
    const pageFacts = plainObject(facts) ? facts : {};
    let issues = Array.isArray(evaluation && evaluation.issues) ? evaluation.issues.slice() : [];
    const existing = new Set(issues.map((item) => item && item.id).filter(Boolean));

    const actualSchema = new Set();
    (Array.isArray(pageFacts.schemas) ? pageFacts.schemas : []).forEach((schema) => {
      if (!schema || schema.valid === false) return;
      (Array.isArray(schema.types) ? schema.types : []).forEach((type) => actualSchema.add(String(type).toLowerCase()));
    });
    const missingSchema = profile.expected.schemaTypes.filter((type) => !actualSchema.has(type.toLowerCase()));
    if (missingSchema.length && !existing.has('profile.schema.expected')) {
      issues.push(issue('profile.schema.expected', 'Expected schema type is missing', `Missing: ${missingSchema.join(', ')}.`));
    }

    const actualHreflang = new Set((Array.isArray(pageFacts.hreflang) ? pageFacts.hreflang : [])
      .map((item) => normalizeHreflang(item && item.lang))
      .filter(Boolean));
    const missingHreflang = profile.expected.hreflang.filter((lang) => !actualHreflang.has(lang));
    if (missingHreflang.length && !existing.has('profile.hreflang.expected')) {
      issues.push(issue('profile.hreflang.expected', 'Expected hreflang value is missing', `Missing: ${missingHreflang.join(', ')}.`));
    }

    issues = CustomRules.applyIssuePolicy(issues, effectiveRules || mergeRules(null, profile));
    return Object.assign({}, evaluation, {
      issues,
      score: CustomRules.scoreIssues(issues),
      severityCounts: CustomRules.severityCounts(issues),
      domainProfileVersion: profile.version,
    });
  }

  function resolve(store, urlOrHostname, baseRules) {
    const hostname = normalizeHostname(urlOrHostname);
    const profile = findProfile(store, hostname);
    const active = profile && profile.enabled ? profile : null;
    return {
      hostname,
      profile: active,
      rules: active ? mergeRules(baseRules, active) : CustomRules.normalize(baseRules),
    };
  }

  function upsert(store, profileInput) {
    const normalized = normalizeStore(store);
    const profile = normalizeProfile(profileInput);
    if (!profile.hostname) return normalized;
    const profiles = Object.assign({}, normalized.profiles, { [profile.hostname]: profile });
    const keys = Object.keys(profiles).sort().slice(0, MAX_PROFILES);
    const bounded = {};
    keys.forEach((key) => { bounded[key] = profiles[key]; });
    return { version: SCHEMA_VERSION, profiles: bounded };
  }

  function remove(store, hostnameValue) {
    const normalized = normalizeStore(store);
    const hostname = normalizeHostname(hostnameValue);
    if (!hostname || !normalized.profiles[hostname]) return normalized;
    const profiles = Object.assign({}, normalized.profiles);
    delete profiles[hostname];
    return { version: SCHEMA_VERSION, profiles };
  }

  function profileSummary(profileInput) {
    const profile = normalizeProfile(profileInput);
    if (!profile.hostname) return null;
    return {
      version: profile.version,
      hostname: profile.hostname,
      label: profile.label,
      enabled: profile.enabled,
      expectedSchemaTypes: profile.expected.schemaTypes.slice(),
      expectedHreflang: profile.expected.hreflang.slice(),
      ignoredChecks: profile.ignoreChecks.slice(),
    };
  }

  return {
    STORAGE_KEY,
    SCHEMA_VERSION,
    MAX_PROFILES,
    MAX_EXPECTATIONS,
    MAX_IGNORES,
    THRESHOLD_LIMITS,
    REQUIRED_KEYS,
    PROFILE_CHECKS,
    normalizeHostname,
    normalizeSchemaType,
    normalizeHreflang,
    normalizePartialRules,
    normalizeProfile,
    normalizeStore,
    validateProfile,
    findProfile,
    mergeRules,
    applyEvaluation,
    resolve,
    upsert,
    remove,
    profileSummary,
  };
});
