# Local storage schema and migrations

SEO Inspector keeps user configuration and snapshots in Firefox `browser.storage.local`. v1.0 stability requires those records to survive extension upgrades and also to remain safe if an older extension build is temporarily installed over data written by a newer build.

## Global schema marker

The migration coordinator owns one small metadata record:

- key: `storageSchema:v1`
- current global schema version: `1`
- metadata: schema version and the timestamp of the successful migration

The marker is intentionally separate from feature-level versions such as `customRules:v1`, `domainProfiles:v1`, or `snapshot-history:v2`. Feature modules can keep their own format versions while the global schema describes whether the complete local-storage set has been adopted by the current extension generation.

## What schema v1 adopts

The first global migration normalizes and preserves the currently supported local records:

- `customRules:v1`
- `domainProfiles:v1`
- `snapshot-history:v2`
- legacy per-URL `snapshot:*` records

Rules and Profiles are passed through their existing bounded normalizers. Snapshot history is passed through the existing snapshot sanitizer. Legacy `snapshot:*` records are merged into the versioned snapshot history by snapshot content/ID rules already used by the Snapshot module.

No browsing data, page HTML, hostname profile contents, or snapshot contents are returned in the public migration status. The status contains only schema versions and bounded counts.

## Commit order and failure safety

A migration is deliberately not represented as one blind `set()` call. The coordinator applies it in this order:

1. Read the current local-storage dump.
2. Build a pure migration plan in memory.
3. Write normalized target records first.
4. Remove legacy keys only after the target write succeeds.
5. Write `storageSchema:v1` **last**.

This gives the schema marker commit semantics. If the normalized target write fails, no legacy key is deleted. If legacy-key removal fails, the target copy may already exist but the schema marker is not advanced. The next startup retries the migration; snapshot migration is idempotent, so the retry does not create duplicate snapshots.

The marker itself being written last also means a failure while writing the marker causes a safe retry rather than a false "migration complete" state.

## Startup coordination

`background/storage-background.js` starts migration when the extension background context initializes. It also exposes a local runtime message, `seoInspector.ensureStorageSchema`, so consumers can await the same in-flight migration instead of each feature implementing its own migration race.

The first successful result is cached for the lifetime of the background context. A failed migration is not cached permanently; a later ensure request retries it.

Current audit-policy loading waits for the schema coordinator before reading saved Rules and Profiles. The Rules, Profiles, and Snapshot UI also resolve schema readiness before local writes.

## Downgrade protection

If the metadata record says the local data uses a schema version **newer** than the running extension supports, the older build does not migrate or downgrade it.

In that state:

- page audits may continue to read fields they understand;
- Rules remain viewable but Save/Reset is disabled;
- Profiles remain viewable but Create/Save/Delete is disabled;
- existing Snapshots remain viewable/comparable/exportable but Save/Import/Baseline/Delete is disabled;
- the UI explains that local data is read-only to prevent downgrade data loss.

This protection matters for temporary development installs and for users who roll back an extension build while keeping the same Firefox profile.

## Adding a future migration

When changing a persistent format:

1. Increase the global `StorageSchema.SCHEMA_VERSION` only when the complete storage set needs a new migration step.
2. Keep old-version migration logic deterministic and side-effect free inside the planning layer.
3. Never delete an old key before its replacement has been written successfully.
4. Keep every migration idempotent so interruption/retry is safe.
5. Never mark the target version complete until all destructive cleanup has succeeded.
6. Add tests for clean install, normal migration, interrupted write, interrupted cleanup, retry, and future-version downgrade protection.
7. Keep migration result/status objects free of saved page URLs, profile hostnames, labels, snapshot contents, and other user data.

If a feature needs its own internal version bump without a global coordination change, its normalizer/migrator may remain feature-local, but the global coordinator must still be able to adopt the resulting current format before the global marker advances.

## Tests

The automated suite covers:

- clean-storage adoption;
- Rules/Profile normalization;
- legacy snapshot migration;
- write-before-delete-before-marker ordering;
- target-write failure with no legacy deletion;
- cleanup failure with no schema advance;
- idempotent retry after partial migration;
- no-op behavior for the current schema;
- refusal to downgrade a future schema;
- background migration caching and retry;
- sanitized migration status;
- sidebar write gating for future/failed schemas;
- manifest/background dependency order and centralized snapshot migration wiring.
