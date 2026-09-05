# Security policy

## Design rules

- No remote JavaScript or remotely hosted runtime dependencies.
- No `eval`, `new Function`, or dynamic script injection.
- Page-derived strings are rendered with `textContent`, not HTML sinks.
- Link-check requests omit credentials and referrers.
- Only SEO-relevant response headers are retained in session storage.
- No secrets, credentials, private endpoints, or environment-specific identifiers belong in the repository.
- Extension pages use a restrictive Content Security Policy.

## Reporting a security issue

Do not include credentials, private customer data, or exploitable private URLs in a public issue. Provide a minimal redacted reproduction when possible.
