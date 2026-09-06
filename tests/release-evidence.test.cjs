const test = require('node:test');
const assert = require('node:assert/strict');

const importLib = () => import('../scripts/release-evidence-lib.mjs');

test('release evidence binds manual sign-off to exact candidate identity', async () => {
  const { buildReleaseEvidence } = await importLib();
  const commitSha = 'a'.repeat(40);
  const sha256 = 'b'.repeat(64);
  const markdown = buildReleaseEvidence({
    version: '1.0.0',
    commitSha,
    xpiName: 'seo-inspector-1.0.0.xpi',
    sha256,
    generatedAt: '2026-09-06T00:00:00.000Z',
  });

  assert.match(markdown, /Version: `1\.0\.0`/);
  assert.ok(markdown.includes(`Commit: \`${commitSha}\``));
  assert.ok(markdown.includes(`SHA-256: \`${sha256}\``));
  assert.match(markdown, /280 \/ 340 \/ 480 \/ 800\+ px/);
  assert.match(markdown, /Browser Console shows no uncaught extension exceptions/);
  assert.match(markdown, /Full `FIREFOX_SMOKE_TEST\.md` checklist completed against this exact XPI/);
  assert.match(markdown, /Any source or artifact change invalidates this sign-off/);
});

test('release evidence rejects ambiguous or malformed candidate identity', async () => {
  const { buildReleaseEvidence } = await importLib();
  const valid = {
    version: '1.0.0',
    commitSha: 'a'.repeat(40),
    xpiName: 'seo-inspector-1.0.0.xpi',
    sha256: 'b'.repeat(64),
  };

  assert.throws(() => buildReleaseEvidence({ ...valid, commitSha: 'deadbeef' }), /40-character Git SHA/);
  assert.throws(() => buildReleaseEvidence({ ...valid, sha256: '1234' }), /64-character SHA-256/);
  assert.throws(() => buildReleaseEvidence({ ...valid, xpiName: 'seo-inspector.zip' }), /XPI artifact/);
  assert.throws(() => buildReleaseEvidence({ ...valid, version: '' }), /Missing release evidence field: version/);
});
