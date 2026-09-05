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

For the current parameterized listing, the Category panel shows canonical state, meta robots, `X-Robots-Tag`, and the effective `noindex` result. A faceted URL that is both self-canonical and effectively indexable receives an index-bloat warning. Tracking/session-like URLs that self-canonicalize are warned only while effectively indexable. Conflicting `index` and `noindex` directives across meta robots and/or `X-Robots-Tag` are reported explicitly.

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

### Pagination HTTP check

The Category panel can explicitly run **Check pagination links**. This does not create a new fetch subsystem: it reuses the existing bounded link checker with the same hard limits and privacy behavior:

- maximum 250 unique targets;
- six concurrent requests;
- 10-second timeout per request;
- 30-second scan timeout;
- credential-free requests with no referrer;
- cancellation and session caching.

The result separates healthy, broken, redirecting, and unknown pagination targets. Broken pagination anchors can be highlighted in the inspected page. Pagination URLs are deduplicated before the check.

### Pagination metadata families

Tabs and Crawler additionally group URLs into pagination families. The family key removes only recognized pagination components such as `?page=2` or `/page/2/` while preserving meaningful filter/sort parameters. This prevents a filtered red listing from being compared with a filtered black listing merely because both are paginated.

Within each family, the extension reports repeated title and description values across distinct pagination URLs. Same-URL duplicates are ignored, and unrelated paths/facet combinations remain separate. These family-specific groups are also retained in JSON export state.

## Report integration

The same category audit object is attached to:

- rendered-page reports;
- explicit same-page raw HTML reports;
- explicit URL comparison reports;
- pages fetched by Crawler Lite through the existing comparison parser.

The Category UI re-evaluates the current audit with captured HTTP response metadata so `X-Robots-Tag` participates in parameterized-URL decisions. No extra permission, telemetry, account, backend, remote runtime code, or automatic category-specific network fetch is added.

## Current limits

The pagination HTTP check is intentionally on-demand rather than automatic. It validates targets discovered on the current page but does not attempt to infer an unlimited pagination sequence beyond the links already present.

Pagination-family duplicate detection currently targets title and meta description. H1 duplication remains available through the existing general Tabs/Crawler duplicate analysis rather than being repeated as a pagination-specific rule.
