// Minimal store-only ZIP writer (no compression) — enough for the Obsidian
// vault export without pulling a dependency into the bundle. Text notes are
// small; the .zip overhead is a few dozen bytes per file.
//
// Format: local file headers + data, then one central directory record per
// file, then the EOCD. CRC-32 is the standard bitwise implementation (small,
// dependency-free, plenty fast for a vault of text notes).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

function u16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function dosDateTime(d: Date): { time: number; date: number } {
  // DOS time resolution is 2s; clamp to the representable range (1980+)
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  /** Path inside the archive, `/`-separated (e.g. `Meetings/2026-07-13 zkz-fwkm-ibn.md`). */
  path: string;
  content: string;
}

/**
 * Build a .zip archive from text entries. Deterministic timestamps (fixed
 * 2020-01-01) so identical inputs produce byte-identical archives — matters
 * for tests and for honest re-export diffs.
 */
export function makeZip(entries: ZipEntry[]): Blob {
  const parts: BlobPart[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const { time, date } = dosDateTime(new Date('2020-01-01T00:00:00'));

    // local file header
    const local: number[] = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0x0800), // flags: UTF-8 names, no data descriptor
      ...u16(0), // method: store
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(data.length), // compressed = uncompressed (store)
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0), // extra length
      ...name,
    ];
    parts.push(new Uint8Array(local), data);

    // central directory record for this file
    central.push(
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0x0800),
      ...u16(0),
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(offset),
      ...name,
    );

    offset += local.length + data.length;
  }

  const centralBytes = new Uint8Array(central);
  parts.push(centralBytes);
  // end of central directory
  parts.push(
    new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0), // disk
      ...u16(0), // start disk
      ...u16(entries.length),
      ...u16(entries.length),
      ...u32(centralBytes.length),
      ...u32(offset),
      ...u16(0), // comment
    ]),
  );

  return new Blob(parts, { type: 'application/zip' });
}
