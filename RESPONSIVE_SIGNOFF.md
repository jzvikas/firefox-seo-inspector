# Firefox responsive sidebar sign-off

Use this matrix on the exact release-candidate XPI before v1.0.0. This is a manual Firefox gate; automated CSS contract tests reduce regression risk but do not replace visual sign-off.

## Test widths

Exercise the sidebar at approximately these content widths in Firefox:

- **280 px** — constrained sidebar stress case.
- **340 px** — narrow breakpoint boundary.
- **480 px** — common compact sidebar.
- **800 px or wider** — wide/detached-window behavior.

Run the matrix in **System**, **Light**, and **Dark** themes. At minimum, repeat the 280 px and 480 px cases after switching theme so focus contrast and overflow are checked in both compact and normal layouts.

## Required checks at every width

- [ ] Top bar, URL text, status score, and status copy remain readable without overlapping.
- [ ] Primary tabs remain reachable; horizontal tab overflow scrolls instead of clipping controls.
- [ ] Keyboard focus is visibly identifiable on tabs, buttons, inputs, selects, and expandable summaries.
- [ ] Arrow/Home/End tab navigation keeps the focused tab visible while moving across the tab strip.
- [ ] Cards and row labels/values do not force page-level horizontal overflow.
- [ ] Tables keep their own horizontal scrolling when columns exceed the available width.
- [ ] Toolbars wrap controls without making inputs or selects wider than the sidebar.
- [ ] Footer actions wrap and remain reachable.
- [ ] Long URLs, titles, canonical values, schema text, and issue messages wrap or truncate deliberately rather than escaping their container.
- [ ] Empty, loading, error, disabled, and complete panel states remain visually distinct and readable.
- [ ] Observed facts, warnings/failures, and recommendations remain distinguishable without relying on color alone.
- [ ] No control is hidden behind sticky table headers or the sticky footer.
- [ ] No unexpected page-level horizontal scrollbar appears because of sidebar content.

## Narrow-specific checks: 280–340 px

- [ ] Metadata rows collapse to a single-column label/value layout.
- [ ] Score/status layout remains stable with the reduced score size.
- [ ] URL display is bounded and cannot push the top bar wider than the sidebar.
- [ ] Toolbar fields can shrink/wrap and remain operable.
- [ ] SERP preview remains contained within the sidebar.

## Wide-specific checks: 800 px+

- [ ] Rows use the intended two-column label/value layout.
- [ ] Large tables and inventories use the available width without excessive whitespace or clipped actions.
- [ ] Detached-window usage remains visually coherent if used for the candidate smoke test.

## Sign-off evidence

Record the following with the release smoke-test evidence:

- Firefox version.
- Operating system.
- Exact release commit/tag.
- Exact XPI SHA-256 checksum.
- Widths tested.
- Themes tested.
- Result: PASS / FAIL.
- Any accepted limitation, with a link to the tracking issue if applicable.

Any source or CSS change after PASS invalidates this responsive sign-off for the affected release candidate and requires a rebuilt deterministic XPI plus repeat testing.
