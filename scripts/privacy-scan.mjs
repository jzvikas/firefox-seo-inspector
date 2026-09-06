import fs from 'node:fs';
import path from 'node:path';

const root = '.';
const files = [];
const excludedDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
]);
const textFilePattern = /\.(?:js|json|html|css|svg|cjs|mjs|md|txt|yml|yaml|sh)$/i;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (textFilePattern.test(entry.name)) files.push(full);
  }
}
walk(root);

const patterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\b(?:api[_-]?key|secret|password|passwd)\s*[:=]\s*["'][^"']{6,}["']/i, 'embedded credential'],
  [/\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i, 'bearer credential'],
  [/https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i, 'credential embedded in URL'],
  [/[A-Za-z]:\\Users\\/i, 'Windows user path'],
  [/\/(?:home|Users)\/[A-Za-z0-9._-]+\//, 'local user path'],
  [/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/, 'private IP address'],
];

for (const file of files) {
  const body = fs.readFileSync(file, 'utf8');
  for (const [pattern, label] of patterns) {
    if (pattern.test(body)) {
      console.error(`Privacy scan failed: ${label} found in ${file}`);
      process.exit(1);
    }
  }
}

console.log(`Repository-wide privacy scan passed for ${files.length} text files.`);
