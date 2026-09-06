# v1.0 readiness audit

This document is the release-readiness view for Firefox SEO Inspector. It complements `ROADMAP.md`: the roadmap describes product direction, while this file separates repository-verifiable gates from manual Firefox sign-off that cannot be proven by source inspection alone.

## Repository-verified release gates

The following controls are already implemented on `main` and should remain green for every v1 candidate:

- **Firefox-first, local/private runtime** — no telemetry, analytics, accounts, backend service, remote runtime scripts, or browsing-data upload are part of the product model.
- **Audited manifest permissions** — CI allowlists `scripting`, `storage`, `tabs`, and `webRequest`, limits host access to HTTP/HTTPS, rejects optional permissions and `externally_connectable`, and keeps the restrictive extension CSP/data-collection declaration.
- **Public-source privacy scan** — repository CI rejects sensitive/project-specific source patterns.
- **Final public-source review** — `RELEASE_SOURCE_REVIEW.md` records the repository-level v1 source/privacy review and its PASS result; any later source changes must be re-reviewed before release.
- **Release/version consistency** — package, Firefox manifest, README current-release value, and CHANGELOG release headings are checked together.
- **Automated test suite** — unit/runtime regression tests run in CI.
- **Direct audit coverage gate** — CI discovers audit-rule modules and requires direct automated coverage, including canonical/redirect, indexability, robots/sitemap, network parser, page-comparison, cancellation, and timeout paths.
- **Mozilla validation** — `web-ext lint` runs in CI and is release-blocking.
- **Deterministic build** — CI builds the XPI twice and byte-compares both outputs, verifies the SHA-256 checksum, and rejects non-reproducible packaging.
- **Source-to-XPI consistency** — CI inspects the generated XPI and requires its complete file list and file contents to exactly match `src/`; the verified XPI and checksum are retained as a workflow artifact for release-candidate testing.
- **Manual smoke-test procedure** — `FIREFOX_SMOKE_TEST.md` defines the release-blocking Firefox workflow and sign-off fields.
- **Release procedure** — `RELEASE.md` defines clean-checkout validation, deterministic build verification, manual Firefox sign-off, version/changelog order, tagging, and checksum traceability.
- **Feature documentation** — `FEATURES.md` consolidates the implemented v1 user-facing feature surface, keyboard behavior, privacy/permission boundaries, e-commerce semantics, and links to focused workflow documentation.
- **Theme preference** — System / Light / Dark is implemented with local extension storage only and adds no permission or remote dependency.
- **Accessible keyboard navigation** — the 20 primary Inspector sections use tablist/tab/tabpanel semantics, roving focus, synchronized selected/hidden state, and Arrow/Home/End keyboard activation with regression coverage.
- **Consistent UI states** — primary panels share explicit empty, loading, error/retry, disabled, and complete state semantics with accessible live/busy behavior and regression coverage.
- **Facts vs warnings vs recommendations** — primary results distinguish observed facts, rule warnings/failures, and advisory recommendations using visible text plus accessible semantics rather than color alone.
- **Network-heavy workflow safety** — bounded requests, cancellation, timeout handling, stale-result protection, and credential-free external checks are implemented; authenticated same-page raw HTML comparison remains the documented exception.
- **Sidebar performance safeguards** — lazy panel rendering, on-demand heavy audits, bounded inventory rendering, and page-scoped memory release are implemented and regression-tested.

## Remaining v1 blockers

These items should stay open until they are completed or explicitly signed off with evidence:

1. **Responsive sidebar sign-off** — verify narrow and wide Firefox sidebar layouts manually after the current theme/navigation work, including overflow and focus visibility.
2. **Unhandled runtime error sign-off** — automated error boundaries exist, but the v1 candidate must complete the Browser Console portion of `FIREFOX_SMOKE_TEST.md` without uncaught extension errors or unhandled promise rejections in normal workflows.
3. **Manual release candidate smoke test** — run the documented Firefox smoke checklist against the exact release-candidate commit/XPI and record Firefox version, OS, commit/tag, checksum, automated gate result, and accepted limitations.
4. **Final roadmap/version alignment** — after the exact release candidate passes all manual gates, update v1 roadmap completion state and promote package/manifest/changelog/README to `1.0.0` in the release-order defined by `RELEASE.md`.

## Release decision rule

Do not call v1.0.0 complete merely because CI is green. A release candidate is ready only when:

- every repository-verifiable gate above is green from a clean checkout;
- every remaining blocker is either completed or intentionally deferred outside v1 with a documented rationale;
- the exact candidate XPI passes the manual Firefox smoke checklist;
- the candidate XPI checksum and source commit/tag are recorded together;
- the public repository has been reviewed for private/project-specific information.

If source code changes after manual sign-off, rebuild the deterministic XPI and repeat all affected automated and manual checks before tagging the release.
