# Product page audit

SEO Inspector includes a platform-neutral Product audit for pages classified as Product or containing `Product` / `ProductGroup` JSON-LD.

## What it checks

The Product panel summarizes structured-data quality and exposes the main commerce fields when present:

- product name and image;
- SKU and GTIN (`gtin`, `gtin8`, `gtin12`, `gtin13`, `gtin14`);
- brand;
- `Offer` / `AggregateOffer` price, currency, and availability;
- aggregate rating and review signals;
- `BreadcrumbList` structured data;
- canonical state;
- variant-like URL/canonical relationships;
- out-of-stock and discontinued availability states.

The audit understands JSON-LD graphs and `ProductGroup` / nested Product variants. It is intentionally platform-neutral: it does not contain PrestaShop, WooCommerce, Shopify, private-domain, or project-specific selectors/rules.

## Severity and false-positive control

A missing Product/ProductGroup schema on a page confidently classified as a product is treated as a critical product-specific issue. Missing product name is also critical. Missing product image, offer information, price/currency/availability, breadcrumb schema, or suspicious canonical/variant states are warnings where applicable.

GTIN, SKU, brand, rating, and reviews are displayed but are not automatically treated as errors when absent. Those values are not valid or required for every real product, so the Inspector keeps them informational unless a stronger product-specific problem exists.

## Canonical and variants

The audit recognizes common generic variant-like query parameters such as `variant`, `sku`, `size`, `color`, `option`, `attribute`, `style`, and `material`, plus generic `variant_`, `option_`, and `attribute_` prefixes.

A variant-like URL canonicalizing to the same base product URL is reported as an indexing-strategy hint rather than an automatic error. Self-canonical variants are also identified. Canonicals pointing to unrelated URLs, missing canonicals on variant-like URLs, cross-origin product canonicals, multiple canonicals, and a `ProductGroup` canonicalizing to one specific nested variant can produce warnings or critical findings.

These are technical signals, not assumptions that every store must use one specific variant indexing strategy.

## Out-of-stock handling

`OutOfStock` and `Discontinued` availability states are shown explicitly. The Inspector provides handling hints rather than forcing a single SEO policy. An out-of-stock product combined with `noindex` is warned because temporary stock loss and permanent product retirement often require different decisions.

## Privacy and performance

The Product audit reads the already-extracted page URL, canonical/robots facts, page-type result, and parsed JSON-LD. It performs no additional network request and adds no browser permission. Product audit data stays in the local Inspector report and follows the same local-only privacy model as the rest of the extension.
