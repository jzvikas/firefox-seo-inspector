(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PageType = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = Object.freeze({
    HOMEPAGE: 'homepage',
    PRODUCT: 'product',
    CATEGORY: 'category',
    ARTICLE: 'article',
    SEARCH: 'search',
    GENERIC: 'generic',
    ERROR: 'error',
    FACETED: 'faceted',
    PAGINATION: 'pagination',
  });

  const LABELS = Object.freeze({
    homepage: 'Homepage',
    product: 'Product',
    category: 'Category / listing',
    article: 'Article / blog',
    search: 'Search results',
    generic: 'CMS / generic content',
    error: '404 / error page',
    faceted: 'Faceted / filtered',
    pagination: 'Pagination',
  });

  const ARTICLE_SCHEMA = new Set(['article', 'blogposting', 'newsarticle', 'techarticle', 'scholarlyarticle', 'report']);
  const SEARCH_PARAMS = new Set(['q', 'query', 'search', 'keyword', 'keywords', 'term']);
  const PAGINATION_PARAMS = new Set(['page', 'paged', 'pageno', 'page_no', 'page-number', 'pagenumber', 'offset']);
  const FILTER_PARAMS = new Set(['filter', 'filters', 'facet', 'facets', 'brand', 'color', 'colour', 'size', 'price', 'min_price', 'max_price', 'sort', 'order']);

  function clean(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch (_error) {
      return null;
    }
  }

  function schemaTypeCounts(facts) {
    const counts = {};
    for (const schema of Array.isArray(facts && facts.schemas) ? facts.schemas : []) {
      if (!schema || !schema.valid) continue;
      for (const type of Array.isArray(schema.types) ? schema.types : []) {
        const key = clean(type).toLowerCase();
        if (key) counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }

  function hasSchema(counts, values) {
    return values.some((value) => Boolean(counts[String(value).toLowerCase()]));
  }

  function numericParamIsPage(name, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    return name === 'offset' ? number > 0 : number > 1;
  }

  function urlSignals(value) {
    const url = safeUrl(value);
    if (!url) return {
      valid: false,
      homepagePath: false,
      searchPath: false,
      searchParams: [],
      filterParams: [],
      paginationParams: [],
      paginationPath: false,
    };

    const path = decodeURIComponent(url.pathname || '/').toLowerCase();
    const searchParams = [];
    const filterParams = [];
    const paginationParams = [];
    for (const [rawName, rawValue] of url.searchParams.entries()) {
      const name = rawName.toLowerCase();
      const valueText = clean(rawValue);
      if (SEARCH_PARAMS.has(name) && valueText) searchParams.push(name);
      if (FILTER_PARAMS.has(name) || name.startsWith('filter_') || name.startsWith('filter[') || name.startsWith('facet_') || name.startsWith('facet[')) {
        filterParams.push(name);
      }
      if (PAGINATION_PARAMS.has(name) && numericParamIsPage(name, rawValue)) paginationParams.push(name);
    }

    return {
      valid: true,
      homepagePath: path === '/' || path === '',
      searchPath: /(?:^|\/)(?:search|search-results|results|find)(?:\/|$)/.test(path),
      searchParams: Array.from(new Set(searchParams)),
      filterParams: Array.from(new Set(filterParams)),
      paginationParams: Array.from(new Set(paginationParams)),
      paginationPath: /(?:^|\/)(?:page|paged)\/\d+(?:\/|$)/.test(path),
    };
  }

  function confidence(score, forced) {
    if (forced === 'high' || score >= 7) return 'high';
    if (forced === 'medium' || score >= 4) return 'medium';
    return 'low';
  }

  function addEvidence(list, type, signal, weight, detail) {
    list.push({ type, signal, weight, detail: clean(detail) });
  }

  function detect(facts, responseMeta) {
    const source = facts || {};
    const response = responseMeta || {};
    const url = urlSignals(source.url || response.url || '');
    const schema = schemaTypeCounts(source);
    const signals = source.pageSignals || {};
    const evidence = [];
    const scores = {
      product: 0,
      category: 0,
      article: 0,
      search: 0,
    };

    const status = Number(response.statusCode) || 0;
    if (status >= 400) {
      addEvidence(evidence, TYPES.ERROR, 'http-status', 10, `HTTP ${status}`);
      return finalize(TYPES.ERROR, 10, 'high', url, evidence, scores, source);
    }

    const searchSchema = hasSchema(schema, ['searchresultspage']);
    const searchByUrl = url.searchPath || url.searchParams.length > 0;
    if (searchSchema) {
      scores.search += 8;
      addEvidence(evidence, TYPES.SEARCH, 'schema', 8, 'SearchResultsPage structured data');
    }
    if (url.searchPath) {
      scores.search += 5;
      addEvidence(evidence, TYPES.SEARCH, 'url-path', 5, 'Search-like URL path');
    }
    if (url.searchParams.length) {
      scores.search += 4;
      addEvidence(evidence, TYPES.SEARCH, 'url-parameter', 4, `Search parameter: ${url.searchParams.join(', ')}`);
    }
    if (Number(signals.searchControls) > 0) {
      scores.search += 1;
      addEvidence(evidence, TYPES.SEARCH, 'dom', 1, `${Number(signals.searchControls)} search control(s)`);
    }

    if (url.homepagePath && !searchByUrl && !url.filterParams.length && !url.paginationParams.length && !url.paginationPath) {
      addEvidence(evidence, TYPES.HOMEPAGE, 'url', 9, 'Root URL path');
      return finalize(TYPES.HOMEPAGE, 9, 'high', url, evidence, scores, source);
    }

    if (schema.product) {
      scores.product += 7;
      addEvidence(evidence, TYPES.PRODUCT, 'schema', 7, 'Product structured data');
    }
    if (clean(source.openGraph && source.openGraph['og:type']).toLowerCase() === 'product') {
      scores.product += 5;
      addEvidence(evidence, TYPES.PRODUCT, 'open-graph', 5, 'og:type=product');
    }
    if (Number(signals.productMicrodata) > 0) {
      scores.product += 4;
      addEvidence(evidence, TYPES.PRODUCT, 'microdata', 4, 'Product microdata');
    }

    const articleTypes = Array.from(ARTICLE_SCHEMA).filter((type) => schema[type]);
    if (articleTypes.length) {
      scores.article += 7;
      addEvidence(evidence, TYPES.ARTICLE, 'schema', 7, `Article structured data: ${articleTypes.join(', ')}`);
    }
    if (clean(source.openGraph && source.openGraph['og:type']).toLowerCase() === 'article') {
      scores.article += 5;
      addEvidence(evidence, TYPES.ARTICLE, 'open-graph', 5, 'og:type=article');
    }
    if (Number(signals.articleElements) === 1 && Number(source.textWordCount) >= 300) {
      scores.article += 4;
      addEvidence(evidence, TYPES.ARTICLE, 'semantic-html', 4, 'Single article element with substantial text');
    }

    if (schema.collectionpage) {
      scores.category += 7;
      addEvidence(evidence, TYPES.CATEGORY, 'schema', 7, 'CollectionPage structured data');
    }
    if (schema.itemlist) {
      scores.category += 6;
      addEvidence(evidence, TYPES.CATEGORY, 'schema', 6, 'ItemList structured data');
    }
    if (Number(signals.itemListMicrodata) > 0) {
      scores.category += 4;
      addEvidence(evidence, TYPES.CATEGORY, 'microdata', 4, 'ItemList microdata');
    }
    if ((schema.product || 0) >= 3) {
      scores.category += 3;
      addEvidence(evidence, TYPES.CATEGORY, 'schema-density', 3, `${schema.product} Product schema blocks`);
    }

    let primary = TYPES.GENERIC;
    let primaryScore = 0;
    // Explicit search schema/path/query is a stronger page-purpose signal than
    // Product/Article entities that may legitimately appear inside result cards.
    if ((searchSchema || searchByUrl) && scores.search >= 4) {
      primary = TYPES.SEARCH;
      primaryScore = scores.search;
    } else {
      const priority = [TYPES.PRODUCT, TYPES.ARTICLE, TYPES.CATEGORY];
      for (const type of priority) {
        const score = scores[type] || 0;
        if (score > primaryScore) {
          primary = type;
          primaryScore = score;
        }
      }
    }
    if (primaryScore < 4) {
      primary = TYPES.GENERIC;
      primaryScore = 1;
      addEvidence(evidence, TYPES.GENERIC, 'fallback', 1, 'No stronger platform-neutral page-type signal');
    }

    return finalize(primary, primaryScore, null, url, evidence, scores, source);
  }

  function finalize(primary, score, forcedConfidence, url, evidence, scores, facts) {
    const traits = {
      faceted: Boolean(url.filterParams && url.filterParams.length),
      pagination: Boolean((url.paginationParams && url.paginationParams.length) || url.paginationPath || (facts.pageSignals && (facts.pageSignals.relNext || facts.pageSignals.relPrev))),
    };
    if (traits.faceted) addEvidence(evidence, TYPES.FACETED, 'url-parameter', 4, `Filter/sort parameter: ${url.filterParams.join(', ')}`);
    if (traits.pagination) {
      const detail = url.paginationParams && url.paginationParams.length
        ? `Pagination parameter: ${url.paginationParams.join(', ')}`
        : url.paginationPath
          ? 'Pagination URL path'
          : 'rel=next/prev pagination signal';
      addEvidence(evidence, TYPES.PAGINATION, 'pagination', 4, detail);
    }
    const detected = [primary];
    if (traits.faceted && primary !== TYPES.FACETED) detected.push(TYPES.FACETED);
    if (traits.pagination && primary !== TYPES.PAGINATION) detected.push(TYPES.PAGINATION);
    const relevant = evidence
      .filter((item) => item.type === primary || (traits.faceted && item.type === TYPES.FACETED) || (traits.pagination && item.type === TYPES.PAGINATION))
      .sort((a, b) => b.weight - a.weight || a.signal.localeCompare(b.signal))
      .slice(0, 8);
    return {
      primary,
      label: LABELS[primary] || primary,
      confidence: confidence(score, forcedConfidence),
      score,
      traits,
      detected,
      evidence: relevant,
      candidateScores: {
        search: scores.search || 0,
        product: scores.product || 0,
        article: scores.article || 0,
        category: scores.category || 0,
      },
    };
  }

  function display(result) {
    const value = result || {};
    const parts = [LABELS[value.primary] || value.label || 'Unknown'];
    if (value.traits && value.traits.faceted) parts.push(LABELS.faceted);
    if (value.traits && value.traits.pagination) parts.push(LABELS.pagination);
    return parts.join(' · ');
  }

  return { TYPES, LABELS, detect, display, urlSignals, schemaTypeCounts };
});
