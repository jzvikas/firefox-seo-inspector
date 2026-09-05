# Firefox release smoke-test checklist

Use this checklist before publishing a stable Firefox SEO Inspector release. Run it against a clean Firefox profile with no development-only preferences or unrelated extensions that could affect requests, page content, storage, or sidebar behavior.

## Preconditions

- Check out the exact release commit or tag.
- Run `npm ci`.
- Run `npm run check` and require a clean pass.
- Build the XPI from that same source with `npm run build`.
- Confirm `npm run verify:build` succeeds.
- Load the generated XPI in Firefox for the manual checks below.
- Confirm the tested XPI version matches `package.json`, `manifest.json`, README, and CHANGELOG.

## Installation and basic lifecycle

- [ ] Extension installs without Firefox warnings beyond normal unsigned-development messaging when applicable.
- [ ] Toolbar/sidebar entry is present and opens correctly.
- [ ] Sidebar renders without visible errors on first open.
- [ ] Closing and reopening the sidebar preserves only documented local state.
- [ ] Reloading the current tab does not leave stale results from the previous document.
- [ ] Closing an audited tab releases its tab-specific state.
- [ ] Extension can be disabled and re-enabled without corrupting stored settings or snapshots.

## URL and permission boundaries

- [ ] Normal `http://` page can be inspected.
- [ ] Normal `https://` page can be inspected.
- [ ] Restricted Firefox pages fail gracefully and explain that the page is unsupported.
- [ ] Unsupported schemes such as `file:`, `about:`, `moz-extension:`, `view-source:`, and similar non-web targets do not trigger broad or unexpected access.
- [ ] No permission prompt appears for capabilities not documented by the project.
- [ ] No network request is made to a project backend, telemetry endpoint, analytics service, or remote runtime-script host.

## Core page audit

On a representative indexable HTML page:

- [ ] URL, HTTP status, title, meta description, H1, canonical, robots directives, headings, links, images, schema, hreflang, and security headers render without errors.
- [ ] Indexability verdict is shown and reasons are understandable.
- [ ] Facts, warnings, and recommendations are visually distinguishable.
- [ ] Empty sections show a deliberate empty state instead of blank or broken UI.
- [ ] Loading states resolve when analysis completes.
- [ ] Recoverable request/parser failures appear as contained errors and do not break the rest of the sidebar.

## Indexability and network-heavy checks

- [ ] Noindex page is classified correctly.
- [ ] Redirected URL shows its redirect chain and final URL.
- [ ] Broken/error URL is handled without an uncaught extension error.
- [ ] Canonical validation handles redirects and error targets.
- [ ] robots.txt analysis reports allowed/blocked behavior and malformed/inaccessible responses safely.
- [ ] Sitemap lookup is bounded and cancellable.
- [ ] Hreflang validation is bounded and cancellable.
- [ ] Batch link checking can be cancelled and leaves the sidebar usable.
- [ ] Image network inspection can be cancelled and leaves the sidebar usable.
- [ ] Crawler Lite respects host, URL-count, and depth limits and supports pause/resume/cancel.
- [ ] Network-heavy requests do not send credentials cross-origin.
- [ ] The explicit same-page **Compare raw HTML** workflow behaves as documented for authenticated same-page comparison.

## Performance and large-page behavior

- [ ] Sidebar opens promptly on a large DOM page.
- [ ] Large link and image inventories remain scrollable and interactive while analysis runs.
- [ ] Heavy checks run incrementally or on demand rather than blocking initial render.
- [ ] Cancelling an audit stops additional work promptly.
- [ ] Repeating audits across several tabs does not show obvious runaway memory growth or stale cross-tab data.

## Regression and local workflows

- [ ] Create, rename, select as baseline, export, import, and delete snapshots.
- [ ] Snapshot diff correctly shows at least one changed metadata field and one changed issue/result.
- [ ] Compare current tab with another tab and verify diff-only mode.
- [ ] Custom rules can be changed locally and affect the relevant audit result.
- [ ] Domain profile settings apply only to the intended hostname.
- [ ] Restart Firefox and confirm documented persistent local settings/snapshots remain available.

## Multi-page and e-commerce workflows

- [ ] Multi-tab audit scans open HTTP/HTTPS tabs and exports CSV/JSON.
- [ ] Duplicate title/description/H1 detection works across scanned tabs.
- [ ] Crawler Lite discovers internal broken/redirecting links and duplicate metadata.
- [ ] Product page detection is platform-neutral and does not depend on private/vendor-specific selectors.
- [ ] Product schema, canonical, breadcrumb, variant, and out-of-stock hints render without errors.
- [ ] Category/listing, faceted-navigation, and pagination checks render without errors on representative pages.

## Privacy and local data

- [ ] Browser devtools/network inspection shows no telemetry, analytics, account, backend, or browsing-data upload traffic from the extension.
- [ ] Stored extension data contains only documented local settings, snapshots, rules, profiles, and session/cache data.
- [ ] No inspected page content is transmitted to third parties by extension code.
- [ ] Exported files contain only the data explicitly selected by the user.
- [ ] Repository/build artifacts contain no private domains, customer identifiers, credentials, local paths, or project-specific configuration.

## Firefox console and error checks

During all scenarios above:

- [ ] No uncaught extension exceptions appear in Browser Console.
- [ ] No unhandled promise rejections appear in Browser Console.
- [ ] No repeated error loop occurs after navigation, tab close, cancellation, or sidebar reopen.
- [ ] Expected network/parser failures are handled and surfaced only as controlled diagnostics.

## Release sign-off

Record the following in the release notes or release checklist used by the maintainer:

- Firefox version tested.
- Operating system tested.
- Release commit/tag.
- XPI checksum produced by the deterministic build.
- `npm run check` result.
- Mozilla `web-ext` validation result.
- Manual smoke-test result and any accepted known limitations.

A stable release should not be published if any mandatory check above exposes an uncaught extension error, privacy regression, permission expansion, source/XPI mismatch, broken core workflow, or non-deterministic build.