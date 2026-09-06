# v1.0 public source review

This document records the final repository-level public-source/privacy review performed for the v1 release line before the exact Firefox release-candidate smoke test.

## Review scope

Reviewed the public repository at base commit `e34d1ba9b1943184f731743491c20b3fb23bdcde` together with the release-review documentation change that adds this record.

The review covered:

- extension runtime source under `src/`;
- tests and fixtures;
- build, validation, and release tooling under `scripts/`;
- GitHub Actions workflow configuration;
- public documentation and examples;
- manifest permissions, CSP, and data-collection declarations;
- committed release artifacts only as deterministic build outputs, not as an independent source of runtime behavior.

## Required invariants checked

The public source was reviewed for the v1 release invariants below:

- no telemetry or analytics integration;
- no backend, account service, or remote runtime-code dependency;
- no browsing-data upload path;
- no private/customer domains or project-specific host allowlists;
- no customer identifiers or private configuration;
- no committed credentials, bearer tokens, private keys, credential-bearing URLs, private IP addresses, or local user paths;
- no platform-specific e-commerce rules tied to a private shop or deployment;
- Firefox-first operation with the documented minimal permission set;
- deterministic source-matching XPI as the only release artifact model.

## Evidence

The repository-wide `scripts/privacy-scan.mjs` release gate scans public text source, tests, documentation, workflows, and tooling while excluding generated/dependency directories. It rejects private keys, common GitHub/AWS credentials, embedded API keys/secrets/passwords, bearer credentials, credential-bearing URLs, Windows/macOS/Linux user paths, and RFC1918 private IPv4 addresses.

A direct final review additionally searched the public repository for local-development host/path markers, credential vocabulary, private/project-specific names, telemetry/analytics markers, backend/network client markers, and hard-coded URL indicators. No private or project-specific data requiring removal was found.

The runtime privacy model remains unchanged by this review: no permissions, network behavior, storage behavior, or runtime code are added here.

## Result

**PASS — repository-level public-source/privacy review complete for the current v1 release line.**

This sign-off does not replace the exact-candidate Firefox smoke test. If source changes after the release candidate is selected, rerun the automated gates and review the changed public source before release. The exact XPI/commit checksum pairing is recorded during the final Firefox release-candidate sign-off, not in this repository-level review.
