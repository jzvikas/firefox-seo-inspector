export function buildReleaseEvidence({ version, commitSha, xpiName, sha256, generatedAt = new Date().toISOString() }) {
  const required = { version, commitSha, xpiName, sha256 };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing release evidence field: ${name}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error('commitSha must be a full 40-character Git SHA');
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('sha256 must be a 64-character SHA-256 digest');
  if (!xpiName.endsWith('.xpi')) throw new Error('xpiName must identify an XPI artifact');

  return `# Firefox SEO Inspector release-candidate sign-off\n\n` +
    `Generated: ${generatedAt}\n\n` +
    `## Exact candidate identity\n\n` +
    `- Version: \`${version}\`\n` +
    `- Commit: \`${commitSha.toLowerCase()}\`\n` +
    `- XPI: \`${xpiName}\`\n` +
    `- SHA-256: \`${sha256.toLowerCase()}\`\n\n` +
    `Any source or artifact change invalidates this sign-off and requires a rebuild plus affected automated/manual checks.\n\n` +
    `## Automated release gates\n\n` +
    `- [ ] \`npm run check\` passes from a clean checkout of the commit above.\n` +
    `- [ ] Mozilla \`web-ext lint\` passes with zero release-blocking diagnostics.\n` +
    `- [ ] Deterministic/source-to-XPI verification passes for the artifact above.\n` +
    `- [ ] Repository public-source/privacy review is current for this exact source.\n\n` +
    `## Manual Firefox sign-off\n\n` +
    `- Firefox version: \n` +
    `- Operating system: \n` +
    `- [ ] Responsive sidebar matrix completed at 280 / 340 / 480 / 800+ px, including focus visibility and overflow.\n` +
    `- [ ] System / Light / Dark theme checks completed.\n` +
    `- [ ] Browser Console shows no uncaught extension exceptions.\n` +
    `- [ ] Browser Console shows no unhandled promise rejections.\n` +
    `- [ ] Full \`FIREFOX_SMOKE_TEST.md\` checklist completed against this exact XPI.\n` +
    `- [ ] Privacy/network inspection confirms no telemetry, analytics, backend, remote runtime code, or browsing-data upload.\n\n` +
    `## Result\n\n` +
    `- [ ] PASS — candidate may proceed to the documented version/tag release step.\n` +
    `- [ ] FAIL — candidate is blocked; describe the regression below and create a new candidate after fixes.\n\n` +
    `Known limitations / notes:\n\n`;
}
