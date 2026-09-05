(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SerpPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROFILES = Object.freeze({
    desktop: Object.freeze({
      titleMaxPx: 580,
      descriptionLinePx: 600,
      descriptionLines: 2,
      titleFontPx: 20,
      descriptionFontPx: 14,
    }),
    mobile: Object.freeze({
      titleMaxPx: 560,
      descriptionLinePx: 360,
      descriptionLines: 3,
      titleFontPx: 18,
      descriptionFontPx: 13,
    }),
  });

  function safeText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function characterWeight(char) {
    if (!char) return 0;
    if (/\s/.test(char)) return 0.32;
    if (/[ilI1|!.,:'`]/.test(char)) return 0.28;
    if (/[mwMW@%&]/.test(char)) return 0.9;
    if (/[A-ZĄČĘĖĮŠŲŪŽ]/.test(char)) return 0.66;
    if (/[0-9]/.test(char)) return 0.56;
    if (/[-_\/\\()[\]{}]/.test(char)) return 0.42;
    return 0.54;
  }

  function estimateTextWidth(text, fontPx) {
    const value = safeText(text);
    const size = Number(fontPx) || 16;
    let units = 0;
    for (const char of value) units += characterWeight(char);
    return Math.round(units * size);
  }

  function titleMetrics(title, device) {
    const profile = PROFILES[device] || PROFILES.desktop;
    const text = safeText(title);
    const widthPx = estimateTextWidth(text, profile.titleFontPx);
    return {
      text,
      chars: text.length,
      widthPx,
      maxPx: profile.titleMaxPx,
      overflowPx: Math.max(0, widthPx - profile.titleMaxPx),
      truncated: widthPx > profile.titleMaxPx,
      missing: !text,
    };
  }

  function descriptionMetrics(description, device) {
    const profile = PROFILES[device] || PROFILES.desktop;
    const text = safeText(description);
    const widthPx = estimateTextWidth(text, profile.descriptionFontPx);
    const capacityPx = profile.descriptionLinePx * profile.descriptionLines;
    return {
      text,
      chars: text.length,
      widthPx,
      linePx: profile.descriptionLinePx,
      lines: profile.descriptionLines,
      capacityPx,
      estimatedLines: text ? Math.max(1, Math.ceil(widthPx / profile.descriptionLinePx)) : 0,
      overflowPx: Math.max(0, widthPx - capacityPx),
      truncated: widthPx > capacityPx,
      missing: !text,
    };
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = '';
      return url;
    } catch (_error) {
      return null;
    }
  }

  function urlPresentation(value) {
    const url = normalizeUrl(value);
    if (!url) return { host: '', path: '', breadcrumb: '' };
    const parts = url.pathname.split('/').filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch (_error) { return part; }
    });
    return {
      host: url.hostname,
      path: url.pathname + url.search,
      breadcrumb: parts.length ? `${url.hostname} › ${parts.slice(0, 3).join(' › ')}` : url.hostname,
    };
  }

  function analyze(input, device) {
    const source = input || {};
    const mode = device === 'mobile' ? 'mobile' : 'desktop';
    const title = titleMetrics(source.title, mode);
    const description = descriptionMetrics(source.description, mode);
    const url = urlPresentation(source.url || source.canonical || '');
    const warnings = [];
    if (title.missing) warnings.push({ code: 'title-missing', label: 'Title is missing.' });
    else if (title.truncated) warnings.push({ code: 'title-truncated', label: `Title is approximately ${title.overflowPx}px over the preview width.` });
    if (description.missing) warnings.push({ code: 'description-missing', label: 'Meta description is missing.' });
    else if (description.truncated) warnings.push({ code: 'description-truncated', label: `Description is likely to exceed the estimated ${description.lines}-line preview.` });
    return { device: mode, profile: PROFILES[mode], title, description, url, warnings };
  }

  return {
    PROFILES,
    safeText,
    characterWeight,
    estimateTextWidth,
    titleMetrics,
    descriptionMetrics,
    urlPresentation,
    analyze,
  };
});
