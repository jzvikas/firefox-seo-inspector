import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const srcRoot = path.resolve('src');
const distRoot = path.resolve('dist');
const manifest = JSON.parse(fs.readFileSync(path.join(srcRoot, 'manifest.json'), 'utf8'));
const outputName = `seo-inspector-${manifest.version}.xpi`;

function filesUnder(dir, prefix = '') {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...filesUnder(full, rel));
    else output.push({ name: rel.replaceAll('\\', '/'), data: fs.readFileSync(full) });
  }
  return output;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x0021;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    // Store files without compression. This avoids zlib-version-dependent output
    // and makes the generated XPI bit-for-bit reproducible across environments.
    const compressed = file.data;
    const crc = crc32(file.data);
    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(compressed.length), u32(file.data.length), u16(name.length), u16(0), name,
    ]);
    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(compressed.length), u32(file.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...localParts, central, end]);
}

fs.mkdirSync(distRoot, { recursive: true });
for (const name of fs.readdirSync(distRoot)) {
  if (/^(?:firefox-)?seo-inspector-.*\.(?:xpi|sha256)$/.test(name)) fs.rmSync(path.join(distRoot, name));
}
const archive = buildZip(filesUnder(srcRoot));
const outputPath = path.join(distRoot, outputName);
fs.writeFileSync(outputPath, archive);
const hash = crypto.createHash('sha256').update(archive).digest('hex');
fs.writeFileSync(`${outputPath}.sha256`, `${hash}  ${outputName}\n`);
console.log(`Built ${path.relative(process.cwd(), outputPath)} (${archive.length} bytes)`);
console.log(`SHA-256 ${hash}`);
