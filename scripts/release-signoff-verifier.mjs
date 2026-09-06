import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyReleaseSignoff } from './release-signoff-verifier-lib.mjs';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error(`Version mismatch: package=${pkg.version}, manifest=${manifest.version}`);

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const xpiName = `seo-inspector-${manifest.version}.xpi`;
const xpiPath = path.join(root, 'dist', xpiName);
if (!fs.existsSync(xpiPath)) throw new Error(`Missing ${path.relative(root, xpiPath)}; run npm run build first`);
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(xpiPath)).digest('hex');

const signoffPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, 'dist', `release-signoff-${manifest.version}.md`);
if (!fs.existsSync(signoffPath)) throw new Error(`Missing ${path.relative(root, signoffPath)}; complete npm run release:evidence first`);

verifyReleaseSignoff(fs.readFileSync(signoffPath, 'utf8'), {
  version: manifest.version,
  commitSha,
  xpiName,
  sha256
});

console.log(`Verified completed release sign-off: ${path.relative(root, signoffPath)}`);
console.log(`Commit ${commitSha}`);
console.log(`SHA-256 ${sha256}`);
