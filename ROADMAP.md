# Roadmap

This roadmap keeps Firefox SEO Inspector focused on fast, local-first technical SEO inspection. It is intentionally prioritized by workflow value rather than by the number of checks.

## Principles

- Local-first: no telemetry, analytics, accounts, backend, or browsing-data upload.
- Public-safe source: no private domains, customer identifiers, credentials, local paths, or project-specific configuration committed to the repository.
- Source is authoritative; generated XPI artifacts must match the source for the same version.
- New behavior should be covered by tests before release.
- Prefer actionable diagnostics over raw data dumps.
- Keep the Inspector UI fast enough to use continuously while browsing.

## v0.2.0 — Indexability and technical SEO debugger

Goal: answer “can this URL be indexed, and if not, why?” in one place.

### Indexability engine

- [x] Single Indexability verdict: Indexable / Noindex / Blocked / Canonicalized / Redirected / Error.
- [x] Explain every reason behind the verdict.
- [x] Combine HTTP status, meta robots, X-Robots-Tag, canonical, robots.txt, and redirect state.
- [x] Detect conflicting indexability directives.
- [x] Detect raw HTML vs rendered-DOM changes that alter indexability.

### Canonical validation

- [x] Check canonical target HTTP status.
- [x] Follow and display canonical redirect chains.
- [x] Detect canonical targets returning 4xx/5xx.
- [x] Detect canonical loops and multi-hop canonical chains.
- [x] Detect cross-domain canonicals.
- [x] Detect protocol, hostname, trailing-slash, and query-parameter mismatches.

### Redirect inspection

- [x] Show complete redirect chain.
- [x] Distinguish 301, 302, 303, 307, and 308.
- [x] Show final URL and hop count.
- [x] Detect redirect loops and excessive redirect chains.
- [x] Detect internal links that point to redirects.

### robots.txt

- [x] Discover `/robots.txt` automatically.
- [x] Show robots.txt HTTP status.
- [x] Determine whether the current URL is allowed or blocked.
- [x] Show matching user-agent and rule.
- [x] Discover sitemap declarations.
- [x] Detect malformed or inaccessible robots.txt.

### Sitemap

- [x] Discover sitemap and sitemap indexes.
- [x] Determine whether the current canonical URL is present.
- [x] Warn when a noindex, redirect, non-canonical, or error URL is present in a sitemap.
- [x] Show `lastmod` when available.

### SERP preview

- [x] Google-style desktop preview.
- [x] Google-style mobile preview.
- [x] Title and description pixel-width estimation.
- [x] Truncation warnings.

### Hreflang validation

- [x] Check reciprocal hreflang references.
- [x] Validate hreflang target status codes.
- [x] Detect redirecting, noindex, or non-canonical hreflang targets.
- [x] Validate self-reference and `x-default`.

### Image network checks

- [x] Retrieve actual image transfer/file size.
- [x] Detect broken images.
- [x] Detect image format from response/content type.
- [x] Rank oversized images by estimated waste.

### v0.2.0 done when

- [x] A single page can be diagnosed for indexability without opening external tools.
- [x] External target/network audit requests are bounded, cancellable where they can fan out, and do not send credentials. The explicit same-page **Compare raw HTML** action is the documented exception: it uses the current page's browser credentials so authenticated source remains comparable with the rendered page.
- [x] New rules and parsers have automated tests.
- [x] Mozilla `web-ext` validation has zero errors, warnings, and notices.
- [x] Generated XPI matches source exactly.

## v0.3.0 — Performance, resources, content, and security

Goal: explain what makes a page heavy, fragile, or technically weak.

### Performance overview

- [x] DOM node count and DOM depth indicators.
- [x] Request count and transferred bytes.
- [x] Breakdown by HTML, JS, CSS, images, fonts, and third-party resources.
- [x] Largest resources.
- [x] Slowest resources.
- [x] TTFB and document response timing.
- [x] Resource timing table.

### Web performance hints

- [x] Likely LCP candidate.
- [x] CLS risk hints.
- [x] Missing image dimensions.
- [x] Above-the-fold lazy-loading warning.
- [x] Below-the-fold eager-loading warning.
- [x] Preload, preconnect, prefetch, and DNS-prefetch inspection.
- [x] Render-blocking resource hints.
- [x] Font loading hints.

### JavaScript and CSS

- [x] Script count, inline/external split, async/defer/module flags.
- [x] Duplicate script detection.
- [x] Third-party script grouping.
- [x] Large JavaScript resource warnings.
- [x] Stylesheet count and duplicate stylesheet detection.
- [x] Large CSS resource warnings.

### Third-party resources

- [x] Group requests by third-party domain.
- [x] Show requests and bytes per domain.
- [x] Identify common analytics, tag-manager, widget, ad, and CDN patterns locally.

### Content inspection

- [x] Visible text word count.
- [x] Raw HTML vs rendered text count.
- [x] Thin-content warning.
- [x] Hidden-content heuristics.
- [x] Language consistency checks.
- [x] Heading-tree quality checks and skipped-level warnings.

### Link audit improvements

- [x] Batch link checker with progress and cancellation.
- [x] Cache link results locally for the current session.
- [x] Detect generic anchor text.
- [x] Detect same anchor text pointing to different URLs.
- [x] Detect different anchors pointing to the same URL.
- [x] Dedicated filters for broken, redirecting, external, nofollow, sponsored, and UGC links.

### Security inspection

- [x] HTTPS and mixed-content checks.
- [x] CSP.
- [x] HSTS.
- [x] X-Frame-Options.
- [x] Referrer-Policy.
- [x] Permissions-Policy.
- [x] X-Content-Type-Options.
- [ ] Cookie Secure / HttpOnly / SameSite inspection where browser APIs permit it. Intentionally deferred to avoid expanding cookie permissions for the current feature set.
- [x] Third-party script inventory.
- [ ] Suspicious inline-script heuristics without executing or uploading page code.

### v0.3.0 done when

- [ ] One sidebar view explains the main SEO, performance, and security risks of a page.
- [ ] Expensive checks are on-demand and do not block normal sidebar use.
- [ ] Resource-heavy pages remain responsive while analysis is running.

## v0.4.0 — Regression, comparison, and personal workflows

Goal: make the extension useful after deployments and repeated audits.

### Snapshot history

- [x] Multiple snapshots per URL.
- [x] Snapshot names and timestamps.
- [x] Baseline snapshot.
- [x] Delete and manage snapshots.
- [x] Import/export snapshot data.

### Regression detection

- [x] Title changes.
- [x] Description changes.
- [x] Canonical changes.
- [x] Robots/indexability changes.
- [x] H1 and heading-structure changes.
- [x] Link count and broken-link changes.
- [x] Image issue changes.
- [x] Schema changes.
- [x] Hreflang changes.
- [x] HTTP status/header changes.
- [x] Performance regressions.
- [x] Security-header regressions.

### Compare pages

- [x] Current tab vs another tab.
- [x] URL A vs URL B.
- [x] Side-by-side metadata, headings, links, images, schema, headers, and issues.
- [x] Diff-only view.

### Custom rules

- [x] Local rules configuration.
- [x] Title and description thresholds.
- [x] Image-size threshold.
- [x] Required canonical/H1/meta/schema/hreflang/HTTPS checks.
- [x] Enable/disable individual checks.
- [x] Custom severity overrides.

### Domain profiles

- [x] Local-only profiles per hostname.
- [x] Per-domain thresholds and expected schema/hreflang patterns.
- [x] Per-domain ignore rules.
- [x] Never commit personal domain profiles into the repository.

### Ignore rules

- [ ] Ignore issue globally.
- [ ] Ignore issue for current hostname.
- [ ] Ignore issue for current URL.
- [ ] Ignore selector or URL pattern.
- [ ] Manage and restore ignored issues.

### Export and developer workflows

- [ ] Markdown report export.
- [ ] CSV exports for links, images, headings, and issues.
- [ ] Copy CSS selector.
- [ ] Copy XPath.
- [ ] Copy HTML snippet.
- [ ] Open robots.txt, sitemap, canonical target, or selected link directly.

### UX

- [ ] Compact mode.
- [ ] Pinned/favorite checks.
- [ ] Persistent filters.
- [ ] Search across audit results.
- [ ] Keyboard shortcuts.
- [ ] Command palette.
- [ ] Improved overlay labels and clear-all action.

### v0.4.0 done when

- [x] A before/after deployment audit can be completed from saved local snapshots.
- [x] Repeated personal checks can be customized without modifying source code.
- [x] Custom configuration remains local and public-repository-safe.

## v0.5.0 — Multi-page audit, crawler lite, and e-commerce SEO

Goal: move from single-page inspection to small-site and e-commerce workflows without becoming a cloud crawler.

### Multi-tab audit

- [x] Scan all open HTTP/HTTPS tabs.
- [x] Collect URL, status, title, description, H1, canonical, robots, indexability, and issue counts.
- [x] Detect duplicate titles, descriptions, and H1 values across tabs.
- [x] Sort and filter results.
- [x] CSV/JSON export.

### Crawler Lite

- [x] Crawl internal links from the current page.
- [x] Same-host restriction by default.
- [x] Configurable URL limit.
- [x] Configurable depth limit.
- [x] URL normalization and deduplication.
- [x] Pause/resume/cancel.
- [x] Crawl progress.
- [x] Status, title, description, H1, canonical, robots, and indexability collection.
- [x] Broken-link and redirect discovery.
- [x] Duplicate metadata detection.
- [x] CSV/JSON export.

### Page-type detection

- [x] Homepage.
- [x] Product.
- [x] Category/listing.
- [x] Article/blog.
- [x] CMS/generic content.
- [x] Search page.
- [x] Faceted/filter page.
- [x] Pagination page.
- [x] 404/error page.

### Product-page checks

- [x] Product schema quality.
- [x] Name, image, SKU, GTIN, brand, price, currency, availability, rating, and review checks.
- [x] Product canonical.
- [x] Breadcrumb schema.
- [x] Variant URL/canonical warnings.
- [x] Out-of-stock handling hints.

### Category/listing checks

- [x] Category canonical.
- [x] Product-link count.
- [x] Empty/thin category warning.
- [x] Pagination consistency.
- [x] Faceted navigation detection.

### Faceted navigation

- [x] Classify filter, sort, pagination, tracking, and session-like query parameters.
- [ ] Canonical and robots checks for parameterized URLs.
- [x] Index-bloat risk warning.
- [x] Highlight parameterized internal links.

### Pagination

- [x] Detect current page number and neighboring pagination links.
- [x] Check canonical behavior on page 2+.
- [ ] Detect duplicate title/description patterns across opened/crawled pages.
- [ ] Broken pagination link detection.

### v0.5.0 done when

- [x] A small site section can be audited locally without an external crawler.
- [x] Crawl limits prevent accidental unbounded scans.
- [x] E-commerce checks stay platform-neutral and do not contain private/project-specific rules.

## v1.0.0 — Stable daily-use release

Goal: make the extension dependable enough for continuous personal use.

### Stability

- [ ] Resolve all known critical and high-priority bugs.
- [ ] No unhandled promise rejections or uncaught extension errors in normal workflows.
- [ ] Graceful behavior on restricted Firefox pages and unsupported URL schemes.
- [ ] Cancellation and timeout handling for all network-heavy operations.
- [ ] Local-storage schema/version migration strategy.

### Performance

- [ ] Fast initial sidebar render.
- [ ] Heavy checks run incrementally or on demand.
- [ ] Large DOMs and link/image inventories do not freeze the sidebar.
- [ ] Memory is released when tabs close or audits are cancelled.

### UX polish

- [ ] Consistent navigation and terminology.
- [ ] Clear empty/loading/error states.
- [ ] Accessible keyboard navigation.
- [ ] Light, dark, and system themes.
- [ ] Responsive narrow/wide sidebar layouts.
- [ ] Clear distinction between detected facts, warnings, and recommendations.

### Privacy and permissions

- [ ] Re-audit every permission.
- [ ] Keep the minimum permissions required for implemented features.
- [ ] Privacy documentation matches actual runtime behavior.
- [ ] No telemetry, analytics, backend, remote runtime scripts, or browsing-data upload.
- [ ] Public-source privacy scan remains part of CI.

### Testing and release quality

- [ ] Unit tests for all audit rule modules.
- [ ] Tests for network parsers and redirect/indexability logic.
- [ ] Build reproducibility test.
- [ ] Manifest and privacy scans.
- [ ] Mozilla `web-ext` validation with zero errors/warnings/notices.
- [ ] Source-to-XPI consistency gate.
- [ ] Changelog/version consistency checks.
- [ ] Manual Firefox smoke-test checklist documented.

### Documentation

- [ ] Complete feature documentation.
- [ ] Keyboard-shortcut documentation.
- [x] Custom-rule/profile documentation.
- [ ] Troubleshooting section.
- [ ] Development and release instructions.

### v1.0.0 done when

- [ ] The extension is stable for daily Firefox use.
- [ ] All core workflows can be completed without external services.
- [ ] CI is fully green from clean checkout through XPI verification.
- [ ] Public repository contains no private or project-specific information.

## Backlog after v1.0

These ideas stay intentionally outside the pre-1.0 scope unless they become necessary:

- Larger local crawl datasets and crawl persistence.
- Additional structured-data type-specific validators.
- More advanced accessibility checks that overlap with SEO.
- Historical trend charts from local snapshots.
- Optional Mozilla-signed release automation.
- Additional export formats.

## Explicit non-goals

- Backlink databases.
- Keyword-volume or rank-tracking services.
- Cloud crawling.
- User accounts.
- Telemetry or analytics.
- Uploading inspected page content to a third party.
- Repository-committed private domain or customer configuration.
