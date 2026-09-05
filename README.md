# Firefox SEO Inspector

Firefox SEO Inspector is a local-first technical SEO sidebar for Firefox. It is designed for fast page-level inspection without sending inspected page data to a third-party service.

## Current release: v0.2.0

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
- JSON-LD parsing with schema type detection, invalid JSON warnings, and basic Product checks.
- Open Graph and Twitter/X card metadata inspection.
- Per-URL local snapshots and regression diffs.
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

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the planned path through v1.0.0. The next Top-15 milestone is multi-snapshot history, followed by richer regression detection and page comparison workflows.

## Install for development

Requires Firefox 142 or newer.

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**.
4. Select `src/manifest.json`.
5. Click the toolbar icon or open **View → Sidebar → Firefox SEO Inspector**.

A prebuilt unsigned package is also kept in `dist/`. Stable Firefox generally requires Mozilla signing for permanent installation; the source can always be loaded temporarily for development.

## Permissions and network behavior

The extension requests access to HTTP and HTTPS pages because its job is to inspect the active page and, only when required by a feature, check related URLs. The `webRequest` permission is used read-only to capture SEO-relevant response metadata, redirect hops, and selected main-document security response headers.

External link, image, canonical, hreflang, and sitemap checks are bounded and use credential-free requests without a referrer. Fan-out scans provide cancellation and total scan timeouts. The link checker also maintains a bounded in-memory session cache for successful results; explicit re-checks bypass it. `robots.txt` discovery is a single size/time-bounded request and is cached briefly.

The Performance panel reads the browser's local Navigation Timing and Resource Timing entries plus current DOM geometry/markup for performance hints, asset inspection, and third-party grouping. It does not make additional network requests. Browser privacy/caching rules can hide transfer sizes for some resources; those values remain marked unknown rather than being estimated. Third-party service categories are local heuristics rather than network lookups. LCP and render-blocking entries in this panel are explicitly presented as local heuristics/candidates rather than measured Core Web Vitals claims.

The Content panel performs a bounded local DOM scan and does not make network requests during normal inspection. Hidden-content output is limited to technical visibility signals and bounded element labels; it does not infer spam or intent.

The Security panel reads current-page DOM/resource references plus selected security headers already observed on the main document. It does not fetch external security databases or issue extra security-audit requests. Cookie Secure/HttpOnly/SameSite inspection is not enabled, so the extension does not request cookie access for this feature.

**Compare raw HTML** is intentionally different: when explicitly requested from Compare or Content, it fetches only the current page using that page's browser credentials so authenticated source remains comparable with the rendered DOM. The result remains local. See [PRIVACY.md](PRIVACY.md).

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

The build is deterministic. `npm run build` creates the current unsigned XPI and its SHA-256 checksum in `dist/`.

## Repository policy

- Public source must not contain credentials, private domains, local filesystem paths, customer/project identifiers, or private infrastructure details.
- Runtime code must not load remote JavaScript or use `eval`/`new Function`.
- User-visible changes must update `CHANGELOG.md`.
- The committed `dist/` package must match the source for the same version; CI rebuilds and commits stale generated artifacts on non-main branch pushes.
- CI runs static checks first, then unit tests, Mozilla `web-ext` validation, deterministic build verification, and source-to-XPI consistency checks.

## License

MIT. See [LICENSE](LICENSE).
