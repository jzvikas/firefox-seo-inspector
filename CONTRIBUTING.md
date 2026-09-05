# Contributing

## Before committing

Run:

```bash
npm run check
```

Every user-visible change should also:

1. update `CHANGELOG.md`;
2. add or update tests when behavior changes;
3. rebuild `dist/` when source or manifest files change;
4. keep public source free of sensitive or environment-specific data.

## CI approach

This is a small repository, so CI intentionally avoids dependency installation and large matrices. Cheap static/privacy checks run before tests and packaging. The workflow uses a timeout and cancels superseded runs for the same branch.
