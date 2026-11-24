'use strict';
// Minimal ZIP reader/writer (store + deflate on read, store on write). No dependencies.
const fs = require('fs');
const zlib = require('zlib');

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crcUpdate = (crc, buf) => { for (let i = 0; i < buf.length; i++) crc = TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8); return crc; };
const crcFinal = (crc) => (crc ^ 0xFFFFFFFF) >>> 0;
const crc32 = (buf) => crcFinal(crcUpdate(0xFFFFFFFF, buf));

function dosDate(d) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

async function fileCrc(file) {
  let crc = 0xFFFFFFFF, size = 0;
  for await (const chunk of fs.createReadStream(file)) { crc = crcUpdate(crc, chunk); size += chunk.length; }
  return { crc: crcFinal(crc), size };
}

// entries: [{ name, data?: Buffer, file?: path, mtime?: Date }]; out: any Writable
async function writeZip(entries, out) {
  let offset = 0; const central = [];
  const write = (buf) => new Promise((resolve, reject) => {
    offset += buf.length;
    if (offset > 0xFFFFFFF0) return reject(new Error('Archive too large for this simple zip format (4 GB)'));
    out.write(buf) ? resolve() : out.once('drain', resolve);
  });
  for (const e of entries) {
    let size, crc;
    if (e.data) { size = e.data.length; crc = crc32(e.data); } else ({ size, crc } = await fileCrc(e.file));
    const name = Buffer.from(e.name, 'utf8'), dt = dosDate(e.mtime || new Date());
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(dt.time, 10); lh.writeUInt16LE(dt.date, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(size, 18); lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    central.push({ name, crc, size, offset, dt });
    await write(lh); await write(name);
    if (e.data) await write(e.data); else for await (const chunk of fs.createReadStream(e.file)) await write(chunk);
  }
  const cdStart = offset;
  for (const c of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(0, 10);
    h.writeUInt16LE(c.dt.time, 12); h.writeUInt16LE(c.dt.date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.size, 20); h.writeUInt32LE(c.size, 24);
    h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(c.offset, 42);
    await write(h); await write(c.name);
  }
  const cdSize = offset - cdStart;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(cdStart, 16);
  await write(end);
}

// Reads the central directory of a zip file on disk.
function readZipIndex(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, tailLen = Math.min(size, 65557), tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let p = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { p = i; break; }
    if (p < 0) throw new Error('Not a zip file');
    const total = tail.readUInt16LE(p + 10), cdSize = tail.readUInt32LE(p + 12), cdOff = tail.readUInt32LE(p + 16);
    if (cdOff === 0xFFFFFFFF || total === 0xFFFF) throw new Error('Zip64 archives are not supported');
    if (cdOff + cdSize > size || total > 200000) throw new Error('Corrupt zip');
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const entries = []; let o = 0;
    for (let i = 0; i < total; i++) {
      if (cd.readUInt32LE(o) !== 0x02014b50) throw new Error('Corrupt zip directory');
      const method = cd.readUInt16LE(o + 10), crc = cd.readUInt32LE(o + 16), csize = cd.readUInt32LE(o + 20), usize = cd.readUInt32LE(o + 24);
      const nl = cd.readUInt16LE(o + 28), el = cd.readUInt16LE(o + 30), cl = cd.readUInt16LE(o + 32), off = cd.readUInt32LE(o + 42);
      entries.push({ name: cd.toString('utf8', o + 46, o + 46 + nl), method, crc, csize, usize, offset: off });
      o += 46 + nl + el + cl;
    }
    return entries;
  } finally { fs.closeSync(fd); }
}

// Extracts one entry to destPath, verifying size and CRC. Rejects zip bombs (inflated size must equal declared size).
async function extractEntry(file, entry, destPath) {
  const fd = fs.openSync(file, 'r'); let dataStart;
  try {
    const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, entry.offset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('Corrupt zip entry');
    dataStart = entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  } finally { fs.closeSync(fd); }
  if (entry.method !== 0 && entry.method !== 8) throw new Error('Unsupported zip compression');
  const src = fs.createReadStream(file, { start: dataStart, end: dataStart + Math.max(entry.csize, 1) - 1 });
  const out = fs.createWriteStream(destPath);
  let crc = 0xFFFFFFFF, n = 0;
  const stream = entry.csize === 0 ? null : (entry.method === 8 ? src.pipe(zlib.createInflateRaw()) : src);
  if (stream) for await (const chunk of stream) {
    n += chunk.length; if (n > entry.usize) { out.destroy(); throw new Error('Zip entry larger than declared'); }
    crc = crcUpdate(crc, chunk); if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
  }
  await new Promise((resolve, reject) => { out.on('error', reject); out.end(resolve); });
  if (n !== entry.usize || crcFinal(crc) !== entry.crc) { fs.rmSync(destPath, { force: true }); throw new Error('Zip entry failed integrity check'); }
}

module.exports = { writeZip, readZipIndex, extractEntry, crc32 };
