(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ContentAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NODE_LIMIT = 25000;
  const THIN_WORD_THRESHOLD = 150;
  const SAMPLE_LIMIT = 10;
  const EXCLUDED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function wordCount(value) {
    const text = normalizeText(value);
    if (!text) return 0;
    try {
      const matches = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
      return matches ? matches.length : 0;
    } catch (_error) {
      return text.split(/\s+/).filter(Boolean).length;
    }
  }

  function attr(element, name) {
    if (!element || typeof element.getAttribute !== 'function') return '';
    return element.getAttribute(name) || '';
  }

  function styleValue(style, key) {
    if (!style) return '';
    return String(style[key] || '').toLowerCase().trim();
  }

  function hiddenReason(element, getComputedStyle) {
    if (!element || Number(element.nodeType) !== 1) return '';
    if (element.hidden === true || (typeof element.hasAttribute === 'function' && element.hasAttribute('hidden'))) return 'hidden attribute';
    if (attr(element, 'aria-hidden').toLowerCase() === 'true') return 'aria-hidden';

    let style = element.style || null;
    if (typeof getComputedStyle === 'function') {
      try { style = getComputedStyle(element) || style; } catch (_error) { /* use inline style */ }
    }
    if (styleValue(style, 'display') === 'none') return 'display:none';
    if (styleValue(style, 'visibility') === 'hidden' || styleValue(style, 'visibility') === 'collapse') return 'visibility:hidden';
    if (styleValue(style, 'contentVisibility') === 'hidden') return 'content-visibility:hidden';
    return '';
  }

  function elementLabel(element) {
    if (!element) return 'element';
    const tag = String(element.tagName || 'element').toLowerCase();
    const id = attr(element, 'id');
    const classes = normalizeText(attr(element, 'class')).split(/\s+/).filter(Boolean).slice(0, 2);
    return `${tag}${id ? `#${id}` : ''}${classes.length ? `.${classes.join('.')}` : ''}`;
  }

  function childNodes(node) {
    return Array.prototype.slice.call(node && node.childNodes ? node.childNodes : []);
  }

  function scanText(rootNode, options) {
    const opts = options || {};
    const limit = Math.max(100, Number(opts.nodeLimit) || NODE_LIMIT);
    const getComputedStyle = typeof opts.getComputedStyle === 'function' ? opts.getComputedStyle : null;
    const detectVisibility = opts.detectVisibility !== false;
    const stack = [{ node: rootNode, hidden: false }];
    let visitedNodes = 0;
    let allWords = 0;
    let visibleWords = 0;
    let hiddenWords = 0;
    let hiddenRootCount = 0;
    const hiddenReasons = {};
    const hiddenSamples = [];

    while (stack.length && visitedNodes < limit) {
      const current = stack.pop();
      const node = current && current.node;
      if (!node) continue;
      visitedNodes += 1;
      const nodeType = Number(node.nodeType) || 0;

      if (nodeType === 3) {
        const words = wordCount(node.nodeValue !== undefined ? node.nodeValue : node.textContent || '');
        allWords += words;
        if (current.hidden) hiddenWords += words;
        else visibleWords += words;
        continue;
      }

      if (nodeType !== 1 && nodeType !== 9 && nodeType !== 11) continue;
      if (nodeType === 1 && EXCLUDED_TAGS.has(String(node.tagName || '').toUpperCase())) continue;

      let hidden = current.hidden;
      if (!hidden && detectVisibility && nodeType === 1) {
        const reason = hiddenReason(node, getComputedStyle);
        if (reason) {
          hidden = true;
          hiddenRootCount += 1;
          hiddenReasons[reason] = (hiddenReasons[reason] || 0) + 1;
          if (hiddenSamples.length < SAMPLE_LIMIT) hiddenSamples.push({ element: elementLabel(node), reason });
        }
      }

      const children = childNodes(node);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: children[index], hidden });
      }
    }

    return {
      visibleWords,
      allWords,
      hiddenWords,
      hiddenRootCount,
      hiddenReasons,
      hiddenSamples,
      visitedNodes,
      nodeLimit: limit,
      truncated: stack.length > 0,
    };
  }

  function normalizeLanguage(value) {
    return normalizeText(value).replace(/_/g, '-').toLowerCase();
  }

  function primaryLanguage(value) {
    const normalized = normalizeLanguage(value);
    return normalized ? normalized.split('-')[0] : '';
  }

  function validLanguageTag(value) {
    const normalized = normalizeLanguage(value);
    if (!normalized) return false;
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized);
  }

  function firstHeaderLanguage(responseMeta) {
    const values = responseMeta && Array.isArray(responseMeta.contentLanguage) ? responseMeta.contentLanguage : [];
    const first = values.length ? String(values[0] || '') : '';
    return normalizeLanguage(first.split(',')[0].split(';')[0]);
  }

  function selfHreflangLanguages(facts) {
    const pageUrl = String(facts && facts.url || '');
    let normalizedPage = pageUrl;
    try { const u = new URL(pageUrl); u.hash = ''; normalizedPage = u.href; } catch (_error) {}
    return (facts && Array.isArray(facts.hreflang) ? facts.hreflang : [])
      .filter((item) => {
        try { const u = new URL(item.href); u.hash = ''; return u.href === normalizedPage; }
        catch (_error) { return String(item && item.href || '') === normalizedPage; }
      })
      .map((item) => normalizeLanguage(item.lang))
      .filter((item) => item && item !== 'x-default');
  }

  function analyzeLanguage(facts, responseMeta) {
    const htmlLang = normalizeLanguage(facts && facts.lang || '');
    const headerLang = firstHeaderLanguage(responseMeta);
    const selfHreflang = selfHreflangLanguages(facts || {});
    const issues = [];

    if (!htmlLang) issues.push({ severity: 'warning', code: 'missing-html-lang', message: 'The HTML lang attribute is missing.' });
    else if (!validLanguageTag(htmlLang)) issues.push({ severity: 'warning', code: 'invalid-html-lang', message: `HTML lang “${htmlLang}” does not look like a valid BCP 47 language tag.` });

    if (htmlLang && headerLang && primaryLanguage(htmlLang) !== primaryLanguage(headerLang)) {
      issues.push({ severity: 'warning', code: 'content-language-mismatch', message: `HTML lang (${htmlLang}) and Content-Language (${headerLang}) use different primary languages.` });
    }

    if (htmlLang && selfHreflang.length && !selfHreflang.some((value) => primaryLanguage(value) === primaryLanguage(htmlLang))) {
      issues.push({ severity: 'warning', code: 'self-hreflang-mismatch', message: `Self-referencing hreflang (${selfHreflang.join(', ')}) does not match HTML lang (${htmlLang}).` });
    }

    return { htmlLang, headerLang, selfHreflang, issues };
  }

  function analyzeHeadings(headings) {
    const items = Array.isArray(headings) ? headings : [];
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let empty = 0;
    const jumps = [];
    items.forEach((item, index) => {
      const level = Number(item && item.level) || 0;
      if (level >= 1 && level <= 6) counts[level] += 1;
      if (!normalizeText(item && item.text || '')) empty += 1;
      if (index > 0) {
        const previous = Number(items[index - 1] && items[index - 1].level) || 0;
        if (previous && level > previous + 1) jumps.push({ from: previous, to: level, index });
      }
    });
    const issues = [];
    if (!counts[1]) issues.push({ severity: 'warning', code: 'missing-h1', message: 'No H1 heading was found.' });
    if (counts[1] > 1) issues.push({ severity: 'warning', code: 'multiple-h1', message: `${counts[1]} H1 headings were found.` });
    if (empty) issues.push({ severity: 'warning', code: 'empty-headings', message: `${empty} empty heading${empty === 1 ? '' : 's'} found.` });
    if (jumps.length) issues.push({ severity: 'warning', code: 'heading-jumps', message: `${jumps.length} skipped heading-level transition${jumps.length === 1 ? '' : 's'} found.` });
    return { total: items.length, counts, empty, jumps, issues };
  }

  function collect(doc, options) {
    const opts = options || {};
    const body = doc && doc.body ? doc.body : null;
    const text = body ? scanText(body, {
      getComputedStyle: opts.getComputedStyle,
      nodeLimit: opts.nodeLimit,
      detectVisibility: opts.detectVisibility !== false,
    }) : {
      visibleWords: 0, allWords: 0, hiddenWords: 0, hiddenRootCount: 0,
      hiddenReasons: {}, hiddenSamples: [], visitedNodes: 0,
      nodeLimit: Number(opts.nodeLimit) || NODE_LIMIT, truncated: false,
    };
    const facts = opts.facts || {};
    const language = analyzeLanguage(facts, opts.responseMeta || null);
    const headings = analyzeHeadings(facts.headings || []);
    const thin = text.visibleWords < (Number(opts.thinWordThreshold) || THIN_WORD_THRESHOLD);

    return {
      text,
      thinContent: {
        thin,
        threshold: Number(opts.thinWordThreshold) || THIN_WORD_THRESHOLD,
        message: thin ? `Visible text is below the ${Number(opts.thinWordThreshold) || THIN_WORD_THRESHOLD}-word heuristic threshold.` : '',
      },
      language,
      headings,
    };
  }

  return {
    NODE_LIMIT,
    THIN_WORD_THRESHOLD,
    SAMPLE_LIMIT,
    EXCLUDED_TAGS,
    normalizeText,
    wordCount,
    hiddenReason,
    elementLabel,
    scanText,
    normalizeLanguage,
    primaryLanguage,
    validLanguageTag,
    firstHeaderLanguage,
    selfHreflangLanguages,
    analyzeLanguage,
    analyzeHeadings,
    collect,
  };
});
