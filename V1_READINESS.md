# v1.0 readiness audit

This document is the release-readiness view for Firefox SEO Inspector. It complements `ROADMAP.md`: the roadmap describes product direction, while this file separates repository-verifiable gates from manual Firefox sign-off that cannot be proven by source inspection alone.

## Repository-verified release gates

The following controls are already implemented on `main` and should remain green for every v1 candidate:

- **Firefox-first, local/private runtime** — no telemetry, analytics, accounts, backend service, remote runtime scripts, or browsing-data upload are part of the product model.
- **Audited manifest permissions** — CI allowlists `scripting`, `storage`, `tabs`, and `webRequest`, limits host access to HTTP/HTTPS, rejects optional permissions and `externally_connectable`, and keeps the restrictive extension CSP/data-collection declaration.
- **Public-source privacy scan** — repository CI rejects sensitive/project-specific source patterns.
- **Release/version consistency** — package, Firefox manifest, README current-release value, and CHANGELOG release headings are checked together.
- **Automated test suite** — unit/runtime regression tests run in CI.
- **Mozilla validation** — `web-ext lint` runs in CI and is release-blocking.
- **Deterministic build** — CI rebuilds the XPI, verifies contents/checksum, and fails when committed `dist/` differs from the deterministic source build.
- **Source-to-XPI consistency** — committed XPI must be reproducible from the same source tree.
- **Manual smoke-test procedure** — `FIREFOX_SMOKE_TEST.md` defines the release-blocking Firefox workflow and sign-off fields.
- **Release procedure** — `RELEASE.md` defines clean-checkout validation, deterministic build verification, manual Firefox sign-off, version/changelog order, tagging, and checksum traceability.
- **Theme preference** — System / Light / Dark is implemented with local extension storage only and adds no permission or remote dependency.
- **Network-heavy workflow safety** — bounded requests, cancellation, timeout handling, stale-result protection, and credential-free external checks are implemented; authenticated same-page raw HTML comparison remains the documented exception.
- **Sidebar performance safeguards** — lazy panel rendering, on-demand heavy audits, bounded inventory rendering, and page-scoped memory release are implemented and regression-tested.

## Remaining v1 blockers

These items should stay open until they are implemented or explicitly signed off with evidence:

1. **Accessible keyboard navigation** — main Inspector section navigation still needs proper tab semantics, roving focus, Arrow/Home/End behavior, and corresponding regression coverage.
2. **UX state consistency** — audit all primary panels for clear empty, loading, retry/error, disabled, and completed states; normalize terminology where the same concept currently has multiple labels.
3. **Responsive sidebar sign-off** — verify narrow and wide Firefox sidebar layouts manually after the current theme/navigation work, including overflow and focus visibility.
4. **Facts vs warnings vs recommendations** — visually and semantically distinguish observed page facts from rule failures and advisory recommendations across primary workflows.
5. **Unhandled runtime error sign-off** — automated error boundaries exist, but the v1 candidate must complete the Browser Console portion of `FIREFOX_SMOKE_TEST.md` without uncaught extension errors or unhandled promise rejections in normal workflows.
6. **Test-coverage audit** — confirm every audit-rule module and the redirect/indexability/network parser paths have direct automated coverage; add missing tests rather than relying only on integration/runtime tests.
7. **Feature documentation completeness** — consolidate the implemented feature surface and keyboard behavior into user-facing documentation before tagging v1.0.0.
8. **Manual release candidate smoke test** — run the documented Firefox smoke checklist against the exact release-candidate commit/XPI and record Firefox version, OS, commit/tag, checksum, automated gate result, and accepted limitations.
9. **Final public-source review** — perform the release-candidate privacy/source review and confirm no private domains, customer identifiers, credentials, local paths, or project-specific rules are present.

## Release decision rule

Do not call v1.0.0 complete merely because CI is green. A release candidate is ready only when:

- every repository-verifiable gate above is green from a clean checkout;
- every remaining blocker is either completed or intentionally deferred outside v1 with a documented rationale;
- the exact candidate XPI passes the manual Firefox smoke checklist;
- the candidate XPI checksum and source commit/tag are recorded together;
- the public repository has been reviewed for private/project-specific information.

If source code changes after manual sign-off, rebuild the deterministic XPI and repeat all affected automated and manual checks before tagging the release.
