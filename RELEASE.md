# Release runbook

This runbook defines the release procedure for Firefox SEO Inspector. The goal is a reproducible, reviewable release in which the published XPI can be traced back to the exact source commit and the extension remains local-first, permission-minimal, and free of telemetry or remote runtime code.

## Release prerequisites

- Use Node.js 20 or newer.
- Start from a clean checkout of the intended release commit.
- Ensure the release branch is up to date with `main` and contains no uncommitted changes.
- Confirm `package.json`, `src/manifest.json`, README release text, and CHANGELOG version metadata agree.
- Confirm all required v1 roadmap items intended for the release are complete or explicitly documented as accepted limitations.
- Confirm the repository-level public-source/privacy review in [RELEASE_SOURCE_REVIEW.md](RELEASE_SOURCE_REVIEW.md) is current for the candidate source; re-review any source changes made after that sign-off.
- Do not add telemetry, analytics, accounts, backend calls, remote runtime scripts, project-specific domains, customer identifiers, credentials, or private configuration.
- Do not expand Firefox permissions unless the feature cannot be implemented safely without them and the permission change has been reviewed and documented.

## Clean-checkout verification

From the repository root:

```bash
npm ci
npm run check
```

`npm run check` must complete successfully. It includes static checks, manifest validation, the public-source privacy scan, release/version consistency checks, unit tests, deterministic XPI build, and source-to-XPI verification.

A release must not proceed while any of these gates are failing.

## Mozilla validation

Run Mozilla's validator against the release source/package using the same `web-ext` command used by CI. The result must contain zero errors, zero warnings, and zero notices.

If Mozilla changes validator behavior and a new diagnostic appears, investigate it rather than suppressing or ignoring it by default.

## Exact release-candidate evidence

After `npm run check` has built and verified the candidate XPI from a clean working tree, run:

```bash
npm run release:evidence
```

This writes `dist/release-signoff-<version>.md`. The generated record binds the manual sign-off to the full Git commit SHA, exact XPI filename, and SHA-256 digest. The command refuses a dirty working tree, version mismatch, missing artifact/checksum, or checksum mismatch.

Do not commit the generated sign-off file as source. Complete it alongside the exact candidate artifact. Any source or artifact change invalidates that sign-off and requires a rebuild plus all affected automated/manual checks.

## Manual Firefox smoke test

Complete [FIREFOX_SMOKE_TEST.md](FIREFOX_SMOKE_TEST.md) against the exact commit or tag that will be released, using the generated release-candidate sign-off record to preserve candidate identity.

Record at minimum:

- exact commit SHA and release tag;
- Firefox version and operating system;
- generated XPI filename;
- SHA-256 checksum;
- automated CI result;
- Mozilla `web-ext` validation result;
- any accepted limitations.

Any uncaught extension error, unhandled promise rejection, broken core workflow, privacy regression, or permission regression blocks the release.

## Release version update

Before creating the release tag:

1. Move completed entries from the CHANGELOG `[Unreleased]` section into a dated release section.
2. Update the release version consistently in `package.json` and `src/manifest.json`.
3. Update README release text if it names the current release explicitly.
4. Re-run `npm run check` after every version or changelog change.
5. Review the final diff for accidental private data, generated-only files, local paths, secrets, or unrelated edits.

The repository's release-consistency gate must pass before tagging.

## Build reproducibility and artifact verification

Build only from the exact release commit:

```bash
npm ci
npm run build
npm run verify:build
```

The generated XPI and checksum are release artifacts. The verification gate must confirm that the package content corresponds to source for the same version and that a repeated deterministic build produces the expected result.

Do not hand-edit an XPI after building it.

## Tagging

Create the release tag only after CI, Mozilla validation, deterministic-build verification, and the manual Firefox smoke test are complete.

Recommended tag format:

```text
vX.Y.Z
```

The tag must point to the exact source commit used to produce the release XPI.

After tagging, do not rebuild from a different working tree and publish it under the same version.

## Release artifact sign-off

Before publishing or attaching an XPI, verify:

- version matches source metadata and changelog;
- filename matches the documented release naming convention;
- SHA-256 checksum matches the generated XPI;
- CI is green for the exact release commit;
- `web-ext` reports zero errors, warnings, and notices;
- deterministic/source-to-XPI checks pass;
- smoke-test sign-off references the same commit/tag and artifact checksum;
- no new permission or privacy behavior was introduced without documentation.

## Failure handling

If any gate fails, fix the source and restart verification from the new commit. Never reuse a previous smoke-test or checksum sign-off after source changes.

If a release is found to contain a critical regression after publication, prepare a new patch version. Do not silently replace an artifact under an existing version tag.

## Security and privacy release boundary

Release review must preserve these project invariants:

- Firefox-first behavior;
- fully local/private analysis;
- no telemetry or analytics;
- no backend or account dependency;
- no remote runtime code;
- no browsing-data upload;
- platform-neutral e-commerce checks;
- minimal permissions;
- no repository-committed private or project-specific data;
- deterministic source-matching XPI.

These are release requirements, not optional product preferences.
