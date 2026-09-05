# SEO Inspector

SEO Inspector is a local-first technical SEO inspector for Firefox. It opens in a separate movable and resizable browser window so the inspected website keeps its normal width, and it does not send inspected page data to a third-party service.

## Current release: v0.2.0

### Inspector window workflow

- Click the extension toolbar icon to open a separate Inspector window.
- The Inspector window can be moved, resized, minimized, maximized, and positioned independently from the website window.
- Opening the toolbar action again focuses the existing Inspector window instead of creating duplicate windows.
- The Inspector follows the active tab in normal Firefox windows while ignoring its own extension window.
- The generated unsigned package uses the neutral filename `seo-inspector-<version>.xpi` with a matching `.sha256` checksum.

### Indexability and redirects

- Single Indexability verdict: **Indexable / Noindex / Blocked / Canonicalized / Redirected / Error** with explicit reasons.
- HTTP status, meta robots, X-Robots-Tag, canonical, robots.txt, and navigation redirect state combined in one view.
- Current-navigation redirect chain with exact hop status codes, final URL, loop detection, and excessive-chain warnings.
- Raw HTML versus rendered-DOM comparison for indexability-relevant fields.

### Canonical

- Canonical relation and mismatch diagnostics for cross-domain, protocol, hostname, trailing slash, and query parameters.
- On-demand advanced canonical-chain tracing.
- Canonical target HTTP status and exact HTTP redirect hops.
- 4xx/5xx target detection, multiple target canonicals, multi-hop canonical chains, canonical loops, and redirect loops.
- Bounded/cancellable tracing with per-target byte and timeout limits.

### robots.txt and sitemap

- Automatic `/robots.txt` discovery with HTTP status and parser warnings.
- Googlebot-specific Allow/Disallow evaluation with matching user-agent, rule, and checked path.
- Sitemap declaration discovery from robots.txt.
- Bounded/cancellable sitemap and sitemap-index traversal.
- Source URL and canonical URL membership checks in one scan.
- `lastmod` reporting when present.
- Warnings when a sitemap contains a redirecting, noindex/blocked, non-canonical, or error URL.

### SERP and hreflang

- Google-style desktop and mobile SERP previews.
- Local title/description pixel-width estimation and likely-truncation diagnostics.
- Hreflang syntax/duplicate/self-reference/`x-default` validation.
- On-demand hreflang target HTTP status, redirects, reciprocal references, noindex, and canonical mismatch checks.

### Links and images

- Internal/external link inventory, rel flags, and empty-anchor checks.
- Bounded/cancellable HTTP link checking with broken/redirect/unknown summaries and explicit internal-link-to-redirect counts.
- Image alt, dimensions, intrinsic/rendered size, loading, and source inspection.
- On-demand image HTTP status, redirects, Content-Type/format, and file-size checks.
- HiDPI-aware oversized-image ranking by estimated wasted bytes.

### Existing inspection tools

- Heading tree with in-page highlighting.
- JSON-LD parsing with schema type detection and invalid JSON warnings.
- Open Graph and Twitter/X card metadata inspection.
- JSON report export and copyable issue list.
- No telemetry, analytics, remote runtime scripts, accounts, or backend.

## Unreleased v0.3 work

### Performance overview

- DOM element count and maximum DOM depth.
- Observed page request count and known transferred/encoded bytes.
- Request/byte breakdown for HTML, JavaScript, CSS, images, fonts, Fetch/XHR, media, and other resources.
- First-party versus third-party request and known-byte summary.
- Navigation Timing details including TTFB, DNS, connect/TLS, response download, DOMContentLoaded, load event, protocol, redirects, and HTML size.
- Largest-resource and slowest-resource rankings.
- Bounded Resource Timing table with URL, type, start time, duration, host, and size.
- Unknown transfer sizes remain explicitly unknown instead of being guessed.

### Web performance hints

- Likely LCP candidate from a clearly labeled initial-viewport heuristic with in-page highlighting.
- CLS/layout-shift risk hints for rendered images, video, and iframes that do not reserve dimensions/aspect ratio.
- Missing image-dimension detection.
- Above-the-fold `loading="lazy"` warnings and large far-below-fold eager-image warnings.
- Inspection of preload/modulepreload, preconnect, prefetch, and DNS-prefetch links.
- Conservative render-blocking candidate detection for stylesheets and synchronous head scripts.
- Observed font-resource and font-preload matching, including missing `crossorigin` warnings.
- The hint engine reads only the current DOM and already-collected local Performance API data; it performs no extra network requests.

### JavaScript and CSS audit

- Script inventory with total, external/inline split, async/defer/module/nomodule flags, first-party/third-party classification, timing, and known size.
- Duplicate external JavaScript URL detection.
- Third-party scripts grouped by hostname with script count and known bytes.
- Large JavaScript warnings at 250 KiB or more when Resource Timing exposes a size.
- External stylesheet inventory plus inline `<style>` count, media/disabled state, origin, timing, and known size.
- Duplicate stylesheet URL detection and large CSS warnings at 100 KiB or more when size is known.
- Inline JavaScript/CSS source is not copied into the asset inventory; only metadata and character counts are retained.
- Asset inventories are capped at 1,000 entries per category and never refetch resources just to obtain size.

### Third-party resources

- Groups observed third-party Resource Timing entries by hostname.
- Shows request count, known bytes, unknown-size coverage, resource-type mix, and bounded sample URLs per domain.
- Uses local heuristics to identify common analytics, tag-manager, widget, advertising, and CDN hosts; unrecognized hosts remain explicitly unclassified.
- Uses only already-collected local Resource Timing data and makes no additional requests.

### Content inspection

- Dedicated Content tab with visible word count, DOM text count, hidden-text count, and a 25,000-node scan safety cap.
- Generic low-word-count warning below 150 visible words; it is explicitly presented as a heuristic, not a search-engine rule.
- On-demand raw HTML versus rendered DOM text-count comparison.
- Technical hidden-content signals for `hidden`, `aria-hidden`, `display:none`, `visibility:hidden`, and `content-visibility:hidden`, with bounded element samples.
- HTML `lang`, `Content-Language`, and self-referencing hreflang consistency checks.
- Heading-quality summary with H1–H6 counts, missing/multiple H1, empty headings, and skipped levels.
- Hidden-content signals are not labeled as spam and do not attempt to infer intent.

### Security inspection

- Dedicated Security tab with current transport protocol, HTTPS status, active/passive mixed-content counts, and severity-ranked findings.
- Read-only main-document capture of enforced/report-only CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, and X-Content-Type-Options using the existing `webRequest` permission.
- CSP checks distinguish report-only policy, `frame-ancestors`, broad script tokens, and X-Frame-Options fallback behavior.
- HSTS parsing reports `max-age`, `includeSubDomains`, and `preload`; HSTS is not falsely required on HTTP pages.
- Mixed-content inspection combines current DOM references with existing local Resource Timing and separates active/blockable resources from passive media.
- Third-party script inventory reuses the already-collected asset audit and performs no additional requests or page-code execution.
- Cookie inspection is intentionally not enabled yet because it would require expanding permissions; the current Security feature adds no new permission.

### Link audit intelligence

- Live progress and cancellation for the existing bounded 250-URL link-status scan, with six concurrent credential-free requests, 10-second per-request timeout, and a 30-second total scan limit.
- Successful link results are reused from an in-memory session cache capped at 1,000 URLs; **Check again** explicitly bypasses that cache and performs a fresh network check.
- Generic-anchor detection for deliberately small, local heuristics such as “click here”, “read more”, and “learn more”.
- Detection of identical normalized anchor text pointing to multiple URLs and multiple normalized anchor texts pointing to the same URL.
- Dedicated filters for broken, redirecting, external, nofollow, sponsored, UGC, and generic-anchor links.
- Anchor analysis works from already-extracted page link facts and does not send anchor text or page content to an external service.

## Unreleased v0.4 work

### Snapshot history

- Multiple named, timestamped snapshots are stored locally for each exact normalized HTTP/HTTPS URL.
- Each URL can retain up to 50 snapshots, ordered newest first.
- Any saved snapshot can be selected as the baseline and compared with the current page.
- The Compare panel supports saving, comparing, setting/clearing a baseline, and deleting individual snapshots.
- Snapshot history can be exported as JSON and imported with a 5 MiB file-size safety limit; imports are validated and merged by snapshot ID.
- Legacy single-snapshot `snapshot:<URL>` storage is migrated automatically into the versioned history format after the replacement history is safely written.
- Snapshot history uses only the existing local extension storage permission and never uploads snapshots.

### Regression detection

- New version-2 snapshots retain stable summaries for metadata, indexability, heading structure, links, images, schema, hreflang, HTTP metadata, performance, and security without storing full resource inventories.
- The Compare panel classifies detected differences as **regressions**, **improvements**, or other changes and shows before/after values with their audit category.
- Critical regressions include newly non-indexable pages, healthy HTTP responses becoming errors, new broken checked links/images, new invalid JSON-LD, active mixed content, and newly introduced noindex directives.
- Security-header state regressions, image SEO issue increases, redirect-link increases, and SEO score drops are called out separately from neutral content changes.
- Performance regressions use conservative absolute-plus-relative thresholds so normal timing/resource noise is not reported as a deployment regression. TTFB, navigation duration, request count, known bytes, third-party load, and DOM size/depth are covered.
- Link/image broken-state comparisons are made only when the corresponding on-demand network check was run in both snapshots; missing checks never become invented zero-error baselines.
- Existing version-1 snapshots remain comparable for their older metadata/count fields. Missing version-2 performance/security/network fields are skipped instead of generating false regressions.
- Heading and hreflang snapshot inventories are bounded before local storage, while snapshot history keeps the existing 50-record-per-URL limit.

### Page comparison

- **Current tab vs another open tab** compares the current rendered audit against another open HTTP/HTTPS tab using that tab's existing content script, without an additional page fetch.
- **URL A vs URL B** performs an explicit raw-HTML comparison with credentials omitted, no referrer, redirects followed, a 12-second timeout, and a 2 MiB HTML limit per URL.
- URL comparison retains HTML 4xx/5xx responses so real error-page metadata, indexability, headings, schema, headers, and issues can be compared instead of being reduced to a generic fetch error.
- Side-by-side rows cover metadata, HTTP status, SEO score, robots/indexability, heading count/H1/outline, link totals/rel states/targets, images, schema, hreflang, SEO/security response headers, and issue counts/IDs.
- **Diff only** is enabled by default and can be toggled off to inspect equal rows too.
- Detail inventories are capped at 80 entries with individual text capped at 160 characters so very large pages do not flood or freeze the Inspector window.
- Raw URL HTML is parsed locally with the fetched page's final URL as the document base. The parser does not execute scripts from fetched comparison pages.
- Tab-comparison results are cleared when the current tab or its URL changes, preventing a stale comparison from surviving normal or SPA navigation.

### Custom rules

- Dedicated **Rules** tab with local-only configuration stored in `browser.storage.local`.
- Configurable title/meta-description length thresholds, oversized-image ratio, and real-byte image file-size limit.
- Required-signal toggles for title, description, canonical, H1, typed structured data, hreflang, and HTTPS.
- Every listed check can be enabled/disabled independently and assigned a Critical/Warning/Info severity override.
- Custom policy recalculates issue counters and SEO score and is applied consistently to rendered, raw-source, open-tab, and URL A/B audits.
- The image byte-size rule enters the global Issues list only when a size is actually known from Resource Timing or the explicit image network check.
- **Reset defaults** removes the local rule record and restores built-in policy. See [CUSTOM_RULES.md](CUSTOM_RULES.md).

### Domain profiles

- Dedicated **Profiles** tab for local-only rules attached to the current exact hostname.
- Global Rules remain the base; a matching enabled profile overrides only explicitly configured thresholds/required signals and leaves other global settings intact.
- Per-host overrides cover title/description thresholds, oversized-image ratio, image byte-size limit, and required title/description/canonical/H1/schema/hreflang/HTTPS behavior.
- Expected structured-data types and hreflang values can be declared per hostname; missing expectations create profile-specific warnings.
- Individual checks, including profile expectation checks, can be ignored only for the current hostname without disabling them globally.
- Profiles use exact hostname matching only; wildcard matching and automatic subdomain inheritance are intentionally excluded.
- Rendered pages, authenticated raw-source audits, open-tab comparisons, and URL A/B comparisons resolve the profile for the URL being audited. URL A and URL B can therefore use different profiles.
- Profiles are capped at 200 local records and never ship with repository-defined hostnames. See [DOMAIN_PROFILES.md](DOMAIN_PROFILES.md).

## Unreleased v0.5 work

### Multi-tab audit

- Dedicated **Tabs** panel audits already-open HTTP/HTTPS tabs on demand without crawling or refetching those pages.
- Scans at most 100 tabs with up to six concurrent content-script audits, live progress, cancellation, and a 15-second safety timeout per tab audit.
- Collects URL, HTTP status, title, description, first H1/H1 count, canonical, robots, indexability, SEO score, issue counts, and detected page type.
- Detects normalized duplicate titles, descriptions, and H1 values across available tabs and visibly annotates duplicate rows.
- Supports search, page-type/indexability/issue/duplicate/availability filters, configurable sorting, and CSV/JSON export.
- Tabs without an injected content script are reported as unavailable instead of being silently refetched; reloading the tab makes it eligible for a later scan.
- Multi-tab results stay in Inspector-window memory unless the user explicitly exports them.

### Crawler Lite

- Dedicated **Crawler** panel starts from the current page by default or a user-entered HTTP/HTTPS seed URL.
- Same-host crawling is enabled by default; configurable hard limits allow at most 250 URLs and depth 3, with URL normalization/deduplication and six concurrent requests.
- Live progress plus Pause/Resume/Cancel; Cancel aborts in-flight requests for that crawl while preserving partial results.
- Each crawler GET omits credentials and referrer, follows redirects, has a 12-second timeout, and accepts at most 2 MiB of HTML per URL. Fetched scripts are never executed.
- Collects status, title, description, H1, canonical, robots, indexability, score, issue counts, and page type, then detects redirects/errors and duplicate title/description/H1 values.
- Search/filter/sort and CSV/JSON export are local to the Inspector window. See [CRAWLER_LITE.md](CRAWLER_LITE.md).

### Page-type detection

- Platform-neutral primary types: Homepage, Product, Category/listing, Article/blog, Search, CMS/generic content, and 404/error.
- Independent Faceted/filter and Pagination traits so URL-state signals do not overwrite the primary content type.
- High/medium/low confidence plus bounded human-readable evidence.
- Uses local HTTP status, URL, JSON-LD, Open Graph, microdata, semantic DOM, search controls, and pagination signals without extra page-type network requests.
- Page type is visible in Overview and carried through raw/URL comparisons, Tabs, Crawler Lite, filters, sorting, and CSV/JSON exports. See [PAGE_TYPE.md](PAGE_TYPE.md).

### Product-page checks

- Dedicated **Product** panel for Product/ProductGroup JSON-LD quality, commerce fields, canonical/variant relationships, breadcrumbs, and availability handling.
- Checks name, image, SKU, GTIN, brand, Offer/AggregateOffer price and currency, availability, aggregate rating, and review signals without pretending every optional identifier/review field is mandatory.
- Detects missing/multiple/cross-origin/unexpected product canonicals and generic variant-like URL/canonical relationships, including ProductGroup pages that canonicalize to one nested variant.
- Shows out-of-stock/discontinued signals and warns when an out-of-stock product is also `noindex`, while keeping stock-handling guidance advisory rather than forcing one strategy.
- Product analysis is platform-neutral, performs no additional request, is included in rendered/raw/URL/crawler reports, and adds no browser permission. See [PRODUCT_PAGE.md](PRODUCT_PAGE.md).

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the planned path through v1.0.0. Richer global/URL/selector ignore-rule management remains open; the next Top-15 e-commerce milestone is **Faceted navigation and pagination checks**.

## Install for development

Requires Firefox 142 or newer.

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**.
4. Select `src/manifest.json`.
5. Open an HTTP/HTTPS page and click the extension toolbar icon. SEO Inspector opens in a separate movable/resizable window.
6. After source changes, use **Reload** for the temporary extension in `about:debugging`; you do not need to select the manifest again.

A prebuilt unsigned package is also kept in `dist/` as `seo-inspector-<version>.xpi`. Stable Firefox generally requires signing for permanent installation; the source can always be loaded temporarily for development.

## Permissions and network behavior

The extension requests access to HTTP and HTTPS pages because its job is to inspect the selected browser tab and, only when required by a feature, check related URLs. The `tabs` permission is also used to keep the detached Inspector window associated with the active tab in normal browser windows. The Inspector window itself is ignored as an audit target. The `webRequest` permission is used read-only to capture SEO-relevant response metadata, redirect hops, and selected main-document security response headers.

External link, image, canonical, hreflang, sitemap, crawler-lite, and explicit URL-to-URL comparison checks are bounded and use credential-free requests without a referrer. Fan-out scans provide cancellation and total/per-request timeouts. The link checker also maintains a bounded in-memory session cache for successful results; explicit re-checks bypass it. `robots.txt` discovery is a single size/time-bounded request and is cached briefly. URL A/B comparison fetches only the two user-entered HTTP/HTTPS documents, with a 2 MiB limit and 12-second timeout per document. Crawler Lite is a separate explicit bounded crawl with a 250-URL/depth-3 hard cap and the limits documented above.

The Performance panel reads the browser's local Navigation Timing and Resource Timing entries plus current DOM geometry/markup for performance hints, asset inspection, and third-party grouping. It does not make additional network requests. Browser privacy/caching rules can hide transfer sizes for some resources; those values remain marked unknown rather than being estimated. Third-party service categories are local heuristics rather than network lookups. LCP and render-blocking entries in this panel are explicitly presented as local heuristics/candidates rather than measured Core Web Vitals claims.

The Content panel performs a bounded local DOM scan and does not make network requests during normal inspection. Hidden-content output is limited to technical visibility signals and bounded element labels; it does not infer spam or intent.

The Security panel reads current-page DOM/resource references plus selected security headers already observed on the main document. It does not fetch external security databases or issue extra security-audit requests. Cookie Secure/HttpOnly/SameSite inspection is not enabled, so the extension does not request cookie access for this feature.

The Product panel reuses the already-extracted page URL, canonical/robots facts, page-type result, and parsed JSON-LD. It performs no additional network request and does not add permissions. Product fields and findings stay in the local Inspector report.

Snapshot history, regression summaries, custom audit rules, and domain profiles are stored only in `browser.storage.local`. Snapshot history is capped at 50 records per exact normalized URL. Regression snapshots store bounded summaries rather than full performance/resource inventories, and on-demand network status counts are included only when those checks actually ran. Custom rules contain policy values only. Domain profiles contain the hostname plus local policy/expectation values and are capped at 200 records. None of this data is uploaded by the extension.

The **Tabs** multi-tab audit reuses the existing content scripts in already-open HTTP/HTTPS tabs. It does not make a fallback page request when a tab cannot be analyzed. Results are held only in Inspector-window memory until explicitly exported to CSV or JSON.

Crawler Lite fetches only URLs selected by its bounded queue, stores results in Inspector-window memory, and does not upload the crawl dataset. Same-host is the safe default; disabling it is an explicit user action and does not remove the URL/depth/request/byte caps.

**Compare raw HTML** is intentionally different: when explicitly requested from Compare or Content, it fetches only the current page using that page's browser credentials so authenticated source remains comparable with the rendered DOM. The result remains local. **URL A vs URL B** is a separate credential-free comparison and never uses page credentials. See [PRIVACY.md](PRIVACY.md).

## Development

No runtime or development npm dependencies are required.

```bash
npm run lint
npm test
npm run build
npm run verify:build
```

Run the complete local gate with:

```bash
npm run check
```

The build is deterministic. `npm run build` creates `dist/seo-inspector-<version>.xpi` and its SHA-256 checksum.

## Repository policy

- Public source must not contain credentials, private domains, local filesystem paths, customer/project identifiers, or private infrastructure details.
- Runtime code must not load remote JavaScript or use `eval`/`new Function`.
- User-visible changes must update `CHANGELOG.md`.
- The committed `dist/` package must match the source for the same version; CI rebuilds and commits stale generated artifacts on non-main branch pushes.
- CI runs static checks first, then unit tests, Mozilla `web-ext` validation, deterministic build verification, and source-to-XPI consistency checks.

## License

MIT. See [LICENSE](LICENSE).
