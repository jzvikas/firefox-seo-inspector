(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PerformanceAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RESOURCE_LIMIT = 1000;

  function positiveNumber(value) {
    const number = Number(value) || 0;
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function nonNegativeNumber(value) {
    const number = Number(value) || 0;
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function rounded(value) {
    return Math.round(nonNegativeNumber(value) * 10) / 10;
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = '';
      return url.href;
    } catch (_error) {
      return String(value || '');
    }
  }

  function extensionFromUrl(value) {
    try {
      const pathname = new URL(value).pathname.toLowerCase();
      const match = pathname.match(/\.([a-z0-9]{1,8})$/i);
      return match ? match[1] : '';
    } catch (_error) {
      const match = String(value || '').split(/[?#]/)[0].toLowerCase().match(/\.([a-z0-9]{1,8})$/i);
      return match ? match[1] : '';
    }
  }

  function resourceKind(entry) {
    const type = String(entry && entry.initiatorType || '').toLowerCase();
    const ext = extensionFromUrl(entry && entry.name || '');

    if (type === 'script' || ['js', 'mjs', 'cjs'].includes(ext)) return 'javascript';
    if (type === 'css' || ext === 'css') return 'css';
    if (type === 'img' || type === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico'].includes(ext)) return 'image';
    if (type === 'font' || ['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font';
    if (type === 'iframe' || type === 'frame' || type === 'navigation') return 'document';
    if (type === 'fetch' || type === 'xmlhttprequest') return 'fetch';
    if (type === 'audio' || type === 'video' || type === 'track' || ['mp3', 'mp4', 'webm', 'ogg', 'wav'].includes(ext)) return 'media';
    return 'other';
  }

  function resourceBytes(entry) {
    const transfer = positiveNumber(entry && entry.transferSize);
    const encoded = positiveNumber(entry && entry.encodedBodySize);
    const decoded = positiveNumber(entry && entry.decodedBodySize);
    return {
      transfer,
      encoded,
      decoded,
      best: transfer || encoded || 0,
      source: transfer ? 'transferSize' : encoded ? 'encodedBodySize' : '',
    };
  }

  function isThirdParty(urlValue, pageUrl) {
    try {
      return new URL(urlValue).origin !== new URL(pageUrl).origin;
    } catch (_error) {
      return false;
    }
  }

  function serializeResource(entry, pageUrl) {
    const bytes = resourceBytes(entry);
    const url = normalizeUrl(entry && entry.name || '');
    return {
      url,
      initiatorType: String(entry && entry.initiatorType || ''),
      kind: resourceKind(entry),
      thirdParty: isThirdParty(url, pageUrl),
      startTime: rounded(entry && entry.startTime),
      duration: rounded(entry && entry.duration),
      transferSize: bytes.transfer,
      encodedBodySize: bytes.encoded,
      decodedBodySize: bytes.decoded,
      sizeBytes: bytes.best,
      sizeSource: bytes.source,
    };
  }

  function emptyBucket() {
    return { count: 0, bytes: 0, knownSizeCount: 0 };
  }

  function summarizeResources(resources) {
    const kinds = {
      document: emptyBucket(),
      javascript: emptyBucket(),
      css: emptyBucket(),
      image: emptyBucket(),
      font: emptyBucket(),
      fetch: emptyBucket(),
      media: emptyBucket(),
      other: emptyBucket(),
    };
    const thirdParty = emptyBucket();
    let totalBytes = 0;
    let knownSizeCount = 0;

    for (const resource of Array.isArray(resources) ? resources : []) {
      const kind = kinds[resource.kind] ? resource.kind : 'other';
      const size = positiveNumber(resource.sizeBytes);
      kinds[kind].count += 1;
      kinds[kind].bytes += size;
      if (size) kinds[kind].knownSizeCount += 1;
      totalBytes += size;
      if (size) knownSizeCount += 1;
      if (resource.thirdParty) {
        thirdParty.count += 1;
        thirdParty.bytes += size;
        if (size) thirdParty.knownSizeCount += 1;
      }
    }

    return {
      requestCount: Array.isArray(resources) ? resources.length : 0,
      totalBytes,
      knownSizeCount,
      unknownSizeCount: (Array.isArray(resources) ? resources.length : 0) - knownSizeCount,
      kinds,
      thirdParty,
    };
  }

  function navigationTiming(entry) {
    if (!entry) return null;
    const requestStart = nonNegativeNumber(entry.requestStart);
    const responseStart = nonNegativeNumber(entry.responseStart);
    const responseEnd = nonNegativeNumber(entry.responseEnd);
    const domainStart = nonNegativeNumber(entry.domainLookupStart);
    const domainEnd = nonNegativeNumber(entry.domainLookupEnd);
    const connectStart = nonNegativeNumber(entry.connectStart);
    const connectEnd = nonNegativeNumber(entry.connectEnd);
    const secureStart = nonNegativeNumber(entry.secureConnectionStart);
    const domContentLoaded = nonNegativeNumber(entry.domContentLoadedEventEnd);
    const loadEnd = nonNegativeNumber(entry.loadEventEnd);
    const duration = nonNegativeNumber(entry.duration);

    return {
      type: String(entry.type || ''),
      protocol: String(entry.nextHopProtocol || ''),
      redirectCount: nonNegativeNumber(entry.redirectCount),
      ttfb: responseStart >= requestStart ? rounded(responseStart - requestStart) : 0,
      responseStart: rounded(responseStart),
      responseDownload: responseEnd >= responseStart ? rounded(responseEnd - responseStart) : 0,
      dns: domainEnd >= domainStart ? rounded(domainEnd - domainStart) : 0,
      connect: connectEnd >= connectStart ? rounded(connectEnd - connectStart) : 0,
      tls: secureStart > 0 && connectEnd >= secureStart ? rounded(connectEnd - secureStart) : 0,
      domContentLoaded: rounded(domContentLoaded),
      load: rounded(loadEnd),
      total: rounded(duration || loadEnd || responseEnd),
      transferSize: positiveNumber(entry.transferSize),
      encodedBodySize: positiveNumber(entry.encodedBodySize),
      decodedBodySize: positiveNumber(entry.decodedBodySize),
    };
  }

  function navigationResource(entry, pageUrl, timing) {
    if (!entry || !timing) return null;
    const bytes = resourceBytes(entry);
    return {
      url: normalizeUrl(entry.name || pageUrl || ''),
      initiatorType: 'navigation',
      kind: 'document',
      thirdParty: false,
      startTime: 0,
      duration: timing.total,
      transferSize: bytes.transfer,
      encodedBodySize: bytes.encoded,
      decodedBodySize: bytes.decoded,
      sizeBytes: bytes.best,
      sizeSource: bytes.source,
    };
  }

  function domStats(doc) {
    const root = doc && doc.documentElement;
    if (!root) return { nodeCount: 0, maxDepth: 0 };

    let nodeCount = 0;
    let maxDepth = 0;
    const stack = [{ node: root, depth: 1 }];
    while (stack.length) {
      const current = stack.pop();
      if (!current || !current.node) continue;
      nodeCount += 1;
      if (current.depth > maxDepth) maxDepth = current.depth;
      const children = current.node.children || [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: children[index], depth: current.depth + 1 });
      }
    }
    return { nodeCount, maxDepth };
  }

  function collect(doc, performanceApi, pageUrl) {
    const page = String(pageUrl || '');
    let allResourceEntries = [];
    let navigationEntry = null;

    if (performanceApi && typeof performanceApi.getEntriesByType === 'function') {
      try {
        allResourceEntries = Array.from(performanceApi.getEntriesByType('resource') || []);
      } catch (_error) {
        allResourceEntries = [];
      }
      try {
        const navigationEntries = Array.from(performanceApi.getEntriesByType('navigation') || []);
        navigationEntry = navigationEntries.length ? navigationEntries[navigationEntries.length - 1] : null;
      } catch (_error) {
        navigationEntry = null;
      }
    }

    const capped = allResourceEntries.length > RESOURCE_LIMIT;
    const resourceEntries = allResourceEntries.slice(0, RESOURCE_LIMIT);
    const subresources = resourceEntries.map((entry) => serializeResource(entry, page));
    const navigation = navigationTiming(navigationEntry);
    const documentResource = navigationResource(navigationEntry, page, navigation);
    const resources = documentResource ? [documentResource].concat(subresources) : subresources;
    const summary = summarizeResources(resources);

    const largest = resources
      .filter((item) => item.sizeBytes > 0)
      .slice()
      .sort((a, b) => b.sizeBytes - a.sizeBytes || b.duration - a.duration)
      .slice(0, 20);
    const slowest = resources
      .filter((item) => item.duration > 0)
      .slice()
      .sort((a, b) => b.duration - a.duration || b.sizeBytes - a.sizeBytes)
      .slice(0, 20);

    return {
      capturedAt: Date.now(),
      resourceLimit: RESOURCE_LIMIT,
      capped,
      dom: domStats(doc),
      navigation,
      summary,
      largest,
      slowest,
      resources,
    };
  }

  return {
    RESOURCE_LIMIT,
    normalizeUrl,
    extensionFromUrl,
    resourceKind,
    resourceBytes,
    isThirdParty,
    serializeResource,
    summarizeResources,
    navigationTiming,
    navigationResource,
    domStats,
    collect,
  };
});
