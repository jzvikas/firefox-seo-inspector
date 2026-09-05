'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const RobotsTxt = require('../src/lib/robots.js');

test('parses groups, comments, and sitemap declarations', () => {
  const parsed = RobotsTxt.parse(`
# global comment
User-agent: *
Disallow: /private/ # comment
Allow: /private/public/
Sitemap: https://example.com/sitemap.xml
`);
  assert.equal(parsed.groups.length, 1);
  assert.deepEqual(parsed.groups[0].agents, ['*']);
  assert.equal(parsed.groups[0].rules.length, 2);
  assert.deepEqual(parsed.sitemaps, ['https://example.com/sitemap.xml']);
  assert.equal(parsed.warnings.length, 0);
});

test('specific crawler group wins over wildcard group', () => {
  const parsed = RobotsTxt.parse(`
User-agent: *
Disallow: /

User-agent: Googlebot
Allow: /
Disallow: /internal/
`);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/shop', 'Googlebot').blocked, false);
  const blocked = RobotsTxt.evaluate(parsed, 'https://example.com/internal/report', 'Googlebot');
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.rule, 'Disallow: /internal/');
  assert.deepEqual(blocked.matchedAgents, ['googlebot']);
});

test('same-specificity groups are combined', () => {
  const parsed = RobotsTxt.parse(`
User-agent: Googlebot
Disallow: /one/

User-agent: Googlebot
Disallow: /two/
`);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/one/a', 'Googlebot').blocked, true);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/two/a', 'Googlebot').blocked, true);
});

test('longest matching rule wins and Allow wins equal-length ties', () => {
  const parsed = RobotsTxt.parse(`
User-agent: *
Disallow: /shop/
Allow: /shop/public/
Disallow: /same
Allow: /same
`);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/shop/private', 'Googlebot').blocked, true);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/shop/public/item', 'Googlebot').blocked, false);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/same', 'Googlebot').blocked, false);
});

test('wildcards and end anchors are matched against path plus query', () => {
  const parsed = RobotsTxt.parse(`
User-agent: *
Disallow: /*?preview=*$
Disallow: /*.pdf$
`);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/a?preview=1', 'Googlebot').blocked, true);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/file.pdf', 'Googlebot').blocked, true);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/file.pdf?download=1', 'Googlebot').blocked, false);
});

test('empty Disallow means no restriction', () => {
  const parsed = RobotsTxt.parse('User-agent: *\nDisallow:\n');
  const result = RobotsTxt.evaluate(parsed, 'https://example.com/anything', 'Googlebot');
  assert.equal(result.allowed, true);
  assert.equal(result.rule, '');
});

test('malformed directives produce warnings without blocking', () => {
  const parsed = RobotsTxt.parse('Disallow: /private\nthis is invalid\nUser-agent:\n');
  assert.equal(parsed.warnings.length, 3);
  assert.equal(RobotsTxt.evaluate(parsed, 'https://example.com/private', 'Googlebot').blocked, false);
});

test('relative sitemap declarations resolve against robots URL', () => {
  const result = RobotsTxt.resolveSitemaps(
    ['/sitemap.xml', 'https://cdn.example.net/map.xml', '/sitemap.xml'],
    'https://example.com/robots.txt',
  );
  assert.deepEqual(result, [
    'https://example.com/sitemap.xml',
    'https://cdn.example.net/map.xml',
  ]);
});
