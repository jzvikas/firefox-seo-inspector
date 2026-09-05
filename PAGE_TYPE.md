# Page-type detection

Firefox SEO Inspector classifies page purpose locally from technical signals already available to the extension. The detector is platform-neutral: it does not contain shop-specific domains, customer rules, CMS-specific class names, or remote lookups.

## Output

The detector returns one primary page type:

- Homepage
- Product
- Category / listing
- Article / blog
- Search results
- CMS / generic content
- 404 / error page

It can also attach independent traits:

- Faceted / filtered
- Pagination

Keeping traits separate avoids losing the main page purpose. For example, a category URL with `?brand=...&page=2` remains **Category / listing** and is additionally marked **Faceted / filtered** and **Pagination**.

Each result includes **high**, **medium**, or **low** confidence plus a bounded evidence list. The Overview card exposes those signals so the classification is inspectable rather than opaque.

## Signals

Signals currently include:

- main-document HTTP error status;
- root URL path for homepage detection;
- JSON-LD types such as `Product`, `CollectionPage`, `ItemList`, `Article`, `BlogPosting`, `NewsArticle`, and `SearchResultsPage`;
- `og:type` values for product/article pages;
- schema.org Product and ItemList microdata;
- semantic `<article>` usage together with substantial visible text;
- search-like URL paths and common search query parameters;
- generic search controls (`input[type=search]` and `role=search`);
- common filter/sort query-parameter shapes;
- common pagination query/path shapes and `rel=next` / `rel=prev`.

Explicit search URL/schema signals take precedence over Product/Article entities that may legitimately appear inside search-result cards. HTTP errors have the highest precedence.

## Where it is used

- The active page shows type, confidence, traits, and evidence in **Overview**.
- Rendered current-tab audits include page-type data in the report.
- Explicit raw URL comparisons and Crawler Lite classify the locally parsed fetched document without executing its scripts.
- Multi-tab and Crawler Lite summaries carry page type, confidence, and traits into filtering/search plus CSV/JSON exports.

## Privacy and performance

Page-type detection itself makes no network request and stores no additional persistent browsing history. It evaluates the URL, response status already known to the extension, structured-data facts, and a small bounded set of DOM signals. Crawler/URL comparison network behavior is unchanged and remains governed by their existing documented limits.

The result is a technical heuristic, not a claim about how a search engine labels or understands the page.
