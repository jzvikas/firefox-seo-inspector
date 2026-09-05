'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ProductPageAudit = require('../src/lib/product-page-audit.js');

function schema(parsed) {
  return { valid: true, parsed, types: [], raw: JSON.stringify(parsed) };
}

function facts(overrides) {
  return Object.assign({
    url: 'https://shop.test/product/shoe',
    canonical: { count: 1, href: 'https://shop.test/product/shoe' },
    robots: [],
    schemas: [],
  }, overrides || {});
}

function completeProduct(extra) {
  return Object.assign({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Example shoe',
    image: ['https://cdn.test/shoe.jpg'],
    sku: 'SKU-1',
    gtin13: '1234567890123',
    brand: { '@type': 'Brand', name: 'Example' },
    offers: {
      '@type': 'Offer',
      price: '39.99',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '24' },
  }, extra || {});
}

test('complete product audit extracts commerce fields without warnings', () => {
  const result = ProductPageAudit.inspect(facts({
    schemas: [
      schema(completeProduct()),
      schema({ '@type': 'BreadcrumbList', itemListElement: [] }),
    ],
  }), { primary: 'product' });

  assert.equal(result.applicable, true);
  assert.equal(result.fields.name.value, 'Example shoe');
  assert.equal(result.fields.image.present, true);
  assert.equal(result.fields.sku.value, 'SKU-1');
  assert.equal(result.fields.gtin.value, '1234567890123');
  assert.equal(result.fields.brand.value, 'Example');
  assert.equal(result.fields.price.value, '39.99');
  assert.equal(result.fields.currency.value, 'EUR');
  assert.match(result.fields.availability.value, /InStock/);
  assert.equal(result.fields.rating.value, '4.8');
  assert.equal(result.fields.reviews.value, '24');
  assert.equal(result.summary.critical, 0);
  assert.equal(result.summary.warning, 0);
  assert.equal(result.summary.completeness, 100);
});

test('detected product without Product schema is critical', () => {
  const result = ProductPageAudit.inspect(facts({
    schemas: [schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  assert.equal(result.applicable, true);
  assert.ok(result.issues.some((item) => item.id === 'product.schema.missing' && item.severity === 'critical'));
});

test('missing product name is critical and missing image/offers are warnings', () => {
  const result = ProductPageAudit.inspect(facts({
    schemas: [schema({ '@type': 'Product', sku: 'A' })],
  }), { primary: 'product' });
  const ids = new Map(result.issues.map((item) => [item.id, item.severity]));
  assert.equal(ids.get('product.name.missing'), 'critical');
  assert.equal(ids.get('product.image.missing'), 'warning');
  assert.equal(ids.get('product.offers.missing'), 'warning');
});

test('Offer requires price, currency and availability signals', () => {
  const result = ProductPageAudit.inspect(facts({
    schemas: [schema(completeProduct({ offers: { '@type': 'Offer' } })), schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  const ids = result.issues.map((item) => item.id);
  assert.ok(ids.includes('product.price.missing'));
  assert.ok(ids.includes('product.currency.missing'));
  assert.ok(ids.includes('product.availability.missing'));
});

test('AggregateOffer lowPrice and highPrice count as product price', () => {
  const result = ProductPageAudit.inspect(facts({
    schemas: [schema(completeProduct({
      offers: { '@type': 'AggregateOffer', lowPrice: '20', highPrice: '50', priceCurrency: 'EUR', availability: 'InStock' },
    })), schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  assert.equal(result.fields.price.value, '20');
  assert.equal(result.offers.lowPrice, '20');
  assert.equal(result.offers.highPrice, '50');
  assert.equal(result.issues.some((item) => item.id === 'product.price.missing'), false);
});

test('GTIN fallback supports generic and specific GTIN properties', () => {
  const generic = ProductPageAudit.inspect(facts({ schemas: [schema(completeProduct({ gtin13: undefined, gtin: 'ABC' })), schema({ '@type': 'BreadcrumbList' })] }), { primary: 'product' });
  assert.equal(generic.fields.gtin.value, 'ABC');
  const gtin14 = ProductPageAudit.inspect(facts({ schemas: [schema(completeProduct({ gtin13: undefined, gtin14: '00012345678905' })), schema({ '@type': 'BreadcrumbList' })] }), { primary: 'product' });
  assert.equal(gtin14.fields.gtin.value, '00012345678905');
});

test('missing GTIN, SKU, brand and reviews remain informational hints, not warnings', () => {
  const product = completeProduct({ sku: undefined, gtin13: undefined, brand: undefined, aggregateRating: undefined });
  const result = ProductPageAudit.inspect(facts({ schemas: [schema(product), schema({ '@type': 'BreadcrumbList' })] }), { primary: 'product' });
  assert.ok(result.hints.some((item) => item.includes('GTIN')));
  assert.ok(result.hints.some((item) => item.includes('SKU')));
  assert.ok(result.hints.some((item) => item.includes('Brand')));
  assert.ok(result.hints.some((item) => item.includes('rating/review')));
  assert.equal(result.issues.some((item) => /gtin|sku|brand|review/i.test(item.id)), false);
});

test('missing BreadcrumbList is a warning on product pages', () => {
  const result = ProductPageAudit.inspect(facts({ schemas: [schema(completeProduct())] }), { primary: 'product' });
  assert.ok(result.issues.some((item) => item.id === 'product.breadcrumb.missing' && item.severity === 'warning'));
});

test('canonical missing, multiple and cross-origin conditions are detected', () => {
  const baseSchemas = [schema(completeProduct()), schema({ '@type': 'BreadcrumbList' })];
  const missing = ProductPageAudit.inspect(facts({ canonical: { count: 0, href: '' }, schemas: baseSchemas }), { primary: 'product' });
  assert.ok(missing.issues.some((item) => item.id === 'product.canonical.missing'));

  const multiple = ProductPageAudit.inspect(facts({ canonical: { count: 2, href: 'https://shop.test/product/shoe' }, schemas: baseSchemas }), { primary: 'product' });
  assert.ok(multiple.issues.some((item) => item.id === 'product.canonical.multiple' && item.severity === 'critical'));

  const cross = ProductPageAudit.inspect(facts({ canonical: { count: 1, href: 'https://other.test/product/shoe' }, schemas: baseSchemas }), { primary: 'product' });
  assert.ok(cross.issues.some((item) => item.id === 'product.canonical.cross_origin'));
});

test('variant-like URL canonicalizing to the same base product is recognized without false canonical warning', () => {
  const result = ProductPageAudit.inspect(facts({
    url: 'https://shop.test/product/shoe?size=42&color=black',
    canonical: { count: 1, href: 'https://shop.test/product/shoe' },
    schemas: [schema(completeProduct()), schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  assert.deepEqual(result.variants.parameterNames.sort(), ['color', 'size']);
  assert.equal(result.canonical.baseVariant, true);
  assert.equal(result.issues.some((item) => item.id === 'product.canonical.different'), false);
  assert.ok(result.hints.some((item) => item.includes('base product URL')));
});

test('variant-like URL with unrelated canonical raises variant warning', () => {
  const result = ProductPageAudit.inspect(facts({
    url: 'https://shop.test/product/shoe?variant=red',
    canonical: { count: 1, href: 'https://shop.test/category/shoes' },
    schemas: [schema(completeProduct()), schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  assert.ok(result.issues.some((item) => item.id === 'product.variant.canonical_unexpected'));
});

test('ProductGroup with multiple product URLs warns when group canonical points at one variant', () => {
  const group = {
    '@type': 'ProductGroup',
    name: 'Shoe family',
    image: 'https://cdn.test/shoe.jpg',
    hasVariant: [
      Object.assign(completeProduct({ name: 'Red shoe', url: 'https://shop.test/product/shoe-red' }), { '@type': 'Product' }),
      Object.assign(completeProduct({ name: 'Blue shoe', url: 'https://shop.test/product/shoe-blue' }), { '@type': 'Product' }),
    ],
  };
  const result = ProductPageAudit.inspect(facts({
    url: 'https://shop.test/product/shoe',
    canonical: { count: 1, href: 'https://shop.test/product/shoe-red' },
    schemas: [schema(group), schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  assert.equal(result.schema.productGroupCount, 1);
  assert.equal(result.variants.productUrls.length, 2);
  assert.ok(result.issues.some((item) => item.id === 'product.variant.group_to_variant'));
});

test('out-of-stock and discontinued states produce handling hints', () => {
  const result = ProductPageAudit.inspect(facts({
    schemas: [schema(completeProduct({
      offers: { '@type': 'Offer', price: '10', priceCurrency: 'EUR', availability: 'https://schema.org/OutOfStock' },
    })), schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  assert.equal(result.stock.outOfStock, true);
  assert.equal(result.stock.discontinued, false);
  assert.ok(result.hints.some((item) => item.includes('out of stock')));
});

test('out-of-stock noindex page receives an explicit warning', () => {
  const result = ProductPageAudit.inspect(facts({
    robots: [{ name: 'robots', content: 'noindex,follow' }],
    schemas: [schema(completeProduct({
      offers: { '@type': 'Offer', price: '10', priceCurrency: 'EUR', availability: 'OutOfStock' },
    })), schema({ '@type': 'BreadcrumbList' })],
  }), { primary: 'product' });
  assert.ok(result.issues.some((item) => item.id === 'product.stock.noindex'));
});

test('non-product page without product schema is not applicable', () => {
  const result = ProductPageAudit.inspect(facts({ schemas: [schema({ '@type': 'Article', headline: 'Story' })] }), { primary: 'article' });
  assert.equal(result.applicable, false);
  assert.equal(result.issues.length, 0);
});

test('schema traversal handles @graph and ignores invalid schema blocks', () => {
  const result = ProductPageAudit.inspect(facts({
    schemas: [
      { valid: false, raw: '{bad' },
      schema({ '@context': 'https://schema.org', '@graph': [completeProduct(), { '@type': 'BreadcrumbList' }] }),
    ],
  }), { primary: 'product' });
  assert.equal(result.schema.productCount, 1);
  assert.equal(result.schema.breadcrumbCount, 1);
  assert.equal(result.fields.name.value, 'Example shoe');
});
