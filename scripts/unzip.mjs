// Minimal zip reader for the release asset.
//
// The installer used to shell out to `unzip`, which is absent on a stock
// Windows and on plenty of minimal Linux images — and `tar` is no substitute
// there, since GNU tar cannot read a zip at all. Reading the archive here means
// the installer depends on nothing but node.
//
// ponytail: stored and deflate only, no zip64, no encryption, no data
// descriptors. That is the whole of what `zip -qr` writes in the release
// workflow; anything else throws rather than extracting something wrong.

import { inflateRawSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';

const END_SIG = 0x06054b50; // end of central directory
const DIR_SIG = 0x02014b50; // central directory file header
const LOCAL_SIG = 0x04034b50; // local file header

/** Entries of a zip, as `{ name, data }`, directories dropped. */
export function readZip(buf) {
  const end = findEnd(buf);
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== DIR_SIG) throw new Error('Corrupt zip: bad central directory');
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // directory entry, the files recreate it
    if (compressed === 0xffffffff || size === 0xffffffff) {
      throw new Error(`Zip64 entry not supported: ${name}`);
    }
    out.push({ name, data: dataOf(buf, offset, method, compressed, size, name) });
  }
  return out;
}

/** Extract into `dir`, refusing any entry that would escape it. */
export async function extractZip(buf, dir) {
  for (const { name, data } of readZip(buf)) {
    const target = safeJoin(dir, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }
}

function dataOf(buf, offset, method, compressed, size, name) {
  if (buf.readUInt32LE(offset) !== LOCAL_SIG) throw new Error(`Corrupt zip: bad entry ${name}`);
  // the local header repeats the name and carries its own extra field, which is
  // routinely a different length from the central one
  const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
  const raw = buf.subarray(start, start + compressed);

  if (method === 0) return raw;
  if (method !== 8) throw new Error(`Unsupported compression (method ${method}) in ${name}`);
  const data = inflateRawSync(raw);
  if (data.length !== size) throw new Error(`Size mismatch for ${name}`);
  return data;
}

/** A zip can name `../` and absolute paths; neither may land outside `dir`. */
function safeJoin(dir, name) {
  const target = normalize(join(dir, name));
  if (target !== dir && !target.startsWith(dir + sep)) {
    throw new Error(`Refusing entry outside the target directory: ${name}`);
  }
  return target;
}

/** The trailer is last, but a zip comment can follow it, so scan backwards. */
function findEnd(buf) {
  const earliest = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= earliest; i--) {
    if (buf.readUInt32LE(i) === END_SIG) return i;
  }
  throw new Error('Not a zip file (no end-of-central-directory record).');
}
