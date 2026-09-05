'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PerformanceHints = require('../src/lib/performance-hints.js');

const BASE = 'https://example.com/page';

function fakeNode(tagName, attrs, rect, extra) {
  const values = Object.assign({}, attrs || {});
  return Object.assign({
    tagName: String(tagName || '').toUpperCase(),
    textContent: '',
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(values, name);
    },
    getBoundingClientRect() {
      const value = rect || { top: 0, left: 0, width: 0, height: 0 };
      return Object.assign({ right: value.left + value.width, bottom: value.top + value.height }, value);
    },
  }, extra || {});
}

function fakeDocument(map, headMap) {
  const values = map || {};
  return {
    querySelectorAll(selector) {
      return values[selector] || [];
    },
    head: headMap ? {
      querySelectorAll(selector) {
        return headMap[selector] || [];
      },
    } : null,
  };
}

test('viewport state distinguishes above-fold near-fold and below-fold items', () => {
  assert.equal(PerformanceHints.viewportState({ top: 10, bottom: 110, width: 100, height: 100 }, 800), 'above-fold');
  assert.equal(PerformanceHints.viewportState({ top: 900, bottom: 1000, width: 100, height: 100 }, 800), 'near-fold');
  assert.equal(PerformanceHints.viewportState({ top: 1300, bottom: 1400, width: 100, height: 100 }, 800), 'below-fold');
  assert.equal(PerformanceHints.viewportState({ top: 0, bottom: 0, width: 0, height: 0 }, 800), 'hidden');
});

test('reserved dimensions accept width/height attributes or CSS aspect-ratio', () => {
  const sized = fakeNode('img', { width: '800', height: '600' });
  const cssRatio = fakeNode('img');
  assert.equal(PerformanceHints.hasReservedDimensions(sized), true);
  assert.equal(PerformanceHints.hasReservedDimensions(cssRatio, () => ({ aspectRatio: '16 / 9' })), true);
  assert.equal(PerformanceHints.hasReservedDimensions(fakeNode('img'), () => ({ aspectRatio: 'auto' })), false);
});

test('image diagnostics detect missing dimensions and above-fold lazy loading', () => {
  const image = fakeNode('img', { src: '/hero.jpg', loading: 'lazy' }, { top: 20, left: 0, width: 600, height: 400 }, { src: `${BASE}/hero.jpg` });
  const doc = fakeDocument({ img: [image] });
  const result = PerformanceHints.imageDiagnostics(doc, { viewportHeight: 800, baseUrl: BASE });
  assert.equal(result.length, 1);
  assert.equal(result[0].missingDimensions, true);
  assert.equal(result[0].aboveFoldLazy, true);
  assert.equal(result[0].belowFoldEager, false);
});

test('large far-below-fold eager image is reported but small icons are ignored', () => {
  const large = fakeNode('img', { src: '/large.jpg' }, { top: 1400, left: 0, width: 500, height: 300 });
  const small = fakeNode('img', { src: '/icon.png' }, { top: 1500, left: 0, width: 40, height: 40 });
  const doc = fakeDocument({ img: [large, small] });
  const result = PerformanceHints.imageDiagnostics(doc, { viewportHeight: 800, baseUrl: BASE });
  assert.equal(result[0].belowFoldEager, true);
  assert.equal(result[1].belowFoldEager, false);
});

test('layout shift risks include rendered unsized media and exclude reserved elements', () => {
  const riskyImage = fakeNode('img', { src: '/a.jpg' }, { top: 0, left: 0, width: 300, height: 200 });
  const safeVideo = fakeNode('video', { width: '640', height: '360' }, { top: 0, left: 0, width: 640, height: 360 });
  const iframe = fakeNode('iframe', { src: '/embed' }, { top: 300, left: 0, width: 500, height: 300 });
  const doc = fakeDocument({ img: [riskyImage], video: [safeVideo], iframe: [iframe] });
  const risks = PerformanceHints.layoutShiftRisks(doc, { baseUrl: BASE });
  assert.equal(risks.length, 2);
  assert.equal(risks[0].type, 'img');
  assert.equal(risks[1].type, 'iframe');
});

test('likely LCP heuristic chooses the largest visible eligible element', () => {
  const hero = fakeNode('img', { src: '/hero.jpg', alt: 'Hero' }, { top: 20, left: 0, width: 700, height: 450 });
  const heading = fakeNode('h1', {}, { top: 20, left: 0, width: 600, height: 80 }, { textContent: 'A sufficiently long heading for an LCP text candidate' });
  const doc = fakeDocument({ img: [hero], video: [], h1: [heading], h2: [], p: [] });
  const candidate = PerformanceHints.likelyLcpCandidate(doc, { viewportHeight: 800, viewportWidth: 1200, baseUrl: BASE });
  assert.equal(candidate.type, 'img');
  assert.equal(candidate.url, 'https://example.com/hero.jpg');
});

test('resource hints classify preload preconnect prefetch and dns-prefetch', () => {
  const links = [
    fakeNode('link', { rel: 'preload', href: '/font.woff2', as: 'font', crossorigin: '' }),
    fakeNode('link', { rel: 'preconnect', href: 'https://cdn.example.net' }),
    fakeNode('link', { rel: 'prefetch', href: '/next' }),
    fakeNode('link', { rel: 'dns-prefetch', href: '//static.example.net' }),
    fakeNode('link', { rel: 'stylesheet', href: '/style.css' }),
  ];
  const result = PerformanceHints.collectResourceHints(fakeDocument({ 'link[rel]': links }), BASE);
  assert.deepEqual(result.map((item) => item.rel), ['preload', 'preconnect', 'prefetch', 'dns-prefetch']);
  assert.equal(result[0].as, 'font');
  assert.equal(result[0].crossorigin, 'anonymous');
});

test('render-blocking rules exclude print styles and async/defer/module scripts', () => {
  const blockingCss = fakeNode('link', { rel: 'stylesheet', href: '/app.css' });
  const printCss = fakeNode('link', { rel: 'stylesheet', href: '/print.css', media: 'print' });
  const blockingJs = fakeNode('script', { src: '/app.js' });
  const deferJs = fakeNode('script', { src: '/defer.js', defer: '' });
  const moduleJs = fakeNode('script', { src: '/module.js', type: 'module' });
  assert.equal(PerformanceHints.isBlockingStylesheet(blockingCss), true);
  assert.equal(PerformanceHints.isBlockingStylesheet(printCss), false);
  assert.equal(PerformanceHints.isBlockingScript(blockingJs), true);
  assert.equal(PerformanceHints.isBlockingScript(deferJs), false);
  assert.equal(PerformanceHints.isBlockingScript(moduleJs), false);
});

test('render blocking collection returns only head candidates', () => {
  const blockingCss = fakeNode('link', { rel: 'stylesheet', href: '/app.css' });
  const printCss = fakeNode('link', { rel: 'stylesheet', href: '/print.css', media: 'print' });
  const blockingJs = fakeNode('script', { src: '/app.js' });
  const asyncJs = fakeNode('script', { src: '/async.js', async: '' });
  const doc = fakeDocument({}, { 'link[rel],script[src]': [blockingCss, printCss, blockingJs, asyncJs] });
  const result = PerformanceHints.renderBlockingCandidates(doc, BASE);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.type), ['stylesheet', 'script']);
});

test('font hints match font resources to preloads and flag preload without crossorigin', () => {
  const hints = [
    { rel: 'preload', as: 'font', href: 'https://example.com/a.woff2', crossorigin: 'anonymous' },
    { rel: 'preload', as: 'font', href: 'https://example.com/b.woff2', crossorigin: '' },
  ];
  const performance = {
    resources: [
      { kind: 'font', url: 'https://example.com/a.woff2', duration: 20, sizeBytes: 10000 },
      { kind: 'font', url: 'https://example.com/c.woff2', duration: 30, sizeBytes: 12000 },
    ],
  };
  const result = PerformanceHints.fontHints(hints, performance);
  assert.equal(result.fonts.length, 2);
  assert.equal(result.fonts[0].preloaded, true);
  assert.equal(result.missingPreload.length, 1);
  assert.equal(result.preloadWithoutCrossorigin.length, 1);
});

test('collect produces deterministic summary and issue groups', () => {
  const hero = fakeNode('img', { src: '/hero.jpg', loading: 'lazy' }, { top: 20, left: 0, width: 600, height: 400 });
  const blockingCss = fakeNode('link', { rel: 'stylesheet', href: '/app.css' });
  const preload = fakeNode('link', { rel: 'preload', href: '/font.woff2', as: 'font' });
  const doc = fakeDocument({
    img: [hero], video: [], iframe: [], h1: [], h2: [], p: [], 'link[rel]': [blockingCss, preload],
  }, { 'link[rel],script[src]': [blockingCss] });
  const result = PerformanceHints.collect(doc, { viewportHeight: 800, viewportWidth: 1200, baseUrl: BASE }, { resources: [] });
  assert.equal(result.summary.missingImageDimensions, 1);
  assert.equal(result.summary.aboveFoldLazyImages, 1);
  assert.equal(result.summary.renderBlockingCount, 1);
  assert.ok(result.issues.some((item) => item.code === 'image-dimensions'));
  assert.ok(result.issues.some((item) => item.code === 'above-fold-lazy'));
  assert.ok(result.issues.some((item) => item.code === 'render-blocking'));
});
