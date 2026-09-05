import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'tests'];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}
for (const root of roots) walk(root);

const patterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\b(?:api[_-]?key|secret|password|passwd)\s*[:=]\s*["'][^"']{6,}["']/i, 'embedded credential'],
  [/[A-Za-z]:\\Users\\/i, 'Windows user path'],
  [/\/(?:home|Users)\/[A-Za-z0-9._-]+\//, 'local user path'],
  [/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/, 'private IP address'],
];

for (const file of files) {
  if (!/\.(?:js|json|html|css|svg|cjs|mjs|md|txt)$/i.test(file)) continue;
  const body = fs.readFileSync(file, 'utf8');
  for (const [pattern, label] of patterns) {
    if (pattern.test(body)) {
      console.error(`Privacy scan failed: ${label} found in ${file}`);
      process.exit(1);
    }
  }
}

console.log(`Privacy scan passed for ${files.length} files.`);
