# Privacy

Firefox SEO Inspector is designed to work locally in the browser.

## What is not collected

The extension has no telemetry, analytics, advertising, account system, remote logging, crash collector, or backend API. It does not intentionally transmit inspected page content to the extension author or to another service.

## Data stored locally

A page snapshot is stored only when the user clicks **Save snapshot**. Snapshots are stored with Firefox extension local storage and contain SEO-oriented page facts used for later comparison. They can be removed by clearing the extension's storage or uninstalling the extension.

Custom audit rules are stored only in Firefox `browser.storage.local` on the current browser. They contain thresholds, required-signal toggles, disabled check IDs, and severity overrides. They are not uploaded, do not contain page content, and do not modify the inspected website. Resetting Rules removes the saved custom-rule record and restores built-in defaults.

HTTP response metadata for the current browser session is held in Firefox `storage.session`, which is memory-backed and cleared when the browser session ends.

## External SEO checks

Link, image, canonical, hreflang, sitemap, and explicit URL-to-URL comparison checks contact the URLs that must be inspected. These requests:

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

Page comparison results are kept in the sidebar's in-memory state; they are not uploaded or sent to the extension author.

## Raw HTML comparison

**Compare raw HTML** is a separate explicit exception to the credential-free external-check policy. It performs a GET of the current page using the current page's browser credentials so authenticated source is comparable with the rendered page. It does not fetch an unrelated target, runs only when the user asks for the comparison, and the returned HTML remains local to the browser extension.
