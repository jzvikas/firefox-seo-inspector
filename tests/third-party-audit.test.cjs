'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ThirdPartyAudit = require('../src/lib/third-party-audit.js');

test('domain matching accepts exact hosts and subdomains only', () => {
  assert.equal(ThirdPartyAudit.matchesDomain('www.google-analytics.com', 'google-analytics.com'), true);
  assert.equal(ThirdPartyAudit.matchesDomain('google-analytics.com', 'google-analytics.com'), true);
  assert.equal(ThirdPartyAudit.matchesDomain('fakegoogle-analytics.com', 'google-analytics.com'), false);
});

test('classifies common public service domains locally', () => {
  assert.equal(ThirdPartyAudit.classifyHost('www.googletagmanager.com').category, 'tag-manager');
  assert.equal(ThirdPartyAudit.classifyHost('www.google-analytics.com').category, 'analytics');
  assert.equal(ThirdPartyAudit.classifyHost('stats.g.doubleclick.net').category, 'ad');
  assert.equal(ThirdPartyAudit.classifyHost('client.crisp.chat').category, 'widget');
  assert.equal(ThirdPartyAudit.classifyHost('cdn.jsdelivr.net').category, 'cdn');
});

test('generic CDN host naming is clearly heuristic and unknown hosts stay unclassified', () => {
  const cdn = ThirdPartyAudit.classifyHost('cdn.assets.example.net');
  assert.equal(cdn.category, 'cdn');
  assert.equal(cdn.confidence, 'hostname-heuristic');
  const unknown = ThirdPartyAudit.classifyHost('api.example.net');
  assert.equal(unknown.category, 'other');
  assert.equal(unknown.confidence, 'unclassified');
});

test('groups only resources already classified as third-party', () => {
  const groups = ThirdPartyAudit.groupResources({ resources: [
    { url: 'https://example.com/app.js', thirdParty: false, kind: 'javascript', sizeBytes: 1000, duration: 10 },
    { url: 'https://cdn.example.net/a.js', thirdParty: true, kind: 'javascript', sizeBytes: 2000, duration: 20 },
    { url: 'https://cdn.example.net/a.css', thirdParty: true, kind: 'css', sizeBytes: 3000, duration: 30 },
  ] });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].host, 'cdn.example.net');
  assert.equal(groups[0].requestCount, 2);
  assert.equal(groups[0].knownBytes, 5000);
  assert.deepEqual(groups[0].typeCounts, { javascript: 1, css: 1 });
});

test('unknown resource sizes remain unknown instead of being invented', () => {
  const groups = ThirdPartyAudit.groupResources({ resources: [
    { url: 'https://api.example.net/a', thirdParty: true, kind: 'fetch', sizeBytes: 0, duration: 10 },
    { url: 'https://api.example.net/b', thirdParty: true, kind: 'fetch', sizeBytes: 250, duration: 15 },
  ] });
  assert.equal(groups[0].requestCount, 2);
  assert.equal(groups[0].knownSizeCount, 1);
  assert.equal(groups[0].knownBytes, 250);
});

test('sample URL list is bounded and deduplicated', () => {
  const group = ThirdPartyAudit.emptyGroup('api.example.net');
  for (let index = 0; index < ThirdPartyAudit.SAMPLE_URL_LIMIT + 4; index += 1) {
    ThirdPartyAudit.addResource(group, { url: `https://api.example.net/r${index}`, kind: 'fetch', sizeBytes: 1 });
  }
  ThirdPartyAudit.addResource(group, { url: 'https://api.example.net/r0', kind: 'fetch', sizeBytes: 1 });
  assert.equal(group.sampleUrls.length, ThirdPartyAudit.SAMPLE_URL_LIMIT);
  assert.equal(new Set(group.sampleUrls).size, ThirdPartyAudit.SAMPLE_URL_LIMIT);
});

test('groups sort by known bytes then request count', () => {
  const groups = ThirdPartyAudit.groupResources({ resources: [
    { url: 'https://a.example.net/1', thirdParty: true, kind: 'image', sizeBytes: 100, duration: 1 },
    { url: 'https://a.example.net/2', thirdParty: true, kind: 'image', sizeBytes: 100, duration: 1 },
    { url: 'https://b.example.net/1', thirdParty: true, kind: 'javascript', sizeBytes: 500, duration: 1 },
    { url: 'https://c.example.net/1', thirdParty: true, kind: 'css', sizeBytes: 200, duration: 1 },
    { url: 'https://c.example.net/2', thirdParty: true, kind: 'css', sizeBytes: 0, duration: 1 },
    { url: 'https://c.example.net/3', thirdParty: true, kind: 'css', sizeBytes: 0, duration: 1 },
  ] });
  assert.deepEqual(groups.map((group) => group.host), ['b.example.net', 'c.example.net', 'a.example.net']);
});

test('category summary aggregates domains requests and known bytes', () => {
  const summary = ThirdPartyAudit.categorySummary([
    { category: 'analytics', categoryLabel: 'Analytics', requestCount: 2, knownBytes: 1000, knownSizeCount: 1 },
    { category: 'analytics', categoryLabel: 'Analytics', requestCount: 3, knownBytes: 2000, knownSizeCount: 2 },
    { category: 'cdn', categoryLabel: 'CDN', requestCount: 8, knownBytes: 500, knownSizeCount: 4 },
  ]);
  const analytics = summary.find((item) => item.category === 'analytics');
  assert.deepEqual(analytics, { category: 'analytics', label: 'Analytics', domains: 2, requests: 5, knownBytes: 3000, knownSizeCount: 3 });
});

test('collect returns domain request byte and category summaries', () => {
  const result = ThirdPartyAudit.collect({ resources: [
    { url: 'https://www.google-analytics.com/g/collect', thirdParty: true, kind: 'fetch', sizeBytes: 900, duration: 30 },
    { url: 'https://cdn.jsdelivr.net/npm/a.js', thirdParty: true, kind: 'javascript', sizeBytes: 1200, duration: 50 },
    { url: 'https://example.com/local.css', thirdParty: false, kind: 'css', sizeBytes: 9999, duration: 5 },
  ] });
  assert.equal(result.summary.domainCount, 2);
  assert.equal(result.summary.requestCount, 2);
  assert.equal(result.summary.knownBytes, 2100);
  assert.equal(result.categories.length, 2);
  assert.equal(result.groups.length, 2);
  assert.match(result.classificationNote, /local heuristics/i);
});
