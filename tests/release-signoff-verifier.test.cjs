const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const libUrl = pathToFileURL(path.join(process.cwd(), 'scripts', 'release-signoff-verifier-lib.mjs')).href;

const identity = {
  version: '0.2.0',
  commitSha: 'a'.repeat(40),
  xpiName: 'seo-inspector-0.2.0.xpi',
  sha256: 'b'.repeat(64)
};

function completeSignoff() {
  return `# Firefox SEO Inspector release-candidate sign-off\n\n## Exact candidate identity\n\n- Version: \`0.2.0\`\n- Commit: \`${identity.commitSha}\`\n- XPI: \`${identity.xpiName}\`\n- SHA-256: \`${identity.sha256}\`\n\n## Automated release gates\n\n- [x] \`npm run check\` passes from a clean checkout of the commit above.\n- [x] Mozilla \`web-ext lint\` passes with zero release-blocking diagnostics.\n- [x] Deterministic/source-to-XPI verification passes for the artifact above.\n- [x] Repository public-source/privacy review is current for this exact source.\n\n## Manual Firefox sign-off\n\n- Firefox version: 142.0\n- Operating system: Linux\n- [x] Responsive sidebar matrix completed at 280 / 340 / 480 / 800+ px, including focus visibility and overflow.\n- [x] System / Light / Dark theme checks completed.\n- [x] Browser Console shows no uncaught extension exceptions.\n- [x] Browser Console shows no unhandled promise rejections.\n- [x] Full \`FIREFOX_SMOKE_TEST.md\` checklist completed against this exact XPI.\n- [x] Privacy/network inspection confirms no telemetry, analytics, backend, remote runtime code, or browsing-data upload.\n\n## Result\n\n- [x] PASS — candidate may proceed to the documented version/tag release step.\n- [ ] FAIL — candidate is blocked; describe the regression below and create a new candidate after fixes.\n`;
}

test('accepts a complete sign-off for the exact candidate', async () => {
  const { verifyReleaseSignoff } = await import(libUrl);
  const result = verifyReleaseSignoff(completeSignoff(), identity);
  assert.equal(result.firefoxVersion, '142.0');
  assert.equal(result.operatingSystem, 'Linux');
});

test('rejects candidate identity mismatch', async () => {
  const { verifyReleaseSignoff } = await import(libUrl);
  assert.throws(() => verifyReleaseSignoff(completeSignoff(), { ...identity, commitSha: 'c'.repeat(40) }), /commitSha does not match/);
});

test('rejects incomplete manual checks', async () => {
  const { verifyReleaseSignoff } = await import(libUrl);
  const text = completeSignoff().replace('- [x] Browser Console shows no unhandled promise rejections.', '- [ ] Browser Console shows no unhandled promise rejections.');
  assert.throws(() => verifyReleaseSignoff(text, identity), /Incomplete release sign-off check/);
});

test('rejects missing environment evidence and contradictory result', async () => {
  const { verifyReleaseSignoff } = await import(libUrl);
  assert.throws(() => verifyReleaseSignoff(completeSignoff().replace('- Firefox version: 142.0', '- Firefox version: '), identity), /Firefox version/);
  const contradictory = completeSignoff().replace('- [ ] FAIL —', '- [x] FAIL —');
  assert.throws(() => verifyReleaseSignoff(contradictory, identity), /PASS checked and FAIL unchecked/);
});
