(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CategoryPageAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FILTER_PARAMS = new Set([
    'filter', 'filters', 'facet', 'facets', 'brand', 'manufacturer', 'color', 'colour', 'size',
    'material', 'attribute', 'attributes', 'option', 'options', 'min_price', 'max_price', 'price_min',
    'price_max', 'availability', 'stock', 'category', 'tag',
  ]);
  const SORT_PARAMS = new Set(['sort', 'order', 'orderby', 'order_by', 'dir', 'direction']);
  const PAGE_PARAMS = new Set(['page', 'p', 'pg', 'pageno', 'page_no', 'offset', 'start']);
  const TRACKING_PARAMS = new Set(['gclid', 'dclid', 'fbclid', 'msclkid', 'yclid', 'mc_cid', 'mc_eid']);
  const SESSION_PARAMS = new Set(['sid', 'session', 'sessionid', 'session_id', 'phpsessid', 'jsessionid']);

  function clean(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      url.hash = '';
      return url;
    } catch (_error) {
      return null;
    }
  }

  function comparableUrl(value) {
    const url = safeUrl(value);
    if (!url) return '';
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
    return url.href;
  }

  function sameUrl(left, right) {
    const a = comparableUrl(left);
    return Boolean(a && a === comparableUrl(right));
  }

  function classifyParam(name) {
    const value = clean(name).toLowerCase();
    if (!value) return 'other';
    if (value.startsWith('utm_') || TRACKING_PARAMS.has(value)) return 'tracking';
    if (SESSION_PARAMS.has(value) || value.includes('session')) return 'session';
    if (PAGE_PARAMS.has(value) || /^page\d*$/.test(value)) return 'pagination';
    if (SORT_PARAMS.has(value)) return 'sort';
    if (FILTER_PARAMS.has(value) || /^(filter|facet|attr|attribute|option)[_.-]/.test(value)) return 'filter';
    return 'other';
  }

  function classifyUrlParams(value) {
    const url = safeUrl(value);
    if (!url) return [];
    const output = [];
    for (const [name, rawValue] of url.searchParams.entries()) {
      if (!clean(rawValue)) continue;
      output.push({ name, value: clean(rawValue), kind: classifyParam(name) });
    }
    return output;
  }

  function paginationParam(value) {
    const url = safeUrl(value);
    if (!url) return null;
    for (const [name, raw] of url.searchParams.entries()) {
      if (classifyParam(name) !== 'pagination') continue;
      const number = Number.parseInt(String(raw || ''), 10);
      if (Number.isInteger(number) && number >= 1) return { name, number };
      if ((name.toLowerCase() === 'offset' || name.toLowerCase() === 'start') && Number.isInteger(number) && number > 0) return { name, number: null };
    }
    const pathMatch = url.pathname.match(/(?:^|\/)(?:page|p)\/(\d+)(?:\/|$)/i);
    if (pathMatch) return { name: 'path', number: Number.parseInt(pathMatch[1], 10) || null };
    return null;
  }

  function stripPagination(value) {
    const url = safeUrl(value);
    if (!url) return '';
    for (const name of Array.from(url.searchParams.keys())) {
      if (classifyParam(name) === 'pagination') url.searchParams.delete(name);
    }
    url.pathname = url.pathname.replace(/(?:^|\/)(?:page|p)\/\d+(?=\/|$)/ig, '').replace(/\/+/g, '/');
    return url.href;
  }

  function stripNonContentParams(value) {
    const url = safeUrl(value);
    if (!url) return '';
    for (const name of Array.from(url.searchParams.keys())) {
      const kind = classifyParam(name);
      if (kind === 'filter' || kind === 'sort' || kind === 'tracking' || kind === 'session' || kind === 'pagination') url.searchParams.delete(name);
    }
    return url.href;
  }

  function schemaTypes(node) {
    if (!node || typeof node !== 'object') return [];
    const raw = node['@type'];
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return values.map((item) => clean(item).toLowerCase()).filter(Boolean);
  }

  function walk(value, visitor, state) {
    const meta = state || { seen: new Set(), count: 0, max: 5000 };
    if (!value || typeof value !== 'object' || meta.count >= meta.max || meta.seen.has(value)) return;
    meta.seen.add(value);
    meta.count += 1;
    visitor(value);
    if (Array.isArray(value)) value.forEach((item) => walk(item, visitor, meta));
    else Object.keys(value).forEach((key) => { if (key !== '@context') walk(value[key], visitor, meta); });
  }

  function itemListData(facts) {
    const urls = new Set();
    let itemListCount = 0;
    for (const schema of Array.isArray(facts && facts.schemas) ? facts.schemas : []) {
      if (!schema || !schema.valid || !schema.parsed) continue;
      walk(schema.parsed, (node) => {
        if (!node || Array.isArray(node) || typeof node !== 'object') return;
        const types = schemaTypes(node);
        if (types.includes('itemlist')) itemListCount += 1;
        if (types.includes('product')) {
          const productUrl = safeUrl(node.url || node['@id']);
          if (productUrl) urls.add(productUrl.href);
        }
        if (types.includes('listitem')) {
          const item = node.item && typeof node.item === 'object' ? node.item : null;
          const candidate = safeUrl((item && (item.url || item['@id'])) || node.url || node['@id']);
          if (candidate) urls.add(candidate.href);
        }
      });
    }
    const signals = facts && facts.pageSignals ? facts.pageSignals : {};
    for (const value of Array.isArray(signals.listingLinkUrls) ? signals.listingLinkUrls : []) {
      const url = safeUrl(value);
      if (url) urls.add(url.href);
    }
    return {
      itemListCount,
      microdataCount: Number(signals.itemListMicrodata) || 0,
      productMicrodataCount: Number(signals.productMicrodata) || 0,
      urls: Array.from(urls).slice(0, 500),
    };
  }

  function hasNoindex(facts) {
    return (Array.isArray(facts && facts.robots) ? facts.robots : []).some((item) => /(?:^|[,\s])noindex(?:$|[,\s])/i.test(String(item && item.content || '')));
  }

  function issue(list, id, severity, title, message, refs) {
    list.push({ id, severity, title, message, refs: Array.isArray(refs) ? refs.slice(0, 50) : [] });
  }

  function internalParameterizedLinks(facts) {
    const links = Array.isArray(facts && facts.links) ? facts.links : [];
    const rows = [];
    for (const link of links) {
      if (!link || !link.internal || link.kind !== 'http') continue;
      const params = classifyUrlParams(link.href);
      const risky = params.filter((item) => item.kind === 'filter' || item.kind === 'sort' || item.kind === 'tracking' || item.kind === 'session');
      if (!risky.length) continue;
      rows.push({ href: link.href, label: link.label || '', params: risky, ref: link.ref || null });
    }
    return rows.slice(0, 500);
  }

  function paginationLinks(facts) {
    const links = Array.isArray(facts && facts.links) ? facts.links : [];
    const current = safeUrl(facts && facts.url);
    const output = [];
    for (const link of links) {
      if (!link || !link.internal || link.kind !== 'http') continue;
      const page = paginationParam(link.href);
      const label = clean(link.label).toLowerCase();
      const looksLikePaginationLabel = /^(?:next|prev|previous|older|newer|\d+|[‹›«»←→])$/.test(label);
      if (!page && !looksLikePaginationLabel) continue;
      const target = safeUrl(link.href);
      if (!target || (current && target.origin !== current.origin)) continue;
      output.push({ href: target.href, label: link.label || '', page: page ? page.number : null, ref: link.ref || null });
    }
    return output.slice(0, 250);
  }

  function inspect(facts, pageType) {
    const source = facts || {};
    const signals = source.pageSignals || {};
    const listing = itemListData(source);
    const isCategoryType = Boolean(pageType && pageType.primary === 'category');
    const applicable = isCategoryType || listing.itemListCount > 0 || listing.microdataCount > 0;
    if (!applicable) {
      return {
        applicable: false,
        reason: 'No category/listing page-type signal or ItemList evidence was detected.',
        issues: [],
        summary: { critical: 0, warning: 0, info: 0 },
      };
    }

    const issues = [];
    const currentUrl = clean(source.url);
    const canonicalCount = Number(source.canonical && source.canonical.count) || 0;
    const canonical = clean(source.canonical && source.canonical.href);
    const canonicalSelf = canonical ? sameUrl(currentUrl, canonical) : false;
    const current = safeUrl(currentUrl);
    const canonicalUrl = safeUrl(canonical);
    const params = classifyUrlParams(currentUrl);
    const filterParams = params.filter((item) => item.kind === 'filter');
    const sortParams = params.filter((item) => item.kind === 'sort');
    const trackingParams = params.filter((item) => item.kind === 'tracking');
    const sessionParams = params.filter((item) => item.kind === 'session');
    const currentPagination = paginationParam(currentUrl);
    const pageNumber = currentPagination && currentPagination.number ? currentPagination.number : 1;
    const parameterizedLinks = internalParameterizedLinks(source);
    const pagerLinks = paginationLinks(source);
    const relNext = clean(signals.relNext);
    const relPrev = clean(signals.relPrev);
    const wordCount = Number(source.textWordCount) || 0;
    const itemCount = Math.max(listing.urls.length, listing.productMicrodataCount);
    const faceted = Boolean(pageType && pageType.traits && pageType.traits.faceted) || filterParams.length > 0 || sortParams.length > 0;
    const pagination = Boolean(pageType && pageType.traits && pageType.traits.pagination) || pageNumber > 1 || relNext || relPrev || pagerLinks.length > 0;
    const noindex = hasNoindex(source);

    if (!canonical) {
      issue(issues, 'category.canonical.missing', 'warning', 'Category canonical missing', 'The category/listing page does not expose a canonical URL.');
    } else if (canonicalCount > 1) {
      issue(issues, 'category.canonical.multiple', 'critical', 'Multiple category canonicals', `The page exposes ${canonicalCount} canonical links.`);
    } else if (current && canonicalUrl && current.origin !== canonicalUrl.origin) {
      issue(issues, 'category.canonical.cross_origin', 'warning', 'Cross-origin category canonical', 'The category/listing canonical points to another origin. Confirm that this is intentional.');
    } else if (!canonicalSelf && !faceted && pageNumber <= 1) {
      issue(issues, 'category.canonical.different', 'warning', 'Category canonical differs from URL', 'The main category/listing URL canonicalizes to a different URL. Confirm that the target represents the same listing.');
    }

    if (itemCount === 0) {
      issue(issues, 'category.items.empty', 'warning', 'No listing items detected', 'No strong product/listing item links were detected on a page classified as a category/listing.');
    } else if (itemCount <= 2 && wordCount < 120) {
      issue(issues, 'category.items.thin', 'warning', 'Thin category/listing', `Only ${itemCount} listing item${itemCount === 1 ? '' : 's'} and ${wordCount} visible words were detected.`);
    }

    if (faceted && canonicalSelf && !noindex) {
      const names = filterParams.concat(sortParams).map((item) => item.name);
      issue(issues, 'category.facets.index_bloat', 'warning', 'Faceted URL may be indexable', `This parameterized listing is self-canonical and not noindex${names.length ? ` (${Array.from(new Set(names)).join(', ')})` : ''}. Review whether it should create a separate indexable URL.`);
    }
    if ((trackingParams.length || sessionParams.length) && canonicalSelf) {
      issue(issues, 'category.params.noncontent_canonical', 'warning', 'Tracking/session parameters are self-canonical', 'A URL containing tracking or session-like parameters canonicalizes to itself, which can create duplicate crawl/index paths.');
    }
    if (parameterizedLinks.length >= 10) {
      issue(issues, 'category.facets.internal_links', 'warning', 'Many parameterized internal links', `${parameterizedLinks.length} internal links contain filter, sort, tracking, or session-like parameters.`, parameterizedLinks.map((item) => item.ref).filter(Boolean));
    }

    if (pageNumber > 1) {
      if (!canonical) {
        issue(issues, 'category.pagination.canonical_missing', 'warning', 'Paginated page has no canonical', `Page ${pageNumber} does not expose a canonical URL.`);
      } else if (sameUrl(stripPagination(currentUrl), canonical)) {
        issue(issues, 'category.pagination.canonical_first_page', 'warning', 'Paginated page canonicalizes to page 1', `Page ${pageNumber} canonicalizes to the pagination-stripped listing URL. Confirm that this matches the intended indexing strategy.`);
      }
      if (!relPrev && pageNumber > 1) {
        issue(issues, 'category.pagination.prev_missing', 'warning', 'Previous-page signal missing', `Page ${pageNumber} has no rel=prev signal.`);
      }
    }
    if (relNext && sameUrl(relNext, currentUrl)) {
      issue(issues, 'category.pagination.next_self', 'warning', 'Next link points to current page', 'The detected rel=next target resolves to the current URL.');
    }
    if (relPrev && sameUrl(relPrev, currentUrl)) {
      issue(issues, 'category.pagination.prev_self', 'warning', 'Previous link points to current page', 'The detected rel=prev target resolves to the current URL.');
    }
    if (relNext && relPrev && sameUrl(relNext, relPrev)) {
      issue(issues, 'category.pagination.neighbors_same', 'warning', 'Pagination neighbors are identical', 'The detected next and previous targets resolve to the same URL.');
    }

    const summary = { critical: 0, warning: 0, info: 0 };
    issues.forEach((item) => { if (summary[item.severity] !== undefined) summary[item.severity] += 1; });

    return {
      applicable: true,
      issues,
      summary,
      canonical: {
        currentUrl,
        canonical,
        count: canonicalCount,
        self: canonicalSelf,
        cleanBase: stripNonContentParams(currentUrl),
      },
      listing: {
        itemCount,
        itemListSchemaCount: listing.itemListCount,
        itemListMicrodataCount: listing.microdataCount,
        productMicrodataCount: listing.productMicrodataCount,
        urls: listing.urls,
        wordCount,
      },
      facets: {
        detected: faceted,
        currentParams: params,
        filterParams,
        sortParams,
        trackingParams,
        sessionParams,
        internalParameterizedLinkCount: parameterizedLinks.length,
        internalParameterizedLinks: parameterizedLinks,
      },
      pagination: {
        detected: pagination,
        pageNumber,
        relNext,
        relPrev,
        internalLinkCount: pagerLinks.length,
        links: pagerLinks,
      },
      indexability: { noindex },
    };
  }

  return {
    inspect,
    classifyParam,
    classifyUrlParams,
    paginationParam,
    stripPagination,
    stripNonContentParams,
  };
});
