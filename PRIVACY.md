# Privacy

Firefox SEO Inspector is designed to work locally in the browser.

## What is not collected

The extension has no telemetry, analytics, advertising, account system, remote logging, crash collector, or backend API. It does not intentionally transmit inspected page content to the extension author or to another service.

## Data stored locally

A page snapshot is stored only when the user clicks **Save snapshot**. Snapshots are stored with Firefox extension local storage and contain SEO-oriented page facts used for later comparison. They can be removed by clearing the extension's storage or uninstalling the extension.

Custom audit rules are stored only in Firefox `browser.storage.local` on the current browser. They contain thresholds, required-signal toggles, disabled check IDs, and severity overrides. They are not uploaded, do not contain page content, and do not modify the inspected website. Resetting Rules removes the saved custom-rule record and restores built-in defaults.

Domain profiles are also stored only in `browser.storage.local`. A profile contains the exact hostname entered implicitly from the page being inspected, an optional local label, local policy overrides, expected schema/hreflang values, and ignored check IDs. Profiles are not uploaded, do not modify the inspected website, and are capped at 200 records. The public repository contains no saved user profile records or configured personal/customer hostnames.

HTTP response metadata for the current browser session is held in Firefox `storage.session`, which is memory-backed and cleared when the browser session ends.

## Local storage schema migrations

Persistent local data uses a versioned migration coordinator. The coordinator stores one small metadata record, `storageSchema:v1`, containing only the supported schema version and the time a migration completed. It does not contain page URLs, domain-profile hostnames, profile labels, snapshot contents, or inspected page content.

When adopting an older supported storage layout, the extension normalizes existing Rules and Profiles locally and can merge legacy `snapshot:*` records into the current versioned snapshot history. Replacement data is written before any legacy key is removed, and the global schema marker is written last. If a migration is interrupted, the marker is not advanced and the operation is safe to retry.

Migration status returned inside the extension contains only schema versions and bounded counts. It is not sent to a server or analytics service. If an older extension build encounters a local schema version newer than it supports, it does not downgrade that storage. Auditing may remain readable, while Rules/Profile/Snapshot mutation controls become read-only to prevent rollback data loss. The migration and downgrade behavior is documented in [docs/STORAGE_MIGRATIONS.md](docs/STORAGE_MIGRATIONS.md).

## Content-script recovery and the scripting permission

The extension requests Firefox's `scripting` permission in addition to the existing HTTP/HTTPS host permissions. It is used only to restore the extension's own packaged content-script bundle in the currently inspected HTTP/HTTPS tab when that tab no longer has a live Inspector content-script connection, for example after the extension itself is reloaded or updated while the page remains open.

Before any recovery injection, the Inspector sends a local ping to the tab. If the content script answers, nothing is injected. If the ping fails, Firefox `scripting.executeScript` is asked to inject only the JavaScript files already declared in this extension's own manifest. The content bootstrap is idempotent so a later normal manifest injection does not register a second Inspector runtime.

This recovery action:

- does not fetch or execute remote code;
- does not add a new host permission beyond the existing HTTP/HTTPS scope;
- does not inject into `about:`, `moz-extension:`, local-file, or other unsupported URL schemes;
- does not bypass Firefox-protected or restricted pages when Firefox refuses extension injection;
- does not upload page content or runtime errors;
- keeps bounded, sanitized runtime error summaries only in the Inspector window's in-memory state for the current session.

If Firefox blocks injection, the UI reports a page-access/restricted-page state instead of claiming that a normal page reload will necessarily fix it.

## External SEO checks

Link, image, canonical, hreflang, sitemap, crawler-lite, and explicit URL-to-URL comparison checks contact the URLs that must be inspected. These requests:

- are initiated only when the relevant check is requested, except the documented automatic single `robots.txt` discovery for the active page;
- omit credentials for unrelated/external target checks;
- omit the referrer;
- follow redirects where the check needs the final destination;
- use per-request timeouts;
- use hard URL/document/byte/depth limits where applicable;
- use bounded concurrency for fan-out checks;
- provide cancellation and total scan timeouts for fan-out or multi-document scans.

Because checking a URL necessarily contacts that URL's server, the remote server may observe the request in its normal access logs.

### Link checks

Link status checks use `HEAD`, are capped at 250 unique HTTP/HTTPS URLs, use at most six concurrent requests, have a 10-second per-request timeout and a 30-second total scan timeout, and can be cancelled. Partial results remain visible after cancellation or timeout.

### Image checks

Image checks use `HEAD` first. When size information is unavailable or HEAD is unsupported, a bounded `Range: bytes=0-0` GET may be used to discover response/file-size metadata without intentionally downloading the full image. The scan is capped and cancellable.

### Canonical and hreflang checks

Canonical-chain and hreflang target checks fetch only the target HTML needed for local metadata analysis. They are bounded by target/depth, bytes, request timeout, total scan timeout, and cancellation controls.

### Sitemap checks

Sitemap checks fetch and parse sitemap XML locally. Sitemap traversal is bounded by document count, per-document bytes, total decoded bytes, concurrency, request timeout, and total scan timeout, and can be cancelled.

### robots.txt

`robots.txt` discovery is automatic for the active page. It is a single credential-free request with a response-size limit, request timeout, and short-lived in-memory cache. Sitemap declarations found in robots.txt remain local unless the user starts a sitemap membership scan.

## Page comparison

**Current tab vs another open tab** uses the extension's already-injected content script to analyze the rendered DOM in the selected open HTTP/HTTPS tab. It does not issue an additional page request solely for that comparison.

**URL A vs URL B** is an explicit on-demand raw-HTML comparison. Each URL is fetched with credentials omitted and no referrer, with redirects followed, a 12-second request timeout, and a 2 MiB HTML response limit per URL. Non-HTML responses are rejected. HTML error responses such as 404 or 500 pages may still be analyzed so their actual SEO state can be compared. Returned HTML is parsed locally and fetched page scripts are not executed by the comparison parser.

When local domain profiles exist, each compared final URL resolves its own exact-hostname profile locally before the audit is evaluated. Profile lookup does not issue a network request and does not expose the stored profile to the compared site.

Page comparison results are kept in the sidebar's in-memory state; they are not uploaded or sent to the extension author.

## Multi-tab audit

**Scan open tabs** is an explicit local action. It reads the browser's existing HTTP/HTTPS tab list and asks the extension content script already present in each selected tab for the same rendered-page audit used by the normal sidebar. It does not crawl links and does not refetch the tab URLs solely for the multi-tab audit.

The scan is capped at 100 HTTP/HTTPS tabs, processes at most six tab audits concurrently, provides progress and cancellation, and uses a 15-second safety timeout for each content-script audit. A tab whose content script is unavailable is reported as unavailable instead of being fetched as a fallback. Reloading such a tab can inject the extension content script for a later scan.

Multi-tab rows and duplicate-title/description/H1 summaries remain in the sidebar's in-memory state. They are not persisted automatically and are not uploaded. CSV or JSON files are created only when the user explicitly chooses an export action.

## Crawler Lite

**Crawler Lite** is an explicit on-demand local crawl. It starts from the current page by default, or from a user-entered HTTP/HTTPS seed URL. Same-host crawling is enabled by default; the user may explicitly disable that restriction, but the hard crawl limits still apply.

Crawler requests use `GET` with credentials omitted, no referrer, redirects followed, and cache bypass. Each request has a 12-second timeout and a 2 MiB HTML response limit. Non-HTML responses are not parsed as pages. Returned HTML is parsed locally and fetched scripts are not executed.

The crawler is capped at 250 URLs, depth 3, and six concurrent requests. URL normalization and deduplication prevent repeated fetches of the same normalized URL. Pause stops scheduling new work while keeping current results; Resume continues queued work. Cancel aborts in-flight crawler requests for that scan and preserves partial results.

Crawler rows, duplicate-title/description/H1 summaries, and discovered-link state remain in sidebar memory. They are not persisted or uploaded automatically. CSV/JSON files are created only when the user explicitly exports them. See [CRAWLER_LITE.md](CRAWLER_LITE.md).

## Page-type detection

Page-type detection itself performs no network request and stores no new persistent browsing record. It evaluates technical facts already available to the current audit: the inspected URL, already-known main-document status, structured-data/Open Graph facts, and a small platform-neutral set of DOM signals such as semantic article/search elements, schema.org microdata, and `rel=next` / `rel=prev`.

The result contains a primary heuristic type, confidence, optional faceted/pagination traits, and a bounded evidence list. It is kept inside the current audit/report and is reused by Multi-tab and Crawler Lite summaries. CSV/JSON exports include that result only when the user explicitly exports those reports. Page-type detection adds no browser permission and does not contact a classification service. See [PAGE_TYPE.md](PAGE_TYPE.md).

## Raw HTML comparison

**Compare raw HTML** is a separate explicit exception to the credential-free external-check policy. It performs a GET of the current page using the current page's browser credentials so authenticated source is comparable with the rendered page. It does not fetch an unrelated target, runs only when the user asks for the comparison, and the returned HTML remains local to the browser extension.