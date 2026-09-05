'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ContentAudit = require('../src/lib/content-audit.js');

function text(value) {
  return { nodeType: 3, nodeValue: value, textContent: value };
}

function element(tagName, attrs, children, style) {
  const attributes = Object.assign({}, attrs || {});
  return {
    nodeType: 1,
    tagName: String(tagName || 'div').toUpperCase(),
    childNodes: children || [],
    style: style || {},
    hidden: Boolean(attributes.hidden),
    getAttribute(name) {
      const value = attributes[name];
      return value === undefined || value === null ? null : String(value);
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name);
    },
  };
}

function documentWithBody(body) {
  return { body };
}

test('wordCount handles Unicode words, apostrophes, and hyphenated terms', () => {
  assert.equal(ContentAudit.wordCount('Šlepetės vasarai – labai patogios. O’Reilly e-commerce 2026'), 7);
});

test('scanText excludes script/style/template/noscript/svg content', () => {
  const body = element('body', {}, [
    text('visible words here'),
    element('script', {}, [text('hidden script payload should not count')]),
    element('style', {}, [text('style words')]),
    element('template', {}, [text('template words')]),
    element('noscript', {}, [text('noscript words')]),
    element('svg', {}, [text('vector label')]),
  ]);
  const result = ContentAudit.scanText(body, { detectVisibility: false });
  assert.equal(result.visibleWords, 3);
  assert.equal(result.allWords, 3);
});

test('scanText separates visible and hidden text without double counting hidden descendants', () => {
  const body = element('body', {}, [
    text('one two three'),
    element('section', { hidden: '' }, [
      text('four five'),
      element('span', { 'aria-hidden': 'true' }, [text('six seven')]),
    ]),
  ]);
  const result = ContentAudit.scanText(body);
  assert.equal(result.visibleWords, 3);
  assert.equal(result.hiddenWords, 4);
  assert.equal(result.allWords, 7);
  assert.equal(result.hiddenRootCount, 1);
  assert.deepEqual(result.hiddenReasons, { 'hidden attribute': 1 });
});

test('computed styles detect display, visibility, and content-visibility hiding', () => {
  const display = element('div', { id: 'a' }, [text('one')]);
  const visibility = element('div', { id: 'b' }, [text('two')]);
  const contentVisibility = element('div', { id: 'c' }, [text('three')]);
  const body = element('body', {}, [display, visibility, contentVisibility]);
  const styleMap = new Map([
    [display, { display: 'none' }],
    [visibility, { visibility: 'hidden' }],
    [contentVisibility, { contentVisibility: 'hidden' }],
  ]);
  const result = ContentAudit.scanText(body, { getComputedStyle: (node) => styleMap.get(node) || {} });
  assert.equal(result.visibleWords, 0);
  assert.equal(result.hiddenWords, 3);
  assert.equal(result.hiddenRootCount, 3);
  assert.equal(result.hiddenReasons['display:none'], 1);
  assert.equal(result.hiddenReasons['visibility:hidden'], 1);
  assert.equal(result.hiddenReasons['content-visibility:hidden'], 1);
});

test('scanText enforces the configured node safety cap', () => {
  const body = element('body', {}, Array.from({ length: 300 }, (_, index) => element('p', {}, [text(`word${index}`)])));
  const result = ContentAudit.scanText(body, { nodeLimit: 100, detectVisibility: false });
  assert.equal(result.visitedNodes, 100);
  assert.equal(result.truncated, true);
  assert.equal(result.nodeLimit, 100);
});

test('language helpers normalize tags and validate common BCP47 shapes', () => {
  assert.equal(ContentAudit.normalizeLanguage(' LT_lt '), 'lt-lt');
  assert.equal(ContentAudit.primaryLanguage('en-GB'), 'en');
  assert.equal(ContentAudit.validLanguageTag('lt-LT'), true);
  assert.equal(ContentAudit.validLanguageTag('english'), false);
});

test('language analysis reports HTML/header and self-hreflang mismatches', () => {
  const facts = {
    url: 'https://example.test/lt/page',
    lang: 'lt-LT',
    hreflang: [{ lang: 'en-GB', href: 'https://example.test/lt/page' }],
  };
  const result = ContentAudit.analyzeLanguage(facts, { contentLanguage: ['en-US'] });
  assert.equal(result.issues.some((item) => item.code === 'content-language-mismatch'), true);
  assert.equal(result.issues.some((item) => item.code === 'self-hreflang-mismatch'), true);
});

test('language analysis warns for a missing or malformed HTML lang', () => {
  assert.equal(ContentAudit.analyzeLanguage({ url: '', lang: '', hreflang: [] }, null).issues[0].code, 'missing-html-lang');
  assert.equal(ContentAudit.analyzeLanguage({ url: '', lang: 'english', hreflang: [] }, null).issues[0].code, 'invalid-html-lang');
});

test('heading analysis reports missing/multiple H1, empty headings, and level jumps', () => {
  const result = ContentAudit.analyzeHeadings([
    { level: 1, text: 'First' },
    { level: 1, text: 'Second' },
    { level: 3, text: '' },
    { level: 4, text: 'Fourth' },
  ]);
  assert.equal(result.counts[1], 2);
  assert.equal(result.empty, 1);
  assert.equal(result.jumps.length, 1);
  assert.equal(result.issues.some((item) => item.code === 'multiple-h1'), true);
  assert.equal(result.issues.some((item) => item.code === 'empty-headings'), true);
  assert.equal(result.issues.some((item) => item.code === 'heading-jumps'), true);
});

test('collect marks short visible content as a clearly bounded heuristic', () => {
  const body = element('body', {}, [text('Only a few visible words.')]);
  const report = ContentAudit.collect(documentWithBody(body), {
    facts: { url: 'https://example.test/', lang: 'en', hreflang: [], headings: [{ level: 1, text: 'Page' }] },
    thinWordThreshold: 10,
    detectVisibility: false,
  });
  assert.equal(report.text.visibleWords, 5);
  assert.equal(report.thinContent.thin, true);
  assert.equal(report.thinContent.threshold, 10);
});
