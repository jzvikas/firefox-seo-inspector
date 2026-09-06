const CHECKS = [
  '`npm run check` passes from a clean checkout of the commit above.',
  'Mozilla `web-ext lint` passes with zero release-blocking diagnostics.',
  'Deterministic/source-to-XPI verification passes for the artifact above.',
  'Repository public-source/privacy review is current for this exact source.',
  'Responsive sidebar matrix completed at 280 / 340 / 480 / 800+ px, including focus visibility and overflow.',
  'System / Light / Dark theme checks completed.',
  'Browser Console shows no uncaught extension exceptions.',
  'Browser Console shows no unhandled promise rejections.',
  'Full `FIREFOX_SMOKE_TEST.md` checklist completed against this exact XPI.',
  'Privacy/network inspection confirms no telemetry, analytics, backend, remote runtime code, or browsing-data upload.'
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCodeField(text, label) {
  const match = text.match(new RegExp(`^- ${escapeRegExp(label)}: \\`([^\\`]+)\\`$`, 'm'));
  return match?.[1]?.trim() || '';
}

function extractPlainField(text, label) {
  const match = text.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() || '';
}

function checked(text, label) {
  return new RegExp(`^- \\[x\\] ${escapeRegExp(label)}$`, 'im').test(text);
}

export function verifyReleaseSignoff(text, expected) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Release sign-off is empty');
  const requiredExpected = ['version', 'commitSha', 'xpiName', 'sha256'];
  for (const field of requiredExpected) {
    if (typeof expected?.[field] !== 'string' || !expected[field].trim()) {
      throw new Error(`Missing expected release identity field: ${field}`);
    }
  }

  const actual = {
    version: extractCodeField(text, 'Version'),
    commitSha: extractCodeField(text, 'Commit').toLowerCase(),
    xpiName: extractCodeField(text, 'XPI'),
    sha256: extractCodeField(text, 'SHA-256').toLowerCase()
  };
  const normalizedExpected = {
    version: expected.version.trim(),
    commitSha: expected.commitSha.trim().toLowerCase(),
    xpiName: expected.xpiName.trim(),
    sha256: expected.sha256.trim().toLowerCase()
  };

  for (const field of requiredExpected) {
    if (!actual[field]) throw new Error(`Missing release sign-off identity field: ${field}`);
    if (actual[field] !== normalizedExpected[field]) {
      throw new Error(`Release sign-off ${field} does not match the exact candidate`);
    }
  }

  const firefoxVersion = extractPlainField(text, 'Firefox version');
  const operatingSystem = extractPlainField(text, 'Operating system');
  if (!firefoxVersion) throw new Error('Firefox version must be recorded');
  if (!operatingSystem) throw new Error('Operating system must be recorded');

  for (const label of CHECKS) {
    if (!checked(text, label)) throw new Error(`Incomplete release sign-off check: ${label}`);
  }

  const passLabel = 'PASS — candidate may proceed to the documented version/tag release step.';
  const failLabel = 'FAIL — candidate is blocked; describe the regression below and create a new candidate after fixes.';
  const pass = checked(text, passLabel);
  const fail = checked(text, failLabel);
  if (!pass || fail) throw new Error('Release sign-off must have PASS checked and FAIL unchecked');

  return { ...actual, firefoxVersion, operatingSystem };
}
