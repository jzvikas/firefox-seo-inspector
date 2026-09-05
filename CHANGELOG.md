# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

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
- Hreflang, Open Graph, and Twitter/X card inspection.
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
