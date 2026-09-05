const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function runBuild() {
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
  const path = `dist/firefox-seo-inspector-${manifest.version}.xpi`;
  const data = fs.readFileSync(path);
  return { data, hash: crypto.createHash('sha256').update(data).digest('hex') };
}

function zipMethods(buffer) {
  const methods = [];
  for (let i = 0; i <= buffer.length - 4; i += 1) {
    if (buffer.readUInt32LE(i) !== 0x02014b50) continue;
    methods.push(buffer.readUInt16LE(i + 10));
    const nameLength = buffer.readUInt16LE(i + 28);
    const extraLength = buffer.readUInt16LE(i + 30);
    const commentLength = buffer.readUInt16LE(i + 32);
    i += 45 + nameLength + extraLength + commentLength;
  }
  return methods;
}

test('XPI build is bit-for-bit reproducible on repeated runs', () => {
  const first = runBuild();
  const second = runBuild();
  assert.equal(first.hash, second.hash);
  assert.deepEqual(first.data, second.data);
});

test('XPI uses deterministic ZIP STORE entries', () => {
  const { data } = runBuild();
  const methods = zipMethods(data);
  assert.ok(methods.length > 0);
  assert.ok(methods.every((method) => method === 0));
});
