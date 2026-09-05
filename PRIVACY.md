# Privacy

Firefox SEO Inspector is designed to work locally in the browser.

## What is not collected

The extension has no telemetry, analytics, advertising, account system, remote logging, crash collector, or backend API. It does not intentionally transmit inspected page content to the extension author or to another service.

## Data stored locally

A page snapshot is stored only when the user clicks **Save snapshot**. Snapshots are stored with Firefox extension local storage and contain SEO-oriented page facts used for later comparison. They can be removed by clearing the extension's storage or uninstalling the extension.

HTTP response metadata for the current browser session is held in Firefox `storage.session`, which is memory-backed and cleared when the browser session ends.

## Link checks

HTTP link status checks run only after the user clicks **Check HTTP status**. Requests:

- use `HEAD` only;
- omit credentials;
- omit the referrer;
- follow redirects to report the final destination;
- have a timeout;
- are capped and concurrency-limited.

Because checking a link necessarily contacts that link's server, the remote server may observe the request in its normal access logs.

## Raw HTML comparison

**Compare raw HTML** performs an explicit GET of the current page using the current page's browser credentials so the returned source is comparable with the rendered page. This is initiated only by the user and the result remains local.
