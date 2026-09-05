# Privacy

Firefox SEO Inspector is designed to work locally in the browser.

## What is not collected

The extension has no telemetry, analytics, advertising, account system, remote logging, crash collector, or backend API. It does not intentionally transmit inspected page content to the extension author or to another service.

## Data stored locally

A page snapshot is stored only when the user clicks **Save snapshot**. Snapshots are stored with Firefox extension local storage and contain SEO-oriented page facts used for later comparison. They can be removed by clearing the extension's storage or uninstalling the extension.

HTTP response metadata for the current browser session is held in Firefox `storage.session`, which is memory-backed and cleared when the browser session ends.

## External SEO checks

Link, image, canonical, hreflang, and sitemap checks contact the URLs that must be inspected. These requests:

- are initiated only when the relevant check is requested;
- omit credentials;
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

## Raw HTML comparison

**Compare raw HTML** is an explicit exception to the credential-free external-check policy. It performs a GET of the current page using the current page's browser credentials so authenticated source is comparable with the rendered page. It does not fetch an unrelated target, runs only when the user asks for the comparison, and the returned HTML remains local to the browser extension.
