(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PageExtractor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function attr(element, name) {
    if (!element || typeof element.getAttribute !== 'function') return null;
    return element.getAttribute(name);
  }

  function safeText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function arrayFrom(value) {
    return Array.prototype.slice.call(value || []);
  }

  function makeRef(selector, index) {
    return { selector, index };
  }

  function absoluteUrl(value, base) {
    if (!value) return '';
    try {
      return new URL(value, base).href;
    } catch (_error) {
      return String(value);
    }
  }

  function linkKind(href) {
    const value = String(href || '').trim().toLowerCase();
    if (value.startsWith('javascript:')) return 'javascript';
    if (value.startsWith('mailto:')) return 'mailto';
    if (value.startsWith('tel:')) return 'tel';
    if (value.startsWith('#')) return 'fragment';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('?')) return 'http';
    return value ? 'other' : 'empty';
  }

  function schemaTypeList(node, output) {
    const result = output || new Set();
    if (!node || typeof node !== 'object') return result;
    if (Array.isArray(node)) {
      node.forEach((item) => schemaTypeList(item, result));
      return result;
    }
    const type = node['@type'];
    if (Array.isArray(type)) type.forEach((item) => result.add(String(item)));
    else if (type) result.add(String(type));
    Object.keys(node).forEach((key) => {
      if (key !== '@context') schemaTypeList(node[key], result);
    });
    return result;
  }

  function findProductSummary(node) {
    let found = null;
    function visit(value) {
      if (found || !value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const type = value['@type'];
      const types = Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
      if (types.includes('Product')) {
        found = {
          name: safeText(value.name || ''),
          hasOffers: Boolean(value.offers),
          sku: safeText(value.sku || ''),
          brand: typeof value.brand === 'string' ? value.brand : value.brand && value.brand.name ? String(value.brand.name) : '',
        };
        return;
      }
      Object.keys(value).forEach((key) => {
        if (key !== '@context') visit(value[key]);
      });
    }
    visit(node);
    return found;
  }

  function extract(doc, locationLike, environment) {
    const locationValue = locationLike || {};
    const baseUrl = locationValue.href || '';
    let origin = locationValue.origin || '';
    if (!origin && baseUrl) {
      try { origin = new URL(baseUrl).origin; } catch (_error) { origin = ''; }
    }
    const env = environment || {};
    const performanceApi = env.performance || null;

    const descriptionNode = doc.querySelector('meta[name="description" i]');
    const viewportNode = doc.querySelector('meta[name="viewport" i]');
    const canonicalNodes = arrayFrom(doc.querySelectorAll('link[rel~="canonical" i]'));
    const robotsNodes = arrayFrom(doc.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i], meta[name="bingbot" i]'));
    const headingNodes = arrayFrom(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const linkNodes = arrayFrom(doc.querySelectorAll('a[href]'));
    const imageNodes = arrayFrom(doc.querySelectorAll('img'));
    const hreflangNodes = arrayFrom(doc.querySelectorAll('link[rel~="alternate" i][hreflang]'));
    const schemaNodes = arrayFrom(doc.querySelectorAll('script[type="application/ld+json" i]'));
    const ogNodes = arrayFrom(doc.querySelectorAll('meta[property^="og:"]'));
    const twitterNodes = arrayFrom(doc.querySelectorAll('meta[name^="twitter:"]'));

    const headings = headingNodes.map((element, index) => ({
      level: Number(String(element.tagName || '').slice(1)) || 0,
      text: safeText(element.textContent || ''),
      ref: makeRef('h1,h2,h3,h4,h5,h6', index),
    }));

    const links = linkNodes.map((element, index) => {
      const rawHref = attr(element, 'href') || '';
      const kind = linkKind(rawHref);
      const resolved = kind === 'http' ? absoluteUrl(rawHref, baseUrl) : rawHref;
      let internal = false;
      if (kind === 'http' && origin) {
        try { internal = new URL(resolved).origin === origin; } catch (_error) { internal = false; }
      }
      let imageAlt = '';
      if (typeof element.querySelector === 'function') {
        const image = element.querySelector('img[alt]');
        if (image) imageAlt = attr(image, 'alt') || '';
      }
      const label = safeText(element.textContent || '') || safeText(attr(element, 'aria-label') || '') || safeText(attr(element, 'title') || '') || safeText(imageAlt);
      const rel = safeText(attr(element, 'rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
      return {
        href: resolved,
        rawHref,
        label,
        kind,
        internal,
        nofollow: rel.includes('nofollow'),
        sponsored: rel.includes('sponsored'),
        ugc: rel.includes('ugc'),
        target: attr(element, 'target') || '',
        ref: makeRef('a[href]', index),
      };
    });

    const images = imageNodes.map((element, index) => {
      const source = element.currentSrc || element.src || attr(element, 'src') || '';
      let transferSize = 0;
      if (performanceApi && source && typeof performanceApi.getEntriesByName === 'function') {
        const entries = performanceApi.getEntriesByName(source);
        const entry = entries && entries.length ? entries[entries.length - 1] : null;
        transferSize = entry && Number(entry.transferSize) ? Number(entry.transferSize) : 0;
      }
      let renderedWidth = Number(element.width) || 0;
      let renderedHeight = Number(element.height) || 0;
      if (typeof element.getBoundingClientRect === 'function') {
        const rect = element.getBoundingClientRect();
        if (rect) {
          renderedWidth = Math.round(Number(rect.width) || renderedWidth);
          renderedHeight = Math.round(Number(rect.height) || renderedHeight);
        }
      }
      return {
        src: absoluteUrl(source, baseUrl),
        altPresent: typeof element.hasAttribute === 'function' ? element.hasAttribute('alt') : attr(element, 'alt') !== null,
        alt: attr(element, 'alt') || '',
        loading: attr(element, 'loading') || '',
        srcset: attr(element, 'srcset') || '',
        widthAttr: attr(element, 'width') || '',
        heightAttr: attr(element, 'height') || '',
        naturalWidth: Number(element.naturalWidth) || 0,
        naturalHeight: Number(element.naturalHeight) || 0,
        renderedWidth,
        renderedHeight,
        transferSize,
        ref: makeRef('img', index),
      };
    });

    const schemas = schemaNodes.map((element, index) => {
      const raw = String(element.textContent || '').trim();
      try {
        const parsed = JSON.parse(raw);
        const types = Array.from(schemaTypeList(parsed)).sort();
        return {
          valid: true,
          types,
          summary: findProductSummary(parsed),
          raw,
          parsed,
          ref: makeRef('script[type="application/ld+json" i]', index),
        };
      } catch (error) {
        return {
          valid: false,
          types: [],
          summary: null,
          raw,
          error: error && error.message ? error.message : 'Invalid JSON',
          ref: makeRef('script[type="application/ld+json" i]', index),
        };
      }
    });

    function metaMap(nodes, keyAttribute) {
      const map = {};
      nodes.forEach((element) => {
        const key = attr(element, keyAttribute) || '';
        if (key) map[key.toLowerCase()] = attr(element, 'content') || '';
      });
      return map;
    }

    return {
      url: baseUrl,
      title: safeText(doc.title || ''),
      description: descriptionNode ? attr(descriptionNode, 'content') || '' : '',
      viewport: viewportNode ? attr(viewportNode, 'content') || '' : '',
      lang: doc.documentElement ? attr(doc.documentElement, 'lang') || '' : '',
      canonical: {
        count: canonicalNodes.length,
        href: canonicalNodes.length ? absoluteUrl(attr(canonicalNodes[0], 'href') || '', baseUrl) : '',
        raw: canonicalNodes.length ? attr(canonicalNodes[0], 'href') || '' : '',
      },
      robots: robotsNodes.map((element, index) => ({
        name: (attr(element, 'name') || '').toLowerCase(),
        content: attr(element, 'content') || '',
        ref: makeRef('meta[name="robots" i], meta[name="googlebot" i], meta[name="bingbot" i]', index),
      })),
      headings,
      links,
      images,
      hreflang: hreflangNodes.map((element, index) => ({
        lang: attr(element, 'hreflang') || '',
        href: absoluteUrl(attr(element, 'href') || '', baseUrl),
        ref: makeRef('link[rel~="alternate" i][hreflang]', index),
      })),
      schemas,
      openGraph: metaMap(ogNodes, 'property'),
      twitter: metaMap(twitterNodes, 'name'),
      textWordCount: safeText(doc.body ? doc.body.textContent || '' : '').split(/\s+/).filter(Boolean).length,
    };
  }

  return { extract, linkKind, schemaTypeList, findProductSummary, safeText, absoluteUrl };
});
