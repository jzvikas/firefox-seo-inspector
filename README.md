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

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the planned path from v0.3.0 through v1.0.0. The next milestone focuses on performance/resources, content diagnostics, link-audit improvements, and security headers.

## Install for development

Requires Firefox 142 or newer.

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**.
4. Select `src/manifest.json`.
5. Click the toolbar icon or open **View → Sidebar → Firefox SEO Inspector**.

A prebuilt unsigned package is also kept in `dist/`. Stable Firefox generally requires Mozilla signing for permanent installation; the source can always be loaded temporarily for development.

## Permissions and network behavior

The extension requests access to HTTP and HTTPS pages because its job is to inspect the active page and, only when required by a feature, check related URLs. The `webRequest` permission is used read-only to capture SEO-relevant response metadata and redirect hops.

External link, image, canonical, hreflang, and sitemap checks are bounded and use credential-free requests without a referrer. Fan-out scans provide cancellation and total scan timeouts. `robots.txt` discovery is a single size/time-bounded request and is cached briefly.

The Performance panel reads the browser's local Navigation Timing and Resource Timing entries. It does not make additional network requests. Browser privacy/caching rules can hide transfer sizes for some resources; those values remain marked unknown rather than being estimated.

**Compare raw HTML** is intentionally different: when explicitly requested, it fetches only the current page using that page's browser credentials so authenticated source remains comparable with the rendered DOM. The result remains local. See [PRIVACY.md](PRIVACY.md).

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
