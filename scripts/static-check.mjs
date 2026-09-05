import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'scripts', 'tests'];
const jsFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) jsFiles.push(full);
  }
}

for (const root of roots) if (fs.existsSync(root)) walk(root);

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
    process.exit(1);
  }
}

const sourceFiles = jsFiles.filter((file) => file.startsWith(`src${path.sep}`));
for (const file of sourceFiles) {
  const body = fs.readFileSync(file, 'utf8');
  const forbidden = [
    [/\beval\s*\(/, 'eval()'],
    [/\bnew\s+Function\s*\(/, 'new Function()'],
    [/\.innerHTML\s*=/, 'innerHTML assignment'],
    [/document\.write\s*\(/, 'document.write()'],
    [/<script[^>]+src=["']https?:\/\//i, 'remote script'],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(body)) {
      console.error(`Forbidden runtime pattern (${label}) in ${file}`);
      process.exit(1);
    }
  }
}

console.log(`Static checks passed for ${jsFiles.length} JavaScript files.`);
