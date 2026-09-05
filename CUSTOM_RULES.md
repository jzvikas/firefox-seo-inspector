# Custom audit rules

Firefox SEO Inspector supports a local-only audit policy in the **Rules** sidebar tab. The configuration is stored in Firefox extension local storage and is never committed to this repository or uploaded anywhere.

## Thresholds

You can change:

- title minimum and maximum character counts;
- meta-description minimum and maximum character counts;
- the intrinsic/rendered image ratio used by the oversized-image check;
- the maximum image file size in KiB.

The image file-size rule is evaluated only when a real byte size is known from Resource Timing or the explicit image network check. Unknown file sizes do not generate a false warning.

## Required signals

The Rules panel can require or relax:

- title;
- meta description;
- canonical;
- H1;
- typed structured data;
- hreflang;
- HTTPS.

Turning off a required title, description, canonical, or H1 suppresses only the corresponding missing-signal issue. Other checks for content that is present still run normally.

## Individual checks and severity

Each listed check can be enabled or disabled independently. Its default severity can also be overridden to **Critical**, **Warning**, or **Info**. Score and severity counters are recalculated after policy is applied.

The image file-size finding is synchronized into the global issue list and score after image byte sizes become known.

## Scope

Custom rules are currently global for this Firefox profile. Per-host profiles and hostname/URL-specific ignore rules are separate roadmap items and are intentionally not mixed into this first custom-rules implementation.

## Resetting

Click **Reset defaults** in the Rules panel to delete the stored custom-rule record and restore built-in defaults.

## Privacy

The configuration contains thresholds, required-signal booleans, disabled check IDs, and severity overrides only. It does not contain inspected page content and does not modify websites.
