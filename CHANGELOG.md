# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- Versioned global `browser.storage.local` schema coordination with `storageSchema:v1`, deterministic normalization of Rules/Profiles/Snapshot history, and startup gating so persistent data is adopted before audits or UI writes use it.
- Failure-safe legacy snapshot migration writes the replacement history before deleting old `snapshot:*` keys and advances the global schema marker last; interrupted writes/cleanup remain retryable and idempotent.
- Downgrade protection keeps newer local schemas read-only in older extension builds: audits and exports remain available while Rules/Profile/Snapshot mutations are disabled to avoid destructive rollback data loss.
- Automatic inspected-tab recovery after an extension reload: the Inspector locally pings the active HTTP/HTTPS tab and, only when the content script is missing, restores its own manifest-declared packaged content-script bundle through Firefox `scripting` without requiring a website reload.
- Explicit unsupported/restricted-page states for Firefox internal pages, local files, non-HTTP schemes, and HTTP/HTTPS pages where Firefox refuses extension injection, replacing the previous generic reload advice.
- Per-panel Inspector renderer error boundaries plus visible handling for uncaught window errors and unhandled promise rejections, so one UI failure no longer has to collapse the entire detached Inspector into an apparently blank state.
- Refresh-generation protection prevents a slower audit/reconnect from an older tab from overwriting a newer active tab after rapid navigation or tab switching; runtime error summaries remain bounded, sanitized, local, and in-memory only.
- Parameterized category/faceted URLs now combine canonical state, meta robots, and `X-Robots-Tag`, including effective `noindex` handling and explicit conflicting `index`/`noindex` diagnostics.
- Category pagination can be checked on demand with the existing bounded, cancellable, credential-free link checker; broken, redirecting, and unknown pagination targets are summarized and broken anchors can be highlighted in-page.
- Tabs and Crawler now group distinct URLs by pagination family and report repeated title/meta-description patterns while preserving filter/sort parameters so unrelated facets are not mixed together.
- Shared pagination-family and link-result modeling plus regression/runtime tests cover page/offset/path pagination, facet-preserving family keys, metadata duplicate grouping, broken-link classification, script dependency order, and Category network UI wiring.
- Dedicated **Category** panel with platform-neutral category/listing canonical diagnostics, bounded strong listing-item counts, empty/thin listing warnings, faceted-navigation inspection, and pagination diagnostics.
- Local query-parameter classification for filter/facet, sort/order, pagination, tracking, session-like, and other parameters, plus index-bloat warnings for indexable self-canonical faceted URLs and duplicate-crawl-path warnings for tracking/session-like self-canonical URLs.
- Bounded parameterized internal-link inventory with in-page highlighting for filter/sort/tracking/session-like links; listing-link evidence intentionally uses schema.org ItemList/Product signals instead of vendor-specific storefront selectors.
- Category/listing audits are attached to rendered, authenticated raw-source, explicit URL comparison, and Crawler fetched-page reports without additional network requests or browser permissions.
- Automated category audit model tests, Category sidebar runtime coverage, DOM listing-signal tests, comparison/runtime dependency checks, and public documentation for current limits and platform-neutral behavior.
- Dedicated **Product** panel with platform-neutral Product/ProductGroup structured-data quality, commerce-field completeness, canonical/variant diagnostics, BreadcrumbList checks, and availability handling hints.
- Product field inspection for name, image, SKU, GTIN, brand, Offer/AggregateOffer price and currency, availability, aggregate rating, and review signals, while keeping optional identifiers/reviews informational when absence alone is not an error.
- Product canonical diagnostics for missing/multiple/cross-origin/unexpected canonicals, generic variant-like URL parameters, base-product canonical strategies, and ProductGroup pages canonicalizing to one nested Product variant.
- Out-of-stock/discontinued handling hints plus an explicit warning for out-of-stock products that are also `noindex`, without forcing one stock-retirement policy.
- Product audits are included in rendered, authenticated raw-source, explicit URL comparison, and Crawler fetched-page reports without additional network requests or browser permissions; automated model, dependency, and sidebar runtime coverage is included.
- Toolbar activation now opens SEO Inspector in a separate movable and resizable browser window instead of shrinking the inspected page with a sidebar. Reopening the toolbar action focuses the existing Inspector window rather than creating duplicates, and the detached window follows the active normal browser tab while ignoring its own extension tab.
- Generated release artifacts now use the neutral `seo-inspector-<version>.xpi` / `.xpi.sha256` filenames; older `firefox-seo-inspector-*` build artifacts are removed automatically during deterministic builds.
- Platform-neutral local page-type detection for Homepage, Product, Category/listing, Article/blog, Search results, CMS/generic content, and 404/error pages, with independent Faceted/filter and Pagination traits.
- Explainable page-type confidence and bounded evidence based on already-available HTTP status, URL shape, JSON-LD/Open Graph/microdata, semantic article/search controls, and pagination signals; detection itself performs no network request.
- Dedicated Page type card in Overview plus page-type data in rendered/raw URL reports, explicit URL comparison parsing, Multi-tab summaries, and Crawler Lite summaries.
- Multi-tab and Crawler Lite search/sort and CSV/JSON exports now retain page type, confidence, and page traits.
- Automated page-type precedence/heuristic tests, platform-neutral DOM-signal tests, dependency-order checks, fetched-page/domain-profile runtime coverage, and sidebar Overview/Tabs/Crawler VM smoke tests.
- Dedicated **Crawler** panel for explicit bounded local crawling from the current page or a user-entered HTTP/HTTPS seed URL.
- Same-host restriction by default, configurable crawl caps up to 250 URLs and depth 3, URL normalization/deduplication, six concurrent requests, live progress, Pause/Resume, and scan-level cancellation that aborts in-flight requests.
- Credential-free/no-referrer crawler GET requests with redirect following, a 12-second per-request timeout, 2 MiB HTML response limit, non-HTML rejection, and local parsing without executing fetched scripts.
- Crawler collection of HTTP status, title, description, H1, canonical, robots, indexability, score, and issue counts plus broken/error/redirect discovery and duplicate title/description/H1 detection.
- Crawler search/filter/sort plus local CSV/JSON export, bounded in-memory result state, dedicated public documentation, model tests, sidebar runtime/dependency tests, and background network-safety/cancellation tests.
- Dedicated **Tabs** panel for on-demand audits of already-open HTTP/HTTPS tabs without crawling or refetching those pages.
- Bounded multi-tab scanning for up to 100 tabs with six concurrent content-script audits, live progress, cancellation, a 15-second per-tab safety timeout, and explicit unavailable-tab reporting instead of network fallback.
- Cross-tab collection of URL, HTTP status, title, description, H1, canonical, robots, indexability, SEO score, and issue counts, plus normalized duplicate title/description/H1 detection.
- Multi-tab search, indexability/issue/duplicate/availability filters, sorting, and local CSV/JSON export.
- Automated multi-tab model tests, sidebar dependency checks, renderer boot smoke coverage, and a VM runtime scan test that exercises tab querying, content-script reports, progress completion, and duplicate annotation.
- Dedicated local-only Profiles panel with exact-hostname matching, optional labels, enable/disable state, create/save/delete actions, and a bounded saved-profile inventory.
- Domain profiles inherit global Rules by default and can override title/description thresholds, oversized-image ratio, known image byte-size limit, and required title/description/canonical/H1/schema/hreflang/HTTPS signals.
- Per-host expected JSON-LD schema types and hreflang values with `profile.schema.expected` and `profile.hreflang.expected` findings when expectations are missing.
- Per-host ignored check IDs that are additive with global disabled checks, including the ability to ignore profile expectation findings without disabling them globally.
- Rendered audits, authenticated same-page raw HTML, open-tab comparisons, and explicit URL A/B comparisons resolve hostname profiles independently; URL A and URL B can use different profiles based on their final fetched hostname.
- Domain-profile storage/model safety caps, normalization/validation, exact-host tests, sidebar dependency checks, public-safe source checks, and a VM runtime test for per-host URL comparison policy.
- Local-only Rules panel with versioned audit configuration stored in Firefox `browser.storage.local`, including Save and Reset defaults actions.
- Configurable title/meta-description thresholds, oversized-image ratio, and a real-byte image file-size threshold that is evaluated only when byte size is known.
- Required-signal policy for title, meta description, canonical, H1, typed structured data, hreflang, and HTTPS.
- Per-check enable/disable controls and Critical/Warning/Info severity overrides with score/severity counters recalculated after policy is applied.
- Custom audit policy is applied consistently to rendered audits, same-page raw HTML audits, open-tab comparisons, and explicit URL A/B comparisons.
- Image file-size policy findings synchronize into the global Issues list and score after Resource Timing or the explicit image network check provides a known size.
- Automated custom-rule normalization, validation, policy, scoring, image-limit, and sidebar dependency/layout tests; sidebar script references are checked for existence and dependency-safe order.
- Dedicated Performance panel with DOM element count/depth, observed request count, known transferred/encoded bytes, third-party request/byte summary, and resource-type breakdown.
- Navigation Timing diagnostics for TTFB, DNS, connection, TLS, response download, DOMContentLoaded, load event, protocol, redirect count, and HTML transfer size.
- Largest-resource and slowest-resource rankings plus a bounded Resource Timing table for up to 1,000 subresource entries.
- Performance resource classification for HTML, JavaScript, CSS, images, fonts, Fetch/XHR, media, and other resources, with first-party/third-party attribution.
- Automated tests for resource classification, byte accounting, third-party detection, navigation timing, DOM depth/counting, ranking, unknown-size handling, and safety caps.
- Local web-performance hint engine with a likely initial-viewport LCP candidate, CLS/layout-shift risk hints, missing image dimensions, above-fold lazy-loading warnings, and large below-fold eager-loading warnings.
- Inspection of preload/modulepreload, preconnect, prefetch, DNS-prefetch, render-blocking stylesheet/script candidates, observed font resources, and font preload/crossorigin relationships without additional network requests.
- Automated tests for viewport classification, reserved dimensions, image loading hints, LCP candidate selection, resource hints, render-blocking rules, font preload matching, and deterministic issue summaries.
- JavaScript asset inventory with inline/external split, async/defer/module/nomodule flags, first-party/third-party attribution, Resource Timing size/duration matching, exact duplicate URL detection, and third-party script grouping by host.
- CSS asset inventory with external stylesheet and inline-style counts, media/disabled state, first-party/third-party attribution, Resource Timing size/duration matching, and duplicate stylesheet detection.
- Known-size warnings for JavaScript resources at least 250 KiB and CSS resources at least 100 KiB, without fetching assets again or guessing unknown cross-origin/cache sizes.
- Automated tests for asset URL normalization, loading flags, inline-source privacy, timing matching, duplicate detection, third-party grouping, size thresholds, and 1,000-item safety caps.
- Third-party Resource Timing audit grouped by hostname with request counts, known/unknown byte coverage, resource-type mix, and bounded sample URLs.
- Local heuristic classification of common analytics, tag-manager, widget, advertising, and CDN resource hosts without external lookups or additional requests.
- Automated tests for exact/subdomain matching, local pattern classification, unknown-size preservation, bounded samples, deterministic ordering, and category summaries.
- Dedicated Content panel with visible/DOM/hidden word counts, a 25,000-node safety cap, and an explicitly heuristic low-word-count warning.
- On-demand raw HTML versus rendered DOM text-count comparison, reusing the documented same-page authenticated source fetch only when requested.
- Hidden-content technical signals for `hidden`, `aria-hidden`, `display:none`, `visibility:hidden`, and `content-visibility:hidden`, with bounded element samples and no spam-intent inference.
- Language consistency checks across HTML `lang`, `Content-Language`, and self-referencing hreflang declarations.
- Heading-quality diagnostics for H1–H6 counts, missing/multiple H1, empty headings, and skipped heading levels.
- Automated tests for Unicode word counting, excluded non-content tags, hidden-content accounting, visibility styles, node caps, language consistency, heading quality, and thin-content heuristics.
- Dedicated Security panel with HTTPS transport status, active/passive mixed-content detection, and severity-ranked findings.
- Read-only capture and inspection of Content-Security-Policy, CSP Report-Only, Strict-Transport-Security, X-Frame-Options, Referrer-Policy, Permissions-Policy, and X-Content-Type-Options from the current main-document response.
- Security heuristics for CSP framing/script policy, HSTS max-age, modern `frame-ancestors` fallback, `unsafe-url` referrer policy, and `nosniff` validation.
- Third-party script inventory reused from the existing local asset audit, without refetching scripts or executing page code.
- Automated tests for HSTS/CSP parsing, report-only CSP, framing protection, referrer/nosniff diagnostics, mixed-content classification/deduplication, and third-party script inventory.
- Link audit intelligence for generic anchor text, identical anchor text pointing to different URLs, and different anchor texts pointing to the same URL.
- Live bounded link-check progress with cancellation plus a 1,000-entry in-memory session cache; explicit re-checks bypass the cache.
- Dedicated Links filters for broken, redirecting, external, nofollow, sponsored, UGC, and generic-anchor links while retaining the existing 250-URL / six-concurrent-request safety limits.
- Automated tests for anchor normalization, generic-anchor matching, anchor/URL consistency grouping, and network/rel-based link filtering.
- Versioned local snapshot history with up to 50 named, timestamped snapshots per normalized URL, plus a selectable baseline snapshot.
- Snapshot management in the Compare panel with save, compare, baseline, delete, JSON export, and bounded JSON import/merge actions.
- Automatic migration of legacy single `snapshot:<URL>` records into the new history format after the new history has been written successfully.
- Snapshot imports use a 5 MiB file-size limit, validate the import envelope, merge by snapshot ID, and keep all data in Firefox local extension storage.
- Automated tests for snapshot history ordering/caps, baseline behavior, import/export merging, malformed import rejection, and legacy migration.
- Version-2 regression snapshots with bounded summaries for metadata, indexability, heading structure, links, images, schema, hreflang, HTTP metadata, performance, and security while keeping version-1 snapshot comparisons compatible.
- Regression rules for newly blocked/noindex pages, HTTP errors, broken checked links/images, invalid JSON-LD, image SEO issues, security-header weakening, mixed content, schema/hreflang/heading changes, and SEO score movement.
- Performance regression detection for request count, known bytes, third-party load, DOM size/depth, TTFB, and navigation duration using both absolute and relative thresholds to suppress normal measurement noise.
- On-demand link/image failure counts are compared only when both snapshots contain results from the corresponding network check, preventing missing checks from becoming false zero-error baselines.
- Automated regression tests covering snapshot-v2 capture, noindex/indexability changes, checked-network gating, image/schema/HTTP/security regressions, performance noise thresholds, improvements, direction summaries, and version-1 compatibility.
- Current-tab versus another-open-tab comparison using the existing rendered-page content script with no extra page request.
- Explicit URL A versus URL B raw-HTML comparison using credential-free/no-referrer GET requests, redirects, a 12-second timeout, and a 2 MiB HTML response limit per URL.
- Side-by-side page comparison for metadata, status, score, robots/indexability, headings, links and rel states, images, schema, hreflang, SEO/security response headers, and issue counts/IDs.
- Diff-only page comparison mode with bounded detail inventories capped at 80 items and 160 characters per detail value.
- URL comparison preserves HTML error responses such as 404/500 pages, rejects non-HTML responses, uses the final URL as the parsed document base, and never executes fetched page scripts in the comparison parser.
- Page comparison context resets rendered tab results when the current tab or its URL changes, including SPA navigation.
- Automated tests for page-comparison summaries, deterministic/equal diffs, security and SEO headers, stable issue IDs, bounded inventories, text limits, and schema-type normalization.

### Fixed

- Detached Inspector recovery now validates that a persisted popup still contains the live extension page after an add-on reload/update; stale blank popups are removed and recreated instead of being focused forever. Regression coverage reproduces the blank-window state explicitly.
- Restored sidebar startup after the page-comparison update by backing the compare UI's active-tab context with the canonical sidebar `state.tabId` instead of an undefined global.
- Added an automated Node `vm` sidebar startup smoke test so the page-comparison script chain is executed together and this class of runtime `ReferenceError` is caught by CI.

## [0.2.0] - 2026-09-05

### Added

- Development roadmap from v0.2.0 through v1.0.0 covering indexability diagnostics, performance/security inspection, regression workflows, multi-page auditing, crawler-lite functionality, and platform-neutral e-commerce SEO checks.
- Dedicated Indexability panel with a single Indexable / Noindex / Blocked / Canonicalized / Redirected / Error verdict and explicit reasons.
- Redirect-chain capture for the current navigation, including hop status codes, loop detection, excessive-chain warnings, and final URL reporting.
- On-demand canonical target status checking with credential-free requests and final URL reporting.
- Canonical diagnostics for cross-domain, protocol, hostname, trailing-slash, and query-string mismatches.
- Raw HTML versus rendered DOM indexability comparison for robots directives, canonical changes, and verdict changes.
- Automated tests for indexability precedence, robots conflicts, canonical diagnostics, redirects, loop detection, robots.txt integration input, and raw/rendered differences.
- Automatic, cached `robots.txt` discovery with Googlebot-specific Allow/Disallow evaluation, matching-rule reporting, parser warnings, redirects, HTTP status, and sitemap declaration discovery.
- Bounded on-demand sitemap scanning with sitemap-index traversal, URL membership checks, `lastmod`, gzip support when available, cancellation, document/byte limits, and scan timeouts.
- Pure robots.txt and sitemap XML parsers with automated tests for wildcard/end-anchor rules, user-agent precedence, Allow/Disallow precedence, XML entities, CDATA, sitemap indexes, and URL membership.
- Desktop/mobile SERP preview with local title/description pixel-width estimates, line-capacity diagnostics, truncation warnings, and decoded URL breadcrumb presentation.
- Automated tests for SERP width estimation, missing metadata, truncation detection, device profiles, and URL presentation.
- Dedicated Hreflang panel with local tag validation, self-reference and `x-default` checks, duplicate detection, and normalized language/region/script handling.
- Bounded on-demand hreflang target validation for HTTP status, redirects, reciprocal references, `noindex`, canonical mismatches, and target-level diagnostics.
- Local HTML head-signal parser for canonical, hreflang, and robots metadata, with automated parser and hreflang validation tests.
- On-demand image network audit with credential-free HEAD checks and bounded Range fallback for file size/status discovery, redirects, broken resources, and response Content-Type.
- Image optimization ranking by estimated wasted bytes using intrinsic dimensions, rendered dimensions, and page device-pixel ratio, with format and size-source reporting.
- Automated tests for image format detection, byte/waste calculations, DPR handling, Content-Length/Content-Range parsing, Range fallback decisions, URL deduplication, and result ranking.
- Advanced canonical-chain tracing with exact HTTP redirect hops, 4xx/5xx target diagnostics, multi-hop canonical detection, canonical/redirect loop detection, target canonical parsing, bounded depth, byte/time limits, and cancellation.
- Advanced canonical diagnostics are shown directly in the Indexability panel with source/target URLs, stable-target state, canonical path, redirect path, per-level HTTP/canonical details, and severity-ranked issues.
- Automated tests for stable/self canonicals, multi-hop chains, source/target loops, 4xx/5xx targets, exact redirect statuses, multiple target canonicals, depth caps, timeouts, cancellations, and network failures.
- Dual-target sitemap membership scanning for both the current source URL and its canonical URL in one bounded, cancellable sitemap-index traversal.
- Sitemap conflict diagnostics for source URLs that are present while non-canonical, redirecting, noindex/robots-blocked, or returning HTTP errors, with separate source/canonical sitemap and `lastmod` reporting.
- Automated tests for sitemap target normalization, self-canonical deduplication, healthy membership, non-canonical/redirect/noindex/blocked/error conflicts, and false-positive prevention.
- Cancellable bounded link-status checking with a 250-URL cap, six concurrent requests, per-request timeout, total scan timeout, and credential-free/no-referrer requests.
- Explicit internal-link-to-redirect detection and summary counts in the Links panel, with partial results retained when a scan is cancelled or times out.
- Automated tests for link URL normalization/deduplication/caps, HTTP state classification, result mapping, internal redirect counting, and network-failure handling.

## [0.1.0] - 2026-09-05

### Added

- Firefox Manifest V3 sidebar extension with toolbar access.
- Local page audit covering title, description, canonical, robots directives, X-Robots-Tag, viewport, HTML language, and HTTP status.
- SEO issue scoring with critical/warning filtering.
- Heading tree and in-page element highlighting.
- Link inventory with internal/external classification, rel flags, missing-label detection, and on-demand credential-free `HEAD` status checks.
- Image inspection for alt attributes, explicit dimensions, intrinsic/rendered dimensions, loading mode, and image source.
- JSON-LD parsing, schema type discovery, invalid structured-data detection, and basic Product schema checks.
- Hreflang, Open Graph, and Twitter/X card metadata inspection.
- Rendered DOM versus raw HTML comparison.
- Per-URL local snapshots and regression diffs.
- JSON report export and copyable issue list.
- Local-first privacy model with no telemetry, analytics, backend, or remote runtime code.
- Dependency-free static checks, privacy checks, unit tests, deterministic XPI build, package verification, pinned Mozilla `web-ext` validation in CI, and GitHub Actions CI.

### Changed

- Minimum Firefox version is 142.0 so the declared data-collection manifest key is supported without Mozilla validator compatibility warnings.

### Fixed

- Added the Firefox Manifest V3 add-on ID required by Mozilla validation.
- Added an explicit Firefox `data_collection_permissions` declaration of `none`, matching the local-only privacy model.
- Made XPI generation cross-environment deterministic by using ZIP STORE entries instead of zlib-dependent deflate output.
- CI now updates generated `dist/` artifacts automatically on non-main branch pushes after all validation steps pass.
