import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
const archivePath = `dist/seo-inspector-${manifest.version}.xpi`;
const checksumPath = `${archivePath}.sha256`;
if (!fs.existsSync(archivePath)) throw new Error(`Missing ${archivePath}`);
if (!fs.existsSync(checksumPath)) throw new Error(`Missing ${checksumPath}`);

const data = fs.readFileSync(archivePath);
const expectedHash = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0];
const actualHash = crypto.createHash('sha256').update(data).digest('hex');
if (actualHash !== expectedHash) throw new Error('SHA-256 checksum does not match archive');

function findEnd(buffer) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('ZIP end-of-central-directory not found');
}

const end = findEnd(data);
const count = data.readUInt16LE(end + 10);
const centralOffset = data.readUInt32LE(end + 16);
const entries = new Map();
let cursor = centralOffset;
for (let i = 0; i < count; i += 1) {
  if (data.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid central directory entry');
  const method = data.readUInt16LE(cursor + 10);
  const compressedSize = data.readUInt32LE(cursor + 20);
  const uncompressedSize = data.readUInt32LE(cursor + 24);
  const nameLength = data.readUInt16LE(cursor + 28);
  const extraLength = data.readUInt16LE(cursor + 30);
  const commentLength = data.readUInt16LE(cursor + 32);
  const localOffset = data.readUInt32LE(cursor + 42);
  const name = data.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

  if (data.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local header: ${name}`);
  const localNameLength = data.readUInt16LE(localOffset + 26);
  const localExtraLength = data.readUInt16LE(localOffset + 28);
  const contentStart = localOffset + 30 + localNameLength + localExtraLength;
  const compressed = data.subarray(contentStart, contentStart + compressedSize);
  const content = method === 8 ? zlib.inflateRawSync(compressed) : compressed;
  if (content.length !== uncompressedSize) throw new Error(`Size mismatch: ${name}`);
  entries.set(name, content);
  cursor += 46 + nameLength + extraLength + commentLength;
}

function listSource(dir, prefix = '') {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...listSource(full, rel));
    else output.push(rel.replaceAll('\\', '/'));
  }
  return output.sort();
}

const sourceNames = listSource('src');
const archiveNames = Array.from(entries.keys()).sort();
if (JSON.stringify(sourceNames) !== JSON.stringify(archiveNames)) throw new Error('Archive file list does not exactly match src/');
for (const name of sourceNames) {
  const source = fs.readFileSync(path.join('src', ...name.split('/')));
  if (!source.equals(entries.get(name))) throw new Error(`Archive content differs from source: ${name}`);
}

console.log(`Package verification passed for ${archiveNames.length} files.`);
