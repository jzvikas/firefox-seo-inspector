# Domain profiles

Domain profiles let Firefox SEO Inspector apply local audit expectations to one exact hostname without hard-coding a site into the public source tree.

## Privacy model

Profiles are stored only in Firefox extension `browser.storage.local` under `domainProfiles:v1`. A saved profile can contain:

- the exact hostname;
- an optional local label;
- enabled/disabled state;
- partial threshold overrides;
- partial required-signal overrides;
- expected structured-data types;
- expected hreflang values;
- check IDs ignored for that hostname.

The extension does not upload these profiles, and the repository contains no preconfigured personal domains. Removing extension storage or uninstalling the extension removes the saved profiles.

## Matching rules

A profile matches one normalized hostname exactly. For example, a profile created while inspecting one hostname does not automatically apply to sibling or nested subdomains.

Wildcard matching and automatic parent/subdomain inheritance are intentionally not implemented. This prevents a broad rule from silently affecting a staging, administration, supplier, or otherwise unrelated subdomain.

Disabled profiles remain stored but are not applied.

## Global Rules versus domain profiles

The **Rules** tab defines the global base policy. A matching enabled **Profiles** entry overlays only the fields explicitly set in that profile.

Leaving a profile threshold blank means **inherit the global value**. Required-signal selectors support:

- **Inherit** — use the global Rules setting;
- **Required** — require the signal on this hostname;
- **Optional** — do not require the signal on this hostname.

Unspecified global disabled checks and severity settings remain intact.

## Per-host thresholds

Profiles can override:

- title minimum and maximum length;
- meta-description minimum and maximum length;
- oversized-image intrinsic/rendered ratio;
- known image file-size limit in KiB.

Image byte-size findings are still created only when Firefox has a known size from Resource Timing or from the explicit image-network check.

## Required signals

A profile can override whether the following are required:

- title;
- meta description;
- canonical;
- H1;
- typed structured data;
- hreflang;
- HTTPS.

## Expected schema and hreflang

Profiles can declare a bounded list of structured-data types and hreflang values expected on the hostname.

Expected schema types are matched case-insensitively against valid JSON-LD `@type` values found by the existing page extractor. Missing expected types create `profile.schema.expected`.

Expected hreflang values are normalized locally. `x-default` is supported. Missing expected values create `profile.hreflang.expected`.

These expectation findings are normal local audit issues and affect the score unless ignored by policy.

## Per-host ignored checks

The Profiles tab lists normal Custom Rules check IDs plus the profile expectation checks. Selecting a check suppresses that finding only for the exact hostname.

Global disabled checks remain disabled everywhere. Domain ignores are additive; they never silently re-enable a globally disabled check.

This feature is intentionally separate from the later richer Ignore Rules workflow, which is planned to add convenient issue/URL/selector-oriented management.

## Audit consistency

The effective hostname policy is resolved for each audit target:

- current rendered page;
- authenticated current-page raw HTML comparison;
- another open tab;
- URL A versus URL B raw-HTML comparison.

For URL A versus URL B, each fetched final URL resolves its own hostname profile independently. Two compared domains therefore do not accidentally share the profile of the currently active tab.

## Safety limits

- Maximum saved profiles: 200.
- Maximum expected schema types per profile: 50.
- Maximum expected hreflang values per profile: 50.
- Maximum ignored check IDs per profile: 100.
- Profile data is normalized before use.
- Invalid explicit numeric ranges or malformed expectation values are rejected by the editor.

## Development policy

Never commit real personal/customer domain profiles into the repository, fixtures, documentation, tests, screenshots, or generated defaults. Tests should use reserved/example hostnames only.
