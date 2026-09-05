# Firefox SEO Inspector

Firefox SEO Inspector is a local-first technical SEO sidebar for Firefox. It is designed for fast page-level inspection without sending page data to a third-party service.

## Current features

- SEO health score with critical issues and warnings.
- Title, meta description, canonical, robots, X-Robots-Tag, viewport, language, and HTTP response inspection.
- Heading tree with in-page highlighting.
- Internal/external link inventory, rel flags, empty-anchor checks, and on-demand HTTP status checks.
- Image alt, dimensions, intrinsic/rendered size, loading, and source inspection.
- JSON-LD parsing with schema type detection and invalid JSON warnings.
- Open Graph and Twitter/X card metadata inspection.
- Hreflang inventory and duplicate hreflang detection.
- Rendered DOM versus raw HTML comparison on demand.
- Per-URL local snapshots and regression diffs.
- JSON report export and copyable issue list.
- No telemetry, analytics, remote scripts, accounts, or backend.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the planned path from the current release through v1.0. The roadmap prioritizes indexability diagnostics, performance/security inspection, regression workflows, multi-page auditing, crawler-lite functionality, and platform-neutral e-commerce SEO checks.

## Install for development

Requires Firefox 142 or newer.

1. Clone or download this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**.
4. Select `src/manifest.json`.
5. Click the toolbar icon or open **View → Sidebar → Firefox SEO Inspector**.

A prebuilt unsigned package is also kept in `dist/`. Stable Firefox generally requires Mozilla signing for permanent installation; the source can always be loaded temporarily for development.

## Permissions

The extension requests access to HTTP and HTTPS pages because its job is to inspect the active page and, only when requested, check link status. The `webRequest` permission is used read-only to capture SEO-relevant response metadata such as HTTP status and `X-Robots-Tag`.

Link status checks use `HEAD`, omit credentials, do not send a referrer, cap the request count, and run only after the user clicks the check button.

See [PRIVACY.md](PRIVACY.md) for the data-handling model.

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
- CI runs static checks first, then unit tests, Mozilla `web-ext` validation, and deterministic build verification.

## License

MIT. See [LICENSE](LICENSE).
