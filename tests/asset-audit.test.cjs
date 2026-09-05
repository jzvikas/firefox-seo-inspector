'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AssetAudit = require('../src/lib/asset-audit.js');

const BASE = 'https://example.com/shop/page';

function fakeNode(tagName, attrs, textContent) {
  const values = Object.assign({}, attrs || {});
  return {
    tagName: String(tagName || '').toUpperCase(),
    textContent: String(textContent || ''),
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(values, name);
    },
  };
}

function fakeDocument(values) {
  const map = values || {};
  return {
    querySelectorAll(selector) {
      return map[selector] || [];
    },
  };
}

function performanceReport(resources) {
  return { resources: resources || [] };
}

test('normalizes asset URLs and compares origins for third-party detection', () => {
  assert.equal(AssetAudit.normalizeUrl('/app.js#v1', BASE), 'https://example.com/app.js');
  assert.equal(AssetAudit.normalizeUrl('https://example.com:443/a.css', BASE), 'https://example.com/a.css');
  assert.equal(AssetAudit.isThirdParty('/same.js', BASE), false);
  assert.equal(AssetAudit.isThirdParty('https://cdn.example.net/app.js', BASE), true);
});

test('collectScripts reports inline/external split and loading flags', () => {
  const scripts = [
    fakeNode('script', { src: '/classic.js' }),
    fakeNode('script', { src: '/async.js', async: '' }),
    fakeNode('script', { src: '/defer.js', defer: '' }),
    fakeNode('script', { src: '/module.js', type: 'module' }),
    fakeNode('script', { src: '/legacy.js', nomodule: '' }),
    fakeNode('script', {}, 'window.privateValue = 123;'),
  ];
  const doc = fakeDocument({ script: scripts });
  const result = AssetAudit.collectScripts(doc, BASE, performanceReport([]));

  assert.equal(result.length, 6);
  assert.equal(result.filter((item) => item.external).length, 5);
  assert.equal(result.filter((item) => item.inline).length, 1);
  assert.equal(result[1].async, true);
  assert.equal(result[2].defer, true);
  assert.equal(result[3].module, true);
  assert.equal(result[4].nomodule, true);
  assert.equal(result[5].inlineBytes, 'window.privateValue = 123;'.length);
  assert.equal(Object.prototype.hasOwnProperty.call(result[5], 'source'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result[5], 'textContent'), false);
});

test('script Resource Timing data supplies known size and duration', () => {
  const script = fakeNode('script', { src: '/app.js' });
  const resources = [{
    kind: 'javascript',
    url: 'https://example.com/app.js',
    sizeBytes: 321000,
    duration: 87.4,
  }];
  const result = AssetAudit.collectScripts(fakeDocument({ script: [script] }), BASE, performanceReport(resources));
  assert.equal(result[0].sizeKnown, true);
  assert.equal(result[0].sizeBytes, 321000);
  assert.equal(result[0].duration, 87.4);
  assert.equal(result[0].resourceTiming, true);
});

test('duplicate script groups normalize fragments before grouping', () => {
  const groups = AssetAudit.duplicateGroups([
    { url: 'https://example.com/app.js#one' },
    { url: 'https://example.com/app.js#two' },
    { url: 'https://example.com/other.js' },
  ]);
  assert.deepEqual(groups, [{ url: 'https://example.com/app.js', count: 2 }]);
});

test('third-party script groups aggregate count and only known bytes', () => {
  const groups = AssetAudit.groupThirdPartyScripts([
    { external: true, thirdParty: true, host: 'cdn.example.net', url: 'https://cdn.example.net/a.js', sizeKnown: true, sizeBytes: 1000 },
    { external: true, thirdParty: true, host: 'cdn.example.net', url: 'https://cdn.example.net/b.js', sizeKnown: false, sizeBytes: 0 },
    { external: true, thirdParty: true, host: 'tags.example.org', url: 'https://tags.example.org/tag.js', sizeKnown: true, sizeBytes: 2000 },
    { external: true, thirdParty: false, host: 'example.com', url: 'https://example.com/local.js', sizeKnown: true, sizeBytes: 9999 },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].host, 'tags.example.org');
  assert.equal(groups[0].knownBytes, 2000);
  const cdn = groups.find((item) => item.host === 'cdn.example.net');
  assert.equal(cdn.count, 2);
  assert.equal(cdn.knownBytes, 1000);
  assert.equal(cdn.knownSizeCount, 1);
});

test('large JavaScript warning requires a known Resource Timing size', () => {
  const threshold = AssetAudit.LARGE_JS_BYTES;
  const data = AssetAudit.buildIssues([
    { external: true, sizeKnown: true, sizeBytes: threshold },
    { external: true, sizeKnown: false, sizeBytes: threshold * 10 },
    { external: true, sizeKnown: true, sizeBytes: threshold - 1 },
  ], [], [], []);
  assert.equal(data.largeJs.length, 1);
  assert.equal(data.issues.filter((item) => item.code === 'large-js').length, 1);
});

test('collectStylesheets records external stylesheets and inline style byte counts', () => {
  const stylesheet = fakeNode('link', { rel: 'stylesheet', href: '/app.css', media: 'screen' });
  const alternate = fakeNode('link', { rel: 'alternate', href: '/ignored.css' });
  const inline = fakeNode('style', { media: 'all' }, 'body{margin:0}');
  const resources = [{ kind: 'css', url: 'https://example.com/app.css', sizeBytes: 120000, duration: 44 }];
  const doc = fakeDocument({ 'link[rel]': [stylesheet, alternate], style: [inline] });
  const result = AssetAudit.collectStylesheets(doc, BASE, performanceReport(resources));

  assert.equal(result.external.length, 1);
  assert.equal(result.external[0].url, 'https://example.com/app.css');
  assert.equal(result.external[0].media, 'screen');
  assert.equal(result.external[0].sizeBytes, 120000);
  assert.equal(result.inlineStyles.length, 1);
  assert.equal(result.inlineStyles[0].bytes, 'body{margin:0}'.length);
});

test('duplicate stylesheet and large CSS warnings are emitted independently', () => {
  const threshold = AssetAudit.LARGE_CSS_BYTES;
  const styles = [
    { url: 'https://example.com/app.css', sizeKnown: true, sizeBytes: threshold },
    { url: 'https://example.com/app.css', sizeKnown: true, sizeBytes: threshold },
  ];
  const duplicates = AssetAudit.duplicateGroups(styles);
  const data = AssetAudit.buildIssues([], styles, [], duplicates);

  assert.equal(duplicates.length, 1);
  assert.equal(data.largeCss.length, 2);
  assert.ok(data.issues.some((item) => item.code === 'duplicate-css'));
  assert.ok(data.issues.some((item) => item.code === 'large-css'));
});

test('script summary counts flags without double-counting inline assets as third-party', () => {
  const summary = AssetAudit.summarizeScripts([
    { external: true, inline: false, async: true, defer: false, module: false, nomodule: false, thirdParty: true },
    { external: true, inline: false, async: false, defer: true, module: true, nomodule: false, thirdParty: false },
    { external: false, inline: true, async: false, defer: false, module: false, nomodule: false, thirdParty: true },
  ]);
  assert.deepEqual(summary, {
    total: 3,
    external: 2,
    inline: 1,
    async: 1,
    defer: 1,
    module: 1,
    nomodule: 0,
    thirdParty: 1,
  });
});

test('collect caps script, stylesheet, and inline-style inventories', () => {
  const scripts = Array.from({ length: AssetAudit.ASSET_LIMIT + 5 }, (_, index) => fakeNode('script', { src: `/s${index}.js` }));
  const links = Array.from({ length: AssetAudit.ASSET_LIMIT + 7 }, (_, index) => fakeNode('link', { rel: 'stylesheet', href: `/s${index}.css` }));
  const styles = Array.from({ length: AssetAudit.ASSET_LIMIT + 9 }, () => fakeNode('style', {}, '.a{}'));
  const result = AssetAudit.collect(fakeDocument({ script: scripts, 'link[rel]': links, style: styles }), BASE, performanceReport([]));

  assert.equal(result.scripts.length, AssetAudit.ASSET_LIMIT);
  assert.equal(result.stylesheets.length, AssetAudit.ASSET_LIMIT);
  assert.equal(result.inlineStyles.length, AssetAudit.ASSET_LIMIT);
  assert.deepEqual(result.capped, { scripts: true, stylesheets: true, inlineStyles: true });
});

test('collect returns deterministic duplicate, large-asset, and third-party diagnostics', () => {
  const scripts = [
    fakeNode('script', { src: '/dup.js' }),
    fakeNode('script', { src: '/dup.js' }),
    fakeNode('script', { src: 'https://cdn.example.net/large.js', defer: '' }),
    fakeNode('script', {}, 'inline();'),
  ];
  const links = [
    fakeNode('link', { rel: 'stylesheet', href: '/dup.css' }),
    fakeNode('link', { rel: 'stylesheet', href: '/dup.css' }),
  ];
  const resources = [
    { kind: 'javascript', url: 'https://cdn.example.net/large.js', sizeBytes: AssetAudit.LARGE_JS_BYTES + 1, duration: 90 },
    { kind: 'css', url: 'https://example.com/dup.css', sizeBytes: AssetAudit.LARGE_CSS_BYTES + 1, duration: 20 },
  ];
  const result = AssetAudit.collect(fakeDocument({ script: scripts, 'link[rel]': links, style: [] }), BASE, performanceReport(resources));

  assert.equal(result.scriptSummary.total, 4);
  assert.equal(result.scriptSummary.thirdParty, 1);
  assert.equal(result.duplicateScripts.length, 1);
  assert.equal(result.duplicateStylesheets.length, 1);
  assert.equal(result.thirdPartyGroups.length, 1);
  assert.equal(result.largeJs.length, 1);
  assert.equal(result.largeCss.length, 2);
  assert.deepEqual(result.issues.map((item) => item.code).sort(), ['duplicate-css', 'duplicate-js', 'large-css', 'large-js']);
});
