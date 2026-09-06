import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildReleaseEvidence } from './release-evidence-lib.mjs';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error(`Version mismatch: package=${pkg.version}, manifest=${manifest.version}`);

const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
if (status) throw new Error('Release evidence must be generated from a clean working tree');

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const xpiName = `seo-inspector-${manifest.version}.xpi`;
const xpiPath = path.join(root, 'dist', xpiName);
if (!fs.existsSync(xpiPath)) throw new Error(`Missing ${path.relative(root, xpiPath)}; run npm run build first`);

const archive = fs.readFileSync(xpiPath);
const sha256 = crypto.createHash('sha256').update(archive).digest('hex');
const checksumPath = `${xpiPath}.sha256`;
if (!fs.existsSync(checksumPath)) throw new Error(`Missing ${path.relative(root, checksumPath)}; run npm run build first`);
const checksumText = fs.readFileSync(checksumPath, 'utf8').trim();
if (checksumText !== `${sha256}  ${xpiName}`) throw new Error('Stored XPI checksum does not match the artifact');

const output = buildReleaseEvidence({ version: manifest.version, commitSha, xpiName, sha256 });
const outputPath = path.join(root, 'dist', `release-signoff-${manifest.version}.md`);
fs.writeFileSync(outputPath, output);
console.log(`Wrote ${path.relative(root, outputPath)}`);
console.log(`Commit ${commitSha}`);
console.log(`SHA-256 ${sha256}`);
