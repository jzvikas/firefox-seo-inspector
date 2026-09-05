import fs from 'node:fs';

function fail(message) {
  console.error(`Release consistency check failed: ${message}`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const pkg = readJson('package.json');
const manifest = readJson('src/manifest.json');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

const version = String(pkg.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) fail('package.json version must be a plain semantic version (x.y.z)');
if (manifest.version !== version) fail(`manifest version ${manifest.version || '<missing>'} does not match package.json ${version}`);

const readmeRelease = readme.match(/^## Current release: v(\d+\.\d+\.\d+)\s*$/m);
if (!readmeRelease) fail('README.md must contain exactly one "## Current release: vX.Y.Z" heading');
if (readmeRelease[1] !== version) fail(`README current release ${readmeRelease[1]} does not match package.json ${version}`);

const currentReleaseHeading = new RegExp(`^## \\[${escapeRegex(version)}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, 'm');
if (!currentReleaseHeading.test(changelog)) fail(`CHANGELOG.md must contain a release section for ${version}`);

const unreleasedHeadings = changelog.match(/^## \[Unreleased\]\s*$/gm) || [];
if (unreleasedHeadings.length !== 1) fail(`CHANGELOG.md must contain exactly one [Unreleased] section; found ${unreleasedHeadings.length}`);

const releaseHeadings = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/gm)];
if (!releaseHeadings.length) fail('CHANGELOG.md must contain at least one versioned release section');

const seen = new Set();
for (const match of releaseHeadings) {
  const releaseVersion = match[1];
  if (seen.has(releaseVersion)) fail(`CHANGELOG.md contains duplicate release section ${releaseVersion}`);
  seen.add(releaseVersion);
  if (!match[2]) fail(`CHANGELOG.md release ${releaseVersion} must include an ISO date`);
}

if (releaseHeadings[0][1] !== version) {
  fail(`latest CHANGELOG.md release is ${releaseHeadings[0][1]}, expected ${version}`);
}

console.log(`Release consistency checks passed for v${version}.`);
