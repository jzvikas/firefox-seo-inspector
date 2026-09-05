# Crawler Lite

Crawler Lite is a small, explicit, local crawl for technical SEO spot checks. It is intentionally bounded and is not intended to replace a full-site crawler.

## Starting a crawl

Open the **Crawler** tab and choose:

- **Seed URL** — defaults to the page currently inspected by the sidebar.
- **Maximum URLs** — default 100, hard maximum 250.
- **Maximum depth** — default 2, hard maximum 3. The seed is depth 0.
- **Same hostname only** — enabled by default. Exact hostname matching is used, so `www.example.com` and `example.com` are different hosts.

Disabling **Same hostname only** allows discovered HTTP/HTTPS links on other hosts to enter the crawl, but the same URL/depth/request-size/time limits still apply.

## Network limits and privacy

Every crawl request is made only after **Start crawl** is clicked. Requests:

- use `GET`;
- omit cookies and HTTP authentication credentials;
- send no referrer;
- follow redirects;
- use no more than six concurrent requests;
- have a 12-second timeout per URL;
- accept at most 2 MiB of HTML per URL;
- are capped by the configured URL limit, never above 250 URLs;
- are capped by the configured depth limit, never above depth 3.

HTML is parsed locally by the extension. Scripts from fetched crawl pages are not executed by the crawl parser.

## Pause, resume, and cancel

**Pause** stops workers from scheduling more crawl requests. Requests already in flight may finish and their results remain visible.

**Resume** continues from the current breadth/depth frontier.

**Cancel** sends a scan-specific cancellation message to the background fetch layer and aborts in-flight requests for that crawl. Partial results remain available for inspection/export.

Closing/reloading the sidebar while a crawl is active also asks the background layer to cancel that crawl.

## URL handling

- Only HTTP and HTTPS URLs are crawlable.
- URL fragments are removed before deduplication.
- Query strings are retained because parameterized URLs may have distinct SEO behavior.
- Redirect final URLs are recorded separately from requested URLs.
- Exact final redirect targets are added to the seen set to reduce later duplicate scheduling.

## Collected fields

For each successfully parsed HTML page the crawl records:

- requested URL and final URL;
- crawl depth and first discovery source URL;
- HTTP status and redirect state;
- title;
- meta description;
- first H1;
- canonical;
- robots meta summary;
- indexability verdict;
- SEO score and issue counts;
- HTTP link count.

The crawler uses the same Custom Rules and exact-hostname Domain Profile policy resolution as URL A/B comparison, so different hosts can be evaluated under different local policies.

## Findings and duplicates

The result view can highlight/filter:

- failed/non-HTML/oversized/timed-out URLs;
- HTTP error pages;
- redirecting URLs;
- URLs with SEO issues;
- duplicate normalized titles;
- duplicate normalized descriptions;
- duplicate normalized H1 values.

## Export

CSV and JSON export are explicit actions. Crawl data remains in the sidebar's in-memory state unless exported. The extension does not upload crawl results.
