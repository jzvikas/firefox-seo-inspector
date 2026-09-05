'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PageExtractor = require('../src/lib/page-extractor.js');

function element(tagName, attributes = {}, options = {}) {
  const attrs = { ...attributes };
  return {
    tagName,
    textContent: options.textContent || '',
    currentSrc: options.currentSrc || '',
    src: options.src || '',
    width: options.width || 0,
    height: options.height || 0,
    naturalWidth: options.naturalWidth || 0,
    naturalHeight: options.naturalHeight || 0,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    querySelector(selector) { return selector === 'img[alt]' ? (options.childImage || null) : null; },
    getBoundingClientRect() { return { width: options.renderedWidth || this.width || 0, height: options.renderedHeight || this.height || 0 }; },
  };
}

function fakeDocument() {
  const description = element('META', { content: 'A sufficiently useful page description for extraction testing.', name: 'description' });
  const viewport = element('META', { content: 'width=device-width, initial-scale=1', name: 'viewport' });
  const canonical = element('LINK', { href: '/product', rel: 'canonical' });
  const robots = element('META', { name: 'robots', content: 'index, follow' });
  const h1 = element('H1', {}, { textContent: 'Primary heading' });
  const h2 = element('H2', {}, { textContent: 'Secondary heading' });
  const childImage = element('IMG', { alt: 'Linked image' });
  const internalLink = element('A', { href: '/next', rel: 'nofollow' }, { textContent: 'Next page' });
  const imageLink = element('A', { href: 'https://other.example/item' }, { childImage });
  const image = element('IMG', { alt: 'Photo', loading: 'lazy', width: '800', height: '600', src: '/photo.webp' }, {
    currentSrc: 'https://example.com/photo.webp', naturalWidth: 800, naturalHeight: 600, renderedWidth: 400, renderedHeight: 300,
  });
  const hreflang = element('LINK', { rel: 'alternate', hreflang: 'de', href: '/de/product' });
  const schema = element('SCRIPT', {}, { textContent: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Widget', offers: { '@type': 'Offer', price: '10' } }) });
  const og = element('META', { property: 'og:title', content: 'OG title' });
  const twitter = element('META', { name: 'twitter:card', content: 'summary_large_image' });

  const all = new Map([
    ['link[rel~="canonical" i]', [canonical]],
    ['meta[name="robots" i], meta[name="googlebot" i], meta[name="bingbot" i]', [robots]],
    ['h1,h2,h3,h4,h5,h6', [h1, h2]],
    ['a[href]', [internalLink, imageLink]],
    ['img', [image]],
    ['link[rel~="alternate" i][hreflang]', [hreflang]],
    ['script[type="application/ld+json" i]', [schema]],
    ['meta[property^="og:"]', [og]],
    ['meta[name^="twitter:"]', [twitter]],
  ]);

  return {
    title: 'Extracted page title',
    documentElement: element('HTML', { lang: 'en' }),
    body: { textContent: 'One two three four five' },
    querySelector(selector) {
      if (selector === 'meta[name="description" i]') return description;
      if (selector === 'meta[name="viewport" i]') return viewport;
      return null;
    },
    querySelectorAll(selector) { return all.get(selector) || []; },
  };
}

test('extracts core SEO facts from a document-like object', () => {
  const doc = fakeDocument();
  const performance = { getEntriesByName: () => [{ transferSize: 12345 }] };
  const facts = PageExtractor.extract(doc, { href: 'https://example.com/product', origin: 'https://example.com' }, { performance });

  assert.equal(facts.title, 'Extracted page title');
  assert.equal(facts.description, 'A sufficiently useful page description for extraction testing.');
  assert.equal(facts.canonical.href, 'https://example.com/product');
  assert.equal(facts.robots[0].content, 'index, follow');
  assert.deepEqual(facts.headings.map((item) => item.level), [1, 2]);
  assert.equal(facts.links[0].internal, true);
  assert.equal(facts.links[0].nofollow, true);
  assert.equal(facts.links[1].label, 'Linked image');
  assert.equal(facts.images[0].transferSize, 12345);
  assert.equal(facts.images[0].renderedWidth, 400);
  assert.equal(facts.hreflang[0].href, 'https://example.com/de/product');
  assert.deepEqual(facts.schemas[0].types, ['Offer', 'Product']);
  assert.equal(facts.schemas[0].summary.name, 'Widget');
  assert.equal(facts.openGraph['og:title'], 'OG title');
  assert.equal(facts.twitter['twitter:card'], 'summary_large_image');
  assert.equal(facts.textWordCount, 5);
});

test('invalid JSON-LD is preserved as an invalid schema record', () => {
  const doc = fakeDocument();
  const invalid = element('SCRIPT', {}, { textContent: '{invalid' });
  doc.querySelectorAll = (selector) => selector === 'script[type="application/ld+json" i]' ? [invalid] : [];
  doc.querySelector = () => null;
  const facts = PageExtractor.extract(doc, { href: 'https://example.com/', origin: 'https://example.com' }, {});
  assert.equal(facts.schemas.length, 1);
  assert.equal(facts.schemas[0].valid, false);
  assert.match(facts.schemas[0].error, /JSON/i);
});

test('link kind classification covers non-HTTP schemes', () => {
  assert.equal(PageExtractor.linkKind('javascript:void(0)'), 'javascript');
  assert.equal(PageExtractor.linkKind('mailto:hello@example.com'), 'mailto');
  assert.equal(PageExtractor.linkKind('tel:+100000000'), 'tel');
  assert.equal(PageExtractor.linkKind('#part'), 'fragment');
  assert.equal(PageExtractor.linkKind('/relative'), 'http');
});
