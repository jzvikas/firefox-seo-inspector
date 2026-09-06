# Firefox SEO Inspector feature guide

Firefox SEO Inspector is a Firefox-first, local/private technical SEO inspector. It runs in the browser, has no telemetry, analytics, account, backend, or remote runtime dependency, and does not upload inspected page data.

This guide describes the implemented feature surface intended for the stable v1 release. Where a check needs network access, it is explicit, bounded, and designed to avoid sending browser credentials unless the UI specifically documents an authenticated same-page comparison.

## Daily inspection workflow

Open an HTTP/HTTPS page and click the extension toolbar button. The Inspector opens in a separate Firefox window and follows the active normal browser tab. Primary sections support keyboard tab navigation with Arrow keys plus Home/End. System, Light, and Dark themes are stored only in local extension storage.

Result cards distinguish three meanings in text and semantics, not color alone:

- **Observed** — page facts detected by the extension.
- **Rule warning / Critical rule failure** — rule-based problems.
- **Recommendation** — advisory guidance rather than a detected failure.

Panels expose consistent empty, loading, disabled, error/retry, and completed states. Heavy scans are on demand and cancellable where they fan out.

## Indexability and redirects

The Indexability view combines HTTP status, meta robots, X-Robots-Tag, canonical, robots.txt, and current-navigation redirects into one verdict: Indexable, Noindex, Blocked, Canonicalized, Redirected, or Error. Reasons are shown explicitly.

Redirect inspection records exact 301/302/303/307/308 hops, final URL, loop detection, excessive chains, and internal links pointing to redirects. Raw HTML versus rendered DOM comparison can expose JavaScript changes to indexability-relevant signals.

## Canonical checks

Canonical diagnostics cover missing or multiple canonicals, cross-domain targets, protocol/hostname/trailing-slash/query differences, target HTTP failures, redirecting canonical targets, multi-hop canonical chains, canonical loops, and redirect loops.

Advanced canonical tracing is on demand, bounded by time/size limits, and cancellable.

## robots.txt and sitemap

The extension discovers `/robots.txt`, reports response/parser problems, evaluates the current path against Googlebot-style rules, and shows the matching user-agent/rule. Sitemap declarations are discovered from robots.txt.

Sitemap checks traverse bounded sitemap indexes, look for the source and canonical URL, report `lastmod` when present, and warn when sitemap entries redirect, are blocked/noindex, are non-canonical, or fail.

## SERP, headings, metadata, and hreflang

Desktop/mobile SERP previews use local title/description width estimation and likely-truncation hints. Heading inspection provides the H1-H6 tree, missing/multiple H1 checks, empty headings, skipped levels, and in-page highlighting.

Hreflang validation covers syntax, duplicates, self-reference, `x-default`, target HTTP status, redirects, reciprocal references, noindex, and canonical mismatch.

## Links and images

Link inventory includes internal/external classification, rel flags, empty/generic anchors, duplicate anchor relationships, and dedicated filters. The on-demand link checker uses bounded concurrency, cancellation, per-request timeout, and a total scan limit. Results can identify broken links, redirects, and internal links pointing to redirects.

Image inspection covers alt text, dimensions, intrinsic/rendered size, loading behavior, source information, missing dimensions, oversized rendering, and estimated wasted bytes. On-demand network checks add HTTP status, redirect, Content-Type/format, and actual file-size information.

## Performance and resources

Performance inspection reports DOM size/depth, request count, known transferred bytes, resource-type breakdown, first-party/third-party split, Navigation Timing details, and bounded largest/slowest resource tables.

Local performance hints include likely LCP candidate heuristics, CLS/layout-shift risks, image loading/dimension issues, preload/preconnect/prefetch/DNS-prefetch inspection, conservative render-blocking candidates, and font-loading hints.

JavaScript/CSS inspection reports external/inline counts, async/defer/module flags, duplicate resource URLs, third-party script groups, large known-size assets, stylesheet state, and timing/size information already exposed by browser Performance APIs. Resources are not refetched solely to obtain sizes.

## Content and security

Content inspection includes visible/raw text counts, hidden-text technical signals, a conservative low-word-count heuristic, language consistency, and heading quality. Hidden-content signals are technical observations and are not labeled as spam or intent.

Security inspection covers HTTPS, active/passive mixed content, CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, and third-party scripts. Cookie inspection is intentionally excluded because it would require broader permissions.

## Snapshots, regressions, and comparison

Named snapshots are stored locally per normalized URL with a bounded history. A snapshot can be chosen as baseline, deleted, exported/imported, and compared with the current page.

Regression comparison covers metadata, indexability, headings, links/images when comparable network checks exist, schema, hreflang, HTTP headers/status, performance, and security. Differences are classified as regressions, improvements, or other changes.

Page comparison supports current tab versus another open tab and explicit URL A versus URL B raw-HTML comparison. Comparison rows cover SEO metadata, indexability, status, headings, links, images, schema, hreflang, headers, security, page type, score, and issues. Detail inventories are bounded to protect responsiveness.

## Custom rules and domain profiles

Custom Rules are local-only and can adjust title/description thresholds, image thresholds, required signals, enabled checks, and severity overrides.

Domain Profiles apply exact-hostname local overrides and expectations without committing hostname-specific configuration to the repository. Profiles can define thresholds, required signals, expected structured-data/hreflang values, and hostname-specific ignored checks.

## Multi-tab audit and Crawler Lite

The Tabs panel audits up to 100 already-open HTTP/HTTPS tabs without crawling/refetching them. It collects core SEO facts, indexability, score, issues, and page type; detects duplicate title/description/H1 values; and supports local filtering, sorting, CSV, and JSON export.

Crawler Lite performs an explicit same-host crawl by default with hard URL/depth limits, URL normalization/deduplication, bounded concurrency, pause/resume/cancel, per-request limits, progress, duplicate metadata detection, and CSV/JSON export. Scripts from fetched pages are never executed.

## Platform-neutral e-commerce checks

Page-type detection recognizes Homepage, Product, Category/listing, Article/blog, Search, CMS/generic content, and 404/error pages, with independent Faceted/filter and Pagination traits plus confidence/evidence.

Product checks cover Product/ProductGroup structured data, name/image/SKU/GTIN/brand/price/currency/availability/rating/review signals, breadcrumbs, canonical/variant relationships, and out-of-stock guidance without enforcing platform-specific rules.

Category/listing checks cover canonical behavior, product-link count, empty/thin listing hints, pagination consistency, and faceted navigation. Facet analysis classifies filter/sort/pagination/tracking/session-like parameters and reports canonical/robots/index-bloat risks. Pagination analysis detects current/neighbor pages, page-2+ canonical behavior, duplicate metadata patterns across audited pages, and broken pagination links.

## Privacy, permissions, and packaging

The extension intentionally remains local/private: no telemetry, analytics, account, backend, remote runtime script, browsing-data upload, or repository-shipped private customer/domain configuration.

The Firefox manifest is CI-audited to keep the implemented permission set constrained to `scripting`, `storage`, `tabs`, and `webRequest`, with HTTP/HTTPS host access only. Optional permissions and externally-connectable entry points are rejected by CI.

Release CI runs tests, privacy/static checks, Mozilla `web-ext lint`, builds the XPI twice for byte-for-byte reproducibility, verifies SHA-256, and verifies that the packaged XPI file list and contents exactly match `src/`.

## Keyboard use

Primary Inspector sections implement tablist semantics. Move among section tabs with **Left/Right** or **Up/Down**, jump to the first or last section with **Home/End**, and use normal **Tab / Shift+Tab** navigation for controls within the selected panel.

## Release and troubleshooting docs

- `README.md` — installation, development, implemented release history, privacy overview, and troubleshooting.
- `CUSTOM_RULES.md` — local rule configuration.
- `DOMAIN_PROFILES.md` — hostname-specific local profiles.
- `CRAWLER_LITE.md` — crawler limits and behavior.
- `PAGE_TYPE.md` — platform-neutral page-type detection.
- `PRODUCT_PAGE.md` — product-page audit semantics.
- `PRIVACY.md` — runtime privacy and permissions.
- `FIREFOX_SMOKE_TEST.md` — manual Firefox release-candidate checklist.
- `RELEASE.md` — clean-checkout, deterministic build, XPI/checksum, sign-off, and tagging procedure.
- `V1_READINESS.md` — current release-gate status and remaining manual blockers.
