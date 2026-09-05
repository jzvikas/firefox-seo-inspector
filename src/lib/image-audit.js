(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ImageAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = '';
      if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
      return url.href;
    } catch (_error) {
      return String(value || '');
    }
  }

  function formatFromContentType(value) {
    const type = String(value || '').toLowerCase().split(';')[0].trim();
    const map = {
      'image/jpeg': 'JPEG',
      'image/jpg': 'JPEG',
      'image/png': 'PNG',
      'image/webp': 'WebP',
      'image/avif': 'AVIF',
      'image/gif': 'GIF',
      'image/svg+xml': 'SVG',
      'image/bmp': 'BMP',
      'image/tiff': 'TIFF',
      'image/x-icon': 'ICO',
      'image/vnd.microsoft.icon': 'ICO',
    };
    return map[type] || '';
  }

  function formatFromUrl(value) {
    try {
      const path = new URL(value).pathname.toLowerCase();
      if (/\.jpe?g$/.test(path)) return 'JPEG';
      if (/\.png$/.test(path)) return 'PNG';
      if (/\.webp$/.test(path)) return 'WebP';
      if (/\.avif$/.test(path)) return 'AVIF';
      if (/\.gif$/.test(path)) return 'GIF';
      if (/\.svgz?$/.test(path)) return 'SVG';
      if (/\.bmp$/.test(path)) return 'BMP';
      if (/\.tiff?$/.test(path)) return 'TIFF';
      if (/\.ico$/.test(path)) return 'ICO';
    } catch (_error) {}
    return '';
  }

  function detectFormat(network, url) {
    return formatFromContentType(network && network.contentType) || formatFromUrl((network && network.finalUrl) || url) || 'Unknown';
  }

  function bytesLabel(value) {
    const bytes = Number(value) || 0;
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 102400 ? 0 : 1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function estimateWaste(image, network, devicePixelRatio) {
    const bytes = Number(network && network.sizeBytes) || Number(image && image.transferSize) || 0;
    const naturalWidth = Number(image && image.naturalWidth) || 0;
    const naturalHeight = Number(image && image.naturalHeight) || 0;
    const renderedWidth = Number(image && image.renderedWidth) || 0;
    const renderedHeight = Number(image && image.renderedHeight) || 0;
    const dpr = Math.max(1, Number(devicePixelRatio) || 1);
    const targetWidth = renderedWidth * dpr;
    const targetHeight = renderedHeight * dpr;

    if (!bytes || !naturalWidth || !naturalHeight || !targetWidth || !targetHeight) {
      return {
        sizeBytes: bytes,
        estimatedWasteBytes: 0,
        estimatedNeededBytes: bytes,
        sourcePixels: naturalWidth * naturalHeight,
        targetPixels: targetWidth * targetHeight,
        pixelRatio: 0,
        oversized: false,
        known: false,
      };
    }

    const sourcePixels = naturalWidth * naturalHeight;
    const targetPixels = targetWidth * targetHeight;
    const ratio = sourcePixels / targetPixels;
    const areaScale = Math.min(1, targetPixels / sourcePixels);
    const estimatedNeededBytes = Math.round(bytes * areaScale);
    const estimatedWasteBytes = Math.max(0, bytes - estimatedNeededBytes);

    return {
      sizeBytes: bytes,
      estimatedWasteBytes,
      estimatedNeededBytes,
      sourcePixels,
      targetPixels,
      pixelRatio: ratio,
      oversized: ratio > 1.5 && estimatedWasteBytes >= 10 * 1024,
      known: true,
    };
  }

  function networkState(network) {
    if (!network) return { level: 'unknown', label: 'Not checked' };
    if (network.error) return { level: 'critical', label: network.error };
    const status = Number(network.status) || 0;
    if (!status) return { level: 'critical', label: 'Network error' };
    if (status >= 500) return { level: 'critical', label: `HTTP ${status}` };
    if (status >= 400) return { level: 'critical', label: `HTTP ${status}` };
    if (status >= 300 || network.redirected) return { level: 'warning', label: `${status || ''}${network.redirected ? ' redirect' : ''}`.trim() };
    return { level: 'ok', label: `HTTP ${status}` };
  }

  function analyze(images, networkResults, devicePixelRatio) {
    const map = new Map();
    for (const item of Array.isArray(networkResults) ? networkResults : []) {
      map.set(normalizeUrl(item.requestedUrl || item.url), item);
    }

    const rows = (Array.isArray(images) ? images : []).map((image, index) => {
      const url = normalizeUrl(image.src);
      const network = map.get(url) || null;
      const state = networkState(network);
      const waste = estimateWaste(image, network, devicePixelRatio);
      return {
        index,
        url,
        image,
        network,
        statusLevel: state.level,
        statusLabel: state.label,
        format: detectFormat(network, url),
        sizeBytes: waste.sizeBytes,
        sizeSource: network && network.sizeSource ? network.sizeSource : (image.transferSize ? 'performance' : ''),
        estimatedWasteBytes: waste.estimatedWasteBytes,
        estimatedNeededBytes: waste.estimatedNeededBytes,
        pixelRatio: waste.pixelRatio,
        oversized: waste.oversized,
        wasteKnown: waste.known,
        broken: state.level === 'critical',
      };
    });

    const ranked = rows.slice().sort((a, b) => {
      if (b.estimatedWasteBytes !== a.estimatedWasteBytes) return b.estimatedWasteBytes - a.estimatedWasteBytes;
      return b.sizeBytes - a.sizeBytes;
    });

    return {
      rows,
      ranked,
      counts: {
        total: rows.length,
        checked: rows.filter((item) => item.network).length,
        broken: rows.filter((item) => item.broken).length,
        redirect: rows.filter((item) => item.statusLevel === 'warning').length,
        oversized: rows.filter((item) => item.oversized).length,
        unknownSize: rows.filter((item) => !item.sizeBytes).length,
      },
      totalBytes: rows.reduce((sum, item) => sum + item.sizeBytes, 0),
      estimatedWasteBytes: rows.reduce((sum, item) => sum + item.estimatedWasteBytes, 0),
    };
  }

  return {
    normalizeUrl,
    formatFromContentType,
    formatFromUrl,
    detectFormat,
    bytesLabel,
    estimateWaste,
    networkState,
    analyze,
  };
});
