(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PerformanceHints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BELOW_FOLD_MULTIPLIER = 1.5;
  const MIN_EAGER_IMAGE_AREA = 10000;

  function arrayFrom(value) {
    return Array.prototype.slice.call(value || []);
  }

  function attr(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return '';
    const value = node.getAttribute(name);
    return value === null || value === undefined ? '' : String(value);
  }

  function hasAttr(node, name) {
    return Boolean(node && typeof node.hasAttribute === 'function' && node.hasAttribute(name));
  }

  function normalizeUrl(value, baseUrl) {
    if (!value) return '';
    try {
      const url = new URL(value, baseUrl || undefined);
      url.hash = '';
      return url.href;
    } catch (_error) {
      return String(value || '');
    }
  }

  function safeRect(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null;
    try {
      const rect = node.getBoundingClientRect();
      if (!rect) return null;
      const top = Number(rect.top) || 0;
      const left = Number(rect.left) || 0;
      const width = Math.max(0, Number(rect.width) || 0);
      const height = Math.max(0, Number(rect.height) || 0);
      return {
        top,
        left,
        width,
        height,
        right: Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width,
        bottom: Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height,
      };
    } catch (_error) {
      return null;
    }
  }

  function viewportState(rect, viewportHeight) {
    const height = Math.max(1, Number(viewportHeight) || 1);
    if (!rect || rect.width <= 0 || rect.height <= 0) return 'hidden';
    if (rect.bottom <= 0) return 'above';
    if (rect.top < height) return 'above-fold';
    if (rect.top >= height * BELOW_FOLD_MULTIPLIER) return 'below-fold';
    return 'near-fold';
  }

  function computedAspectRatio(node, getComputedStyleFn) {
    if (!node || typeof getComputedStyleFn !== 'function') return '';
    try {
      const style = getComputedStyleFn(node);
      const value = style && style.aspectRatio ? String(style.aspectRatio).trim().toLowerCase() : '';
      return value && value !== 'auto' ? value : '';
    } catch (_error) {
      return '';
    }
  }

  function hasReservedDimensions(node, getComputedStyleFn) {
    const width = Number(attr(node, 'width')) || 0;
    const height = Number(attr(node, 'height')) || 0;
    if (width > 0 && height > 0) return true;
    return Boolean(computedAspectRatio(node, getComputedStyleFn));
  }

  function imageDiagnostics(doc, environment) {
    const env = environment || {};
    const viewportHeight = Math.max(1, Number(env.viewportHeight) || 1);
    const getComputedStyleFn = env.getComputedStyle;
    const images = arrayFrom(doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('img') : []);
    const output = [];

    images.forEach((image, index) => {
      const rect = safeRect(image);
      const zone = viewportState(rect, viewportHeight);
      const loading = attr(image, 'loading').trim().toLowerCase();
      const reserved = hasReservedDimensions(image, getComputedStyleFn);
      const area = rect ? rect.width * rect.height : 0;
      const src = normalizeUrl(image.currentSrc || image.src || attr(image, 'src'), env.baseUrl || '');
      const missingDimensions = !reserved;
      const aboveFoldLazy = zone === 'above-fold' && loading === 'lazy';
      const belowFoldEager = zone === 'below-fold' && loading !== 'lazy' && area >= MIN_EAGER_IMAGE_AREA;

      output.push({
        src,
        loading: loading || 'default',
        zone,
        width: rect ? Math.round(rect.width) : 0,
        height: rect ? Math.round(rect.height) : 0,
        area: Math.round(area),
        reservedDimensions: reserved,
        missingDimensions,
        aboveFoldLazy,
        belowFoldEager,
        ref: { selector: 'img', index },
      });
    });

    return output;
  }

  function layoutShiftRisks(doc, environment) {
    const env = environment || {};
    const getComputedStyleFn = env.getComputedStyle;
    const selectors = [
      ['img', 'Image'],
      ['video', 'Video'],
      ['iframe', 'Iframe'],
    ];
    const risks = [];

    selectors.forEach(([selector, label]) => {
      const nodes = arrayFrom(doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll(selector) : []);
      nodes.forEach((node, index) => {
        const rect = safeRect(node);
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        if (hasReservedDimensions(node, getComputedStyleFn)) return;
        risks.push({
          type: selector,
          label,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          url: normalizeUrl(node.currentSrc || node.src || attr(node, 'src') || attr(node, 'poster'), env.baseUrl || ''),
          reason: `${label} has rendered size but no width/height attributes or CSS aspect-ratio reservation.`,
          ref: { selector, index },
        });
      });
    });

    return risks;
  }

  function lcpCandidates(doc, environment) {
    const env = environment || {};
    const viewportHeight = Math.max(1, Number(env.viewportHeight) || 1);
    const viewportWidth = Math.max(1, Number(env.viewportWidth) || 1);
    const candidates = [];
    const selectors = ['img', 'video', 'h1', 'h2', 'p'];

    selectors.forEach((selector) => {
      const nodes = arrayFrom(doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll(selector) : []);
      nodes.forEach((node, index) => {
        const rect = safeRect(node);
        if (!rect || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= viewportHeight) return;
        const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const visibleArea = visibleWidth * visibleHeight;
        if (!visibleArea) return;

        const tag = String(node.tagName || selector).toLowerCase();
        const isMedia = tag === 'img' || tag === 'video';
        const text = isMedia ? attr(node, 'alt') || attr(node, 'title') : String(node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!isMedia && text.length < 20) return;
        const source = isMedia ? normalizeUrl(node.currentSrc || node.src || attr(node, 'src') || attr(node, 'poster'), env.baseUrl || '') : '';

        candidates.push({
          type: tag,
          visibleArea: Math.round(visibleArea),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: text.slice(0, 160),
          url: source,
          ref: { selector, index },
        });
      });
    });

    return candidates.sort((a, b) => b.visibleArea - a.visibleArea);
  }

  function likelyLcpCandidate(doc, environment) {
    const candidates = lcpCandidates(doc, environment);
    return candidates.length ? candidates[0] : null;
  }

  function relTokens(node) {
    return attr(node, 'rel').toLowerCase().split(/\s+/).filter(Boolean);
  }

  function collectResourceHints(doc, baseUrl) {
    const links = arrayFrom(doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('link[rel]') : []);
    const allowed = new Set(['preload', 'modulepreload', 'preconnect', 'prefetch', 'dns-prefetch']);
    const output = [];

    links.forEach((link) => {
      const rel = relTokens(link).find((token) => allowed.has(token));
      if (!rel) return;
      output.push({
        rel,
        href: normalizeUrl(attr(link, 'href'), baseUrl || ''),
        as: attr(link, 'as').toLowerCase(),
        type: attr(link, 'type'),
        crossorigin: hasAttr(link, 'crossorigin') ? attr(link, 'crossorigin') || 'anonymous' : '',
        media: attr(link, 'media'),
      });
    });

    return output;
  }

  function isBlockingStylesheet(link) {
    if (!link) return false;
    const rel = relTokens(link);
    if (!rel.includes('stylesheet')) return false;
    if (hasAttr(link, 'disabled')) return false;
    const media = attr(link, 'media').trim().toLowerCase();
    if (media === 'print') return false;
    return Boolean(attr(link, 'href'));
  }

  function isBlockingScript(script) {
    if (!script || !attr(script, 'src')) return false;
    if (hasAttr(script, 'async') || hasAttr(script, 'defer')) return false;
    const type = attr(script, 'type').trim().toLowerCase();
    if (type === 'module') return false;
    return true;
  }

  function renderBlockingCandidates(doc, baseUrl) {
    const head = doc && doc.head ? doc.head : null;
    if (!head || typeof head.querySelectorAll !== 'function') return [];
    const output = [];
    arrayFrom(head.querySelectorAll('link[rel],script[src]')).forEach((node) => {
      const tag = String(node.tagName || '').toLowerCase();
      if (tag === 'link' && isBlockingStylesheet(node)) {
        output.push({ type: 'stylesheet', url: normalizeUrl(attr(node, 'href'), baseUrl || ''), reason: 'Stylesheet is a render-blocking candidate.' });
      } else if (tag === 'script' && isBlockingScript(node)) {
        output.push({ type: 'script', url: normalizeUrl(attr(node, 'src'), baseUrl || ''), reason: 'Head script has no async/defer/module hint.' });
      }
    });
    return output;
  }

  function fontHints(resourceHints, performanceReport) {
    const hints = Array.isArray(resourceHints) ? resourceHints : [];
    const resources = performanceReport && Array.isArray(performanceReport.resources) ? performanceReport.resources : [];
    const preloads = hints.filter((item) => item.rel === 'preload' && item.as === 'font');
    const preloadUrls = new Set(preloads.map((item) => normalizeUrl(item.href)).filter(Boolean));
    const fonts = resources.filter((item) => item && item.kind === 'font').map((item) => ({
      url: normalizeUrl(item.url),
      duration: Number(item.duration) || 0,
      sizeBytes: Number(item.sizeBytes) || 0,
      thirdParty: Boolean(item.thirdParty),
      preloaded: preloadUrls.has(normalizeUrl(item.url)),
    }));
    const missingPreload = fonts.filter((item) => !item.preloaded);
    const preloadWithoutCrossorigin = preloads.filter((item) => !item.crossorigin);
    return { preloads, fonts, missingPreload, preloadWithoutCrossorigin };
  }

  function buildIssues(images, clsRisks, blocking, fonts) {
    const issues = [];
    const missingDimensions = images.filter((item) => item.missingDimensions);
    const aboveFoldLazy = images.filter((item) => item.aboveFoldLazy);
    const belowFoldEager = images.filter((item) => item.belowFoldEager);

    if (missingDimensions.length) issues.push({ severity: 'warning', code: 'image-dimensions', title: 'Images missing reserved dimensions', message: `${missingDimensions.length} image(s) have no width/height attributes or CSS aspect-ratio reservation.`, refs: missingDimensions.map((item) => item.ref) });
    if (clsRisks.length) issues.push({ severity: 'warning', code: 'cls-risk', title: 'Potential layout-shift elements', message: `${clsRisks.length} rendered image/video/iframe element(s) do not reserve their aspect ratio.`, refs: clsRisks.map((item) => item.ref) });
    if (aboveFoldLazy.length) issues.push({ severity: 'warning', code: 'above-fold-lazy', title: 'Above-the-fold images are lazy-loaded', message: `${aboveFoldLazy.length} visible initial-viewport image(s) use loading="lazy" and may delay LCP.`, refs: aboveFoldLazy.map((item) => item.ref) });
    if (belowFoldEager.length) issues.push({ severity: 'warning', code: 'below-fold-eager', title: 'Large below-the-fold images load eagerly', message: `${belowFoldEager.length} large image(s) far below the initial viewport do not use lazy loading.`, refs: belowFoldEager.map((item) => item.ref) });
    if (blocking.length) issues.push({ severity: 'warning', code: 'render-blocking', title: 'Render-blocking candidates', message: `${blocking.length} head stylesheet/script resource(s) may block initial rendering.` });
    if (fonts.preloadWithoutCrossorigin.length) issues.push({ severity: 'warning', code: 'font-preload-crossorigin', title: 'Font preload missing crossorigin', message: `${fonts.preloadWithoutCrossorigin.length} font preload(s) omit the crossorigin attribute and may not be reused by the font request.` });

    return issues;
  }

  function collect(doc, environment, performanceReport) {
    const env = environment || {};
    const images = imageDiagnostics(doc, env);
    const clsRisks = layoutShiftRisks(doc, env);
    const lcpCandidate = likelyLcpCandidate(doc, env);
    const resourceHints = collectResourceHints(doc, env.baseUrl || '');
    const blocking = renderBlockingCandidates(doc, env.baseUrl || '');
    const fonts = fontHints(resourceHints, performanceReport || null);
    const issues = buildIssues(images, clsRisks, blocking, fonts);

    return {
      lcpCandidate,
      images,
      clsRisks,
      resourceHints,
      renderBlocking: blocking,
      fonts,
      issues,
      summary: {
        missingImageDimensions: images.filter((item) => item.missingDimensions).length,
        aboveFoldLazyImages: images.filter((item) => item.aboveFoldLazy).length,
        belowFoldEagerImages: images.filter((item) => item.belowFoldEager).length,
        clsRiskCount: clsRisks.length,
        resourceHintCount: resourceHints.length,
        renderBlockingCount: blocking.length,
        fontCount: fonts.fonts.length,
        fontPreloadCount: fonts.preloads.length,
      },
    };
  }

  return {
    BELOW_FOLD_MULTIPLIER,
    MIN_EAGER_IMAGE_AREA,
    normalizeUrl,
    safeRect,
    viewportState,
    hasReservedDimensions,
    imageDiagnostics,
    layoutShiftRisks,
    lcpCandidates,
    likelyLcpCandidate,
    collectResourceHints,
    isBlockingStylesheet,
    isBlockingScript,
    renderBlockingCandidates,
    fontHints,
    buildIssues,
    collect,
  };
});
