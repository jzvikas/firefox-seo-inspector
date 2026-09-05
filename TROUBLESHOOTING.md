# Troubleshooting

This guide covers Inspector-window and page-connection failures. SEO Inspector is local-first: these recovery paths do not upload page content, runtime errors, or diagnostics to a backend.

## Inspector window is blank after the extension was reloaded or updated

The detached Inspector window is tracked in Firefox session storage. A Firefox/add-on reload can leave the old browser popup alive after its extension document is no longer valid.

Current behavior:

1. Opening SEO Inspector validates that the remembered popup still contains the live extension Inspector page.
2. A stale or blank popup is closed.
3. A fresh Inspector window is created automatically.

If a blank popup was already open before installing a build with this recovery logic, close it once or click the toolbar action again after reloading the extension.

## Inspector says the page connection is unavailable after an extension reload

An HTTP/HTTPS page that was already open before the extension itself was reloaded can lose its old content-script connection even though the website tab is still healthy.

Current behavior:

1. The Inspector sends a local `seoInspector.ping` to the current tab.
2. If the content script answers, no recovery injection is performed.
3. If it does not answer, the Inspector uses Firefox's `scripting` API to inject only the JavaScript files already declared in this extension's own manifest.
4. The content script is pinged again and the normal audit continues.

You should normally not need to reload the inspected website after reloading the extension. The content bootstrap is idempotent, so reconnecting cannot intentionally register a second Inspector runtime in the same extension page context.

## Firefox page cannot be inspected

Firefox protects browser-internal pages such as `about:` pages and extension pages from ordinary website inspection. SEO Inspector deliberately supports normal HTTP and HTTPS pages only.

Examples that are not inspectable:

- `about:addons`
- `about:config`
- `moz-extension:` pages
- `resource:` / browser-internal pages
- local `file:` pages in the current permission model
- other non-HTTP/HTTPS URL schemes

Open a normal HTTP or HTTPS tab. The Inspector does not attempt to bypass Firefox protection.

## Page access unavailable on an HTTP/HTTPS page

Some Firefox-protected or restricted web pages can reject extension script injection even though their visible URL is HTTPS. When Firefox rejects the recovery injection, the Inspector reports **Page access unavailable** instead of repeatedly telling you to reload the page.

This state means Firefox denied the extension execution context for that page. Switching to an ordinary website tab is the expected recovery path.

## Audit failed

**Audit failed** is different from a missing content script. It means the Inspector successfully connected to the page, but the audit itself threw a runtime exception or did not complete.

Use the Inspector **Refresh** button once. If the same state repeats on a normal website, treat it as an Inspector bug rather than a website-reload problem. Runtime error text shown in the Inspector is bounded and sanitized locally; it is not uploaded automatically.

## One panel fails but the rest of the Inspector still works

Each major Inspector renderer now runs behind an error boundary. If one panel throws while rendering, the affected panel shows **Inspector UI section failed** and the remaining panels continue rendering.

The Inspector also captures uncaught window errors and unhandled promise rejections in its own UI rather than silently reducing the detached window to an apparently blank state.

## Switching tabs quickly shows stale results

Refresh operations use a monotonically increasing generation value. When a newer tab/refresh starts, results from an older asynchronous reconnect, audit, robots request, or watch setup are discarded before they can overwrite the active tab.

If a tab is still navigating, wait for the navigation to finish and press **Refresh** if you want an immediate new audit.

## Development / temporary installation checklist

When testing a source checkout or a newly generated XPI:

1. Open `about:debugging#/runtime/this-firefox`.
2. Reload or reinstall the extension build you want to test.
3. Keep an existing HTTP/HTTPS page open and click SEO Inspector — the Inspector should reconnect without requiring a page reload.
4. Switch to `about:addons` — the Inspector should show an explicit Firefox-page unsupported state rather than a generic connection failure.
5. Switch back to the website and verify the audit recovers.
6. Reload the extension while the detached Inspector is open, then use the toolbar action again — a stale blank popup should be discarded/recreated.

Before release, also run the repository CI gates: static/privacy checks, unit/runtime tests, Mozilla `web-ext` lint, deterministic XPI build, checksum verification, and source-to-XPI consistency verification.
