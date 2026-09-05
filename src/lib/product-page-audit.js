(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProductPageAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRODUCT_TYPES = new Set(['product', 'productgroup']);
  const OFFER_TYPES = new Set(['offer', 'aggregateoffer']);
  const VARIANT_PARAMS = new Set([
    'variant', 'sku', 'size', 'color', 'colour', 'option', 'options',
    'attribute', 'attributes', 'style', 'material',
  ]);
  const OUT_OF_STOCK_STATES = new Set(['outofstock', 'discontinued']);

  function clean(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function scalar(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value);
    if (typeof value === 'object') {
      if (value.name !== undefined) return clean(value.name);
      if (value['@id'] !== undefined) return clean(value['@id']);
      if (value.url !== undefined) return clean(value.url);
    }
    return '';
  }

  function array(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  function typesOf(node) {
    if (!node || typeof node !== 'object') return [];
    return array(node['@type']).map((item) => clean(item).toLowerCase()).filter(Boolean);
  }

  function hasType(node, names) {
    const types = typesOf(node);
    const wanted = names instanceof Set ? names : new Set(array(names).map((item) => String(item).toLowerCase()));
    return types.some((type) => wanted.has(type));
  }

  function walk(value, visitor, state) {
    const meta = state || { seen: new Set(), count: 0, max: 5000 };
    if (!value || typeof value !== 'object' || meta.count >= meta.max) return;
    if (meta.seen.has(value)) return;
    meta.seen.add(value);
    meta.count += 1;
    visitor(value);
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, visitor, meta));
      return;
    }
    Object.keys(value).forEach((key) => {
      if (key !== '@context') walk(value[key], visitor, meta);
    });
  }

  function schemaNodes(facts) {
    const nodes = [];
    const seen = new Set();
    for (const schema of Array.isArray(facts && facts.schemas) ? facts.schemas : []) {
      if (!schema || !schema.valid || !schema.parsed) continue;
      walk(schema.parsed, (node) => {
        if (!node || typeof node !== 'object' || Array.isArray(node) || seen.has(node)) return;
        seen.add(node);
        nodes.push(node);
      });
    }
    return nodes;
  }

  function nodesByType(nodes, type) {
    const wanted = new Set(array(type).map((item) => String(item).toLowerCase()));
    return nodes.filter((node) => hasType(node, wanted));
  }

  function firstValue(nodes, keys) {
    for (const node of nodes) {
      for (const key of keys) {
        const value = scalar(node && node[key]);
        if (value) return value;
      }
    }
    return '';
  }

  function imageUrls(nodes) {
    const output = [];
    const seen = new Set();
    function add(value) {
      if (typeof value === 'string') {
        const text = clean(value);
        if (text && !seen.has(text)) {
          seen.add(text);
          output.push(text);
        }
        return;
      }
      if (!value || typeof value !== 'object') return;
      const candidate = scalar(value.url || value.contentUrl || value['@id']);
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        output.push(candidate);
      }
    }
    for (const node of nodes) array(node && node.image).forEach(add);
    return output;
  }

  function brandName(nodes) {
    for (const node of nodes) {
      const brand = node && node.brand;
      if (typeof brand === 'string') {
        const text = clean(brand);
        if (text) return text;
      }
      for (const item of array(brand)) {
        const value = scalar(item);
        if (value) return value;
      }
    }
    return '';
  }

  function gtinValue(nodes) {
    return firstValue(nodes, ['gtin14', 'gtin13', 'gtin12', 'gtin8', 'gtin']);
  }

  function normalizeAvailability(value) {
    const text = clean(value);
    if (!text) return '';
    const tail = text.split(/[\/#]/).filter(Boolean).pop() || text;
    return tail.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }

  function offerSummary(productNodes, allNodes) {
    const direct = [];
    for (const product of productNodes) {
      for (const offer of array(product && product.offers)) {
        if (offer && typeof offer === 'object') direct.push(offer);
      }
    }
    const typed = nodesByType(allNodes, OFFER_TYPES);
    const offers = [];
    const seen = new Set();
    for (const offer of direct.concat(typed)) {
      if (!offer || typeof offer !== 'object' || seen.has(offer)) continue;
      seen.add(offer);
      offers.push(offer);
    }

    let price = '';
    let currency = '';
    const availability = [];
    const availabilitySeen = new Set();
    let url = '';
    let lowPrice = '';
    let highPrice = '';
    for (const offer of offers) {
      if (!price) price = scalar(offer.price);
      if (!lowPrice) lowPrice = scalar(offer.lowPrice);
      if (!highPrice) highPrice = scalar(offer.highPrice);
      if (!currency) currency = scalar(offer.priceCurrency);
      if (!url) url = scalar(offer.url);
      for (const item of array(offer.availability)) {
        const raw = scalar(item);
        const normalized = normalizeAvailability(raw);
        if (normalized && !availabilitySeen.has(normalized)) {
          availabilitySeen.add(normalized);
          availability.push({ raw, normalized });
        }
      }
    }
    return {
      count: offers.length,
      price: price || lowPrice || highPrice,
      lowPrice,
      highPrice,
      currency,
      url,
      availability,
      hasPrice: Boolean(price || lowPrice || highPrice),
      hasCurrency: Boolean(currency),
      hasAvailability: availability.length > 0,
    };
  }

  function ratingSummary(productNodes) {
    let ratingValue = '';
    let ratingCount = '';
    let reviewCount = '';
    let reviews = 0;
    for (const node of productNodes) {
      for (const rating of array(node && node.aggregateRating)) {
        if (!rating || typeof rating !== 'object') continue;
        if (!ratingValue) ratingValue = scalar(rating.ratingValue);
        if (!ratingCount) ratingCount = scalar(rating.ratingCount);
        if (!reviewCount) reviewCount = scalar(rating.reviewCount);
      }
      reviews += array(node && node.review).filter((item) => item && typeof item === 'object').length;
    }
    return { ratingValue, ratingCount, reviewCount, reviews };
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
    return Boolean(comparableUrl(left) && comparableUrl(left) === comparableUrl(right));
  }

  function variantParamNames(value) {
    const url = safeUrl(value);
    if (!url) return [];
    const result = [];
    for (const [rawName, rawValue] of url.searchParams.entries()) {
      const name = rawName.toLowerCase();
      if (!clean(rawValue)) continue;
      if (VARIANT_PARAMS.has(name) || name.startsWith('variant_') || name.startsWith('option_') || name.startsWith('attribute_')) result.push(rawName);
    }
    return Array.from(new Set(result));
  }

  function stripVariantParams(value) {
    const url = safeUrl(value);
    if (!url) return '';
    for (const name of Array.from(url.searchParams.keys())) {
      const lower = name.toLowerCase();
      if (VARIANT_PARAMS.has(lower) || lower.startsWith('variant_') || lower.startsWith('option_') || lower.startsWith('attribute_')) url.searchParams.delete(name);
    }
    return url.href;
  }

  function productVariantUrls(productNodes) {
    const output = [];
    const seen = new Set();
    for (const node of productNodes) {
      const url = scalar(node && node.url);
      if (url && !seen.has(url)) {
        seen.add(url);
        output.push(url);
      }
    }
    return output;
  }

  function hasNoindex(facts) {
    return (Array.isArray(facts && facts.robots) ? facts.robots : []).some((item) => /(?:^|[,\s])noindex(?:$|[,\s])/i.test(String(item && item.content || '')));
  }

  function issue(list, id, severity, title, message) {
    list.push({ id, severity, title, message });
  }

  function field(value, label, recommended) {
    return { label, value: value || '', present: Boolean(value), recommended: Boolean(recommended) };
  }

  function inspect(facts, pageType) {
    const source = facts || {};
    const nodes = schemaNodes(source);
    const productNodes = nodesByType(nodes, 'product');
    const productGroups = nodesByType(nodes, 'productgroup');
    const breadcrumbNodes = nodesByType(nodes, 'breadcrumblist');
    const detectedProduct = pageType && pageType.primary === 'product';
    const applicable = detectedProduct || productNodes.length > 0 || productGroups.length > 0;
    if (!applicable) {
      return {
        applicable: false,
        reason: 'No Product/ProductGroup structured data or product page-type signal was detected.',
        issues: [],
        summary: { critical: 0, warning: 0, info: 0, presentFields: 0, totalFields: 0, completeness: 0 },
      };
    }

    const issues = [];
    const productsForFields = productNodes.length ? productNodes : productGroups;
    const name = firstValue(productsForFields, ['name']);
    const images = imageUrls(productsForFields);
    const sku = firstValue(productsForFields, ['sku']);
    const gtin = gtinValue(productsForFields);
    const brand = brandName(productsForFields);
    const offers = offerSummary(productsForFields, nodes);
    const rating = ratingSummary(productsForFields);
    const canonicalCount = Number(source.canonical && source.canonical.count) || 0;
    const canonical = scalar(source.canonical && source.canonical.href);
    const currentUrl = scalar(source.url);
    const canonicalSelf = canonical ? sameUrl(currentUrl, canonical) : false;
    const current = safeUrl(currentUrl);
    const canonicalUrl = safeUrl(canonical);
    const variantParams = variantParamNames(currentUrl);
    const strippedCurrent = stripVariantParams(currentUrl);
    const canonicalIsBaseVariant = Boolean(variantParams.length && canonical && sameUrl(strippedCurrent, canonical));
    const variantUrls = productVariantUrls(productNodes);
    const availabilityStates = offers.availability.map((item) => item.normalized);
    const outOfStock = availabilityStates.length > 0 && availabilityStates.every((state) => OUT_OF_STOCK_STATES.has(state));
    const discontinued = availabilityStates.includes('discontinued');
    const fields = {
      name: field(name, 'Name', true),
      image: field(images[0] || '', 'Image', true),
      sku: field(sku, 'SKU', false),
      gtin: field(gtin, 'GTIN', false),
      brand: field(brand, 'Brand', true),
      price: field(offers.price, 'Price', true),
      currency: field(offers.currency, 'Currency', true),
      availability: field(offers.availability.map((item) => item.raw).join(', '), 'Availability', true),
      rating: field(rating.ratingValue, 'Rating', false),
      reviews: field(rating.reviewCount || rating.ratingCount || (rating.reviews ? String(rating.reviews) : ''), 'Reviews', false),
    };

    if (detectedProduct && !productNodes.length && !productGroups.length) {
      issue(issues, 'product.schema.missing', 'critical', 'Product structured data missing', 'This page is classified as a product but no Product or ProductGroup JSON-LD was found.');
    }
    if ((productNodes.length || productGroups.length) && !name) {
      issue(issues, 'product.name.missing', 'critical', 'Product name missing', 'Product structured data does not expose a product name.');
    }
    if ((productNodes.length || productGroups.length) && !images.length) {
      issue(issues, 'product.image.missing', 'warning', 'Product image missing', 'Product structured data does not expose a product image.');
    }
    if ((productNodes.length || productGroups.length) && !offers.count) {
      issue(issues, 'product.offers.missing', 'warning', 'Product offers missing', 'No Offer or AggregateOffer data was found for the product.');
    }
    if (offers.count && !offers.hasPrice) {
      issue(issues, 'product.price.missing', 'warning', 'Product price missing', 'Offer data exists but no price, lowPrice, or highPrice was found.');
    }
    if (offers.count && !offers.hasCurrency) {
      issue(issues, 'product.currency.missing', 'warning', 'Product currency missing', 'Offer data exists but priceCurrency is missing.');
    }
    if (offers.count && !offers.hasAvailability) {
      issue(issues, 'product.availability.missing', 'warning', 'Product availability missing', 'Offer data exists but availability is missing.');
    }
    if (!breadcrumbNodes.length) {
      issue(issues, 'product.breadcrumb.missing', 'warning', 'Breadcrumb schema missing', 'No BreadcrumbList structured data was found on this product page.');
    }
    if (!canonical) {
      issue(issues, 'product.canonical.missing', 'warning', 'Product canonical missing', 'The product page does not expose a canonical URL.');
    } else if (canonicalCount > 1) {
      issue(issues, 'product.canonical.multiple', 'critical', 'Multiple product canonicals', `The page exposes ${canonicalCount} canonical links.`);
    } else if (current && canonicalUrl && current.origin !== canonicalUrl.origin) {
      issue(issues, 'product.canonical.cross_origin', 'warning', 'Cross-origin product canonical', 'The product canonical points to a different origin. Confirm that this is intentional.');
    } else if (!canonicalSelf && !canonicalIsBaseVariant) {
      issue(issues, 'product.canonical.different', 'warning', 'Product canonical differs from URL', 'The product canonical points to a different URL. Confirm that the canonical target represents the same product.');
    }

    if (variantParams.length && !canonical) {
      issue(issues, 'product.variant.canonical_missing', 'warning', 'Variant URL has no canonical', `Variant-like parameter(s) ${variantParams.join(', ')} are present but the page has no canonical.`);
    }
    if (variantParams.length && canonical && !canonicalSelf && !canonicalIsBaseVariant) {
      issue(issues, 'product.variant.canonical_unexpected', 'warning', 'Variant canonical target is unexpected', 'A variant-like URL canonicalizes somewhere other than itself or the same base product URL.');
    }
    if (productGroups.length && variantUrls.length > 1 && canonical && variantUrls.some((url) => sameUrl(url, canonical)) && !sameUrl(currentUrl, canonical)) {
      issue(issues, 'product.variant.group_to_variant', 'warning', 'ProductGroup canonical points to a variant', 'The current ProductGroup page canonicalizes to one specific Product variant URL. Confirm that this does not collapse distinct product/variant URLs unintentionally.');
    }
    if (outOfStock && hasNoindex(source)) {
      issue(issues, 'product.stock.noindex', 'warning', 'Out-of-stock product is noindex', 'The product is out of stock and the page is noindex. Confirm whether temporary out-of-stock products should remain indexable.');
    }

    const hints = [];
    if (!gtin) hints.push('GTIN is not present. This can be valid for products without a GTIN, but include one when the product has a real manufacturer identifier.');
    if (!sku) hints.push('SKU is not present in Product structured data.');
    if (!brand) hints.push('Brand is not present in Product structured data.');
    if (!rating.ratingValue && !rating.reviewCount && !rating.ratingCount && !rating.reviews) hints.push('No rating/review signal was found. This is informational; products do not need reviews to be valid.');
    if (canonicalIsBaseVariant) hints.push('Variant-like URL canonicalizes to the same base product URL. Confirm this matches the intended indexing strategy for variants.');
    if (variantParams.length && canonicalSelf) hints.push('Variant-like URL self-canonicalizes. Confirm that this variant should be independently indexable.');
    if (outOfStock) {
      hints.push(discontinued
        ? 'Structured data marks the product as discontinued. Keep the page useful or redirect only when there is a genuinely equivalent replacement.'
        : 'Structured data marks the product as out of stock. For temporary stock loss, retaining the useful product URL is often preferable to deleting it.');
    }

    const critical = issues.filter((item) => item.severity === 'critical').length;
    const warning = issues.filter((item) => item.severity === 'warning').length;
    const info = issues.filter((item) => item.severity === 'info').length;
    const fieldList = Object.values(fields);
    const presentFields = fieldList.filter((item) => item.present).length;
    const totalFields = fieldList.length;
    const completeness = totalFields ? Math.round((presentFields / totalFields) * 100) : 0;

    return {
      applicable: true,
      schema: {
        productCount: productNodes.length,
        productGroupCount: productGroups.length,
        breadcrumbCount: breadcrumbNodes.length,
        hasProduct: productNodes.length > 0,
        hasProductGroup: productGroups.length > 0,
      },
      fields,
      images,
      offers,
      rating,
      canonical: {
        currentUrl,
        canonical,
        count: canonicalCount,
        self: canonicalSelf,
        baseVariant: canonicalIsBaseVariant,
      },
      variants: {
        parameterNames: variantParams,
        productUrls: variantUrls,
        productGroupCount: productGroups.length,
      },
      stock: {
        states: availabilityStates,
        outOfStock,
        discontinued,
      },
      issues,
      hints,
      summary: { critical, warning, info, presentFields, totalFields, completeness },
    };
  }

  return {
    inspect,
    schemaNodes,
    nodesByType,
    normalizeAvailability,
    variantParamNames,
    stripVariantParams,
    sameUrl,
  };
});
