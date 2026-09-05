# Category/listing audit

The Category panel adds platform-neutral checks for category, collection, and other product-listing pages. It does not depend on PrestaShop, WooCommerce, Shopify, Magento, or private site-specific selectors.

## Detection inputs

The audit reuses data already collected by the extension and performs no additional network request by itself. Strong listing evidence includes:

- the existing page-type classifier reporting `Category / listing`;
- JSON-LD `ItemList`, `ListItem`, or `Product` nodes;
- schema.org ItemList/Product microdata;
- links found inside schema.org Product or ItemList microdata containers;
- existing `rel=next` / `rel=prev` and internal-link data.

Listing-link inventories are deduplicated and bounded. The audit intentionally avoids broad CSS guesses such as `.product`, `.item`, or vendor-specific card selectors because those would create fragile false positives and couple the public extension to a particular storefront implementation.

## Canonical checks

The panel reports the current URL, canonical URL, whether the canonical is self-referencing, and the URL after known non-content parameters are removed. It warns about:

- missing or multiple canonicals;
- cross-origin category canonicals;
- an unexpected different canonical on a normal first-page listing;
- page 2+ canonicalizing to the pagination-stripped first page, so the indexing strategy can be reviewed.

Faceted URLs are treated differently from ordinary first-page category URLs because canonicalizing a filter to a clean base can be intentional.

## Listing depth

The audit exposes a bounded count of strong listing-item signals and the visible word count. A category with no detected listing items is warned. A listing with at most two detected items and fewer than 120 visible words is marked as a conservative thin-listing heuristic.

These are diagnostics, not quality judgments: storefronts can intentionally have small categories, and the UI describes the detected facts so the operator can decide whether action is needed.

## Faceted navigation

Query parameters are classified locally into these generic groups:

- filter/facet-like parameters;
- sort/order parameters;
- pagination parameters;
- tracking parameters such as `utm_*`, `gclid`, or `fbclid`;
- session-like parameters;
- other parameters.

A faceted URL that is both self-canonical and not `noindex` receives an index-bloat warning. Tracking/session-like URLs that self-canonicalize also receive a duplicate-crawl-path warning.

The audit inspects existing internal links for filter, sort, tracking, and session-like parameters. When many such links are present, the issue can highlight the corresponding anchors in the inspected page. The inventory is bounded and uses existing page data only.

## Pagination

Pagination detection combines the existing page-type trait, recognized page query/path forms, `rel=next` / `rel=prev`, and internal pagination-like links. The panel shows:

- detected current page number when it can be inferred safely;
- `rel=next` and `rel=prev` targets;
- bounded internal pagination-link count;
- warnings for missing `rel=prev` on an inferred page 2+;
- warnings when next/previous point back to the current page or both resolve to the same URL;
- canonical behavior on inferred page 2+.

Offset/start parameters are recognized as pagination signals but are not converted into a fake page number because page size is unknown.

## Report integration

The same category audit object is attached to:

- rendered-page reports;
- explicit same-page raw HTML reports;
- explicit URL comparison reports;
- pages fetched by Crawler Lite through the existing comparison parser.

No extra permission, telemetry, account, backend, remote runtime code, or category-specific network fetch is added.

## Current limits

This first category/listing milestone deliberately does not perform a separate HTTP request for every pagination link. Broken-pagination-link network validation remains a later pagination milestone and can reuse the extension's bounded link/crawler infrastructure rather than creating another unbounded fetch path.

Duplicate title/description detection already exists in Tabs and Crawler, but grouping duplicates specifically by pagination family remains a separate pagination milestone.
