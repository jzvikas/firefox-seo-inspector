(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HeadSignals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function decodeHtml(value) {
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#([0-9]+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  function parseAttributes(tag) {
    const attrs = {};
    const body = String(tag || '').replace(/^<\s*[a-z0-9:-]+/i, '').replace(/\/?\s*>\s*$/, '');
    const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = re.exec(body))) {
      const name = String(match[1] || '').toLowerCase();
      if (!name) continue;
      attrs[name] = decodeHtml(match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '');
    }
    return attrs;
  }

  function absoluteUrl(value, baseUrl) {
    if (!value) return '';
    try { return new URL(value, baseUrl).href; }
    catch (_error) { return String(value); }
  }

  function parse(html, baseUrl) {
    const source = String(html || '');
    const headEnd = source.search(/<\/head\s*>/i);
    const head = headEnd >= 0 ? source.slice(0, headEnd + 7) : source.slice(0, Math.min(source.length, 2 * 1024 * 1024));
    const canonical = [];
    const hreflang = [];
    const robots = [];

    const linkRe = /<link\b[^>]*>/gi;
    let match;
    while ((match = linkRe.exec(head))) {
      const attrs = parseAttributes(match[0]);
      const rel = String(attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (rel.includes('canonical') && attrs.href) canonical.push(absoluteUrl(attrs.href, baseUrl));
      if (rel.includes('alternate') && attrs.hreflang && attrs.href) {
        hreflang.push({ lang: attrs.hreflang, href: absoluteUrl(attrs.href, baseUrl) });
      }
    }

    const metaRe = /<meta\b[^>]*>/gi;
    while ((match = metaRe.exec(head))) {
      const attrs = parseAttributes(match[0]);
      const name = String(attrs.name || '').toLowerCase();
      if ((name === 'robots' || name === 'googlebot') && Object.prototype.hasOwnProperty.call(attrs, 'content')) {
        robots.push({ name, content: attrs.content || '' });
      }
    }

    return { canonical, hreflang, robots };
  }

  return { decodeHtml, parseAttributes, absoluteUrl, parse };
});
