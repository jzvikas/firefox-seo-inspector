# Changelog

All notable changes to this project are documented here.

## [Unreleased]

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
- Per-URL local snapshot save/compare workflow.
- JSON export and issue-list clipboard export.
- Local-first privacy model with no telemetry, analytics, backend, or remote runtime code.
- Dependency-free static checks, privacy checks, unit tests, deterministic XPI build, package verification, pinned Mozilla `web-ext` validation in CI, and GitHub Actions CI.

### Changed

- Minimum Firefox version is 142.0 so the declared data-collection manifest key is supported without Mozilla validator compatibility warnings.

### Fixed

- Added the Firefox Manifest V3 add-on ID required by Mozilla validation.
- Added an explicit Firefox `data_collection_permissions` declaration of `none`, matching the local-only privacy model.
- Made XPI generation cross-environment deterministic by using ZIP STORE entries instead of zlib-dependent deflate output.
- CI now updates generated `dist/` artifacts automatically on non-main branch pushes after all validation steps pass.
