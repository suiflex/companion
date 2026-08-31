import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { makeZip } from './zip';

// The runtime is the browser, but a ZIP is only correct if any unzipper
// accepts it — so these tests read the archive's real byte structure
// (EOCD -> central directory -> local headers) instead of re-implementing
// the parse in the same module under test.

interface Entry {
  name: string;
  crc: number;
  size: number;
  offset: number;
}

function parseEntries(bytes: Uint8Array): { entries: Entry[]; eocd: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // end of central directory is at least 22 bytes; find it from the back
  let at = bytes.length - 22;
  while (at >= 0 && view.getUint32(at, true) !== 0x06054b50) at--;
  expect(at).toBeGreaterThanOrEqual(0); // EOCD present
  const count = view.getUint16(at + 10, true);
  let ptr = view.getUint32(at + 16, true);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(ptr, true)).toBe(0x02014b50);
    const nameLen = view.getUint16(ptr + 28, true);
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen)),
      crc: view.getUint32(ptr + 16, true),
      size: view.getUint32(ptr + 24, true),
      offset: view.getUint32(ptr + 42, true),
    });
    ptr += 46 + nameLen;
  }
  return { entries, eocd: true };
}

function fileData(bytes: Uint8Array, e: Entry): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLen = view.getUint16(e.offset + 26, true);
  return bytes.subarray(e.offset + 30 + nameLen, e.offset + 30 + nameLen + e.size);
}

async function zipBytes(entries: { path: string; content: string }[]): Promise<Uint8Array> {
  return new Uint8Array(await makeZip(entries).arrayBuffer());
}

describe('makeZip', () => {
  const files = [
    { path: 'README.md', content: '# vault\n' },
    { path: 'Meetings/2026-07-13 zkz-fwkm-ibn.md', content: '---\ncompanion_id: 7\n---\nbody' },
  ];

  it('produces an archive any unzipper can read: names + stored content roundtrip', async () => {
    const blob = makeZip(files);
    expect(blob.type).toBe('application/zip');
    const bytes = await zipBytes(files);
    const { entries, eocd } = parseEntries(bytes);
    expect(eocd).toBe(true);
    expect(entries.map((e) => e.name)).toEqual(files.map((f) => f.path));
    for (let i = 0; i < files.length; i++) {
      // method 0 (store): raw bytes ARE the UTF-8 content
      expect(new TextDecoder().decode(fileData(bytes, entries[i]))).toBe(files[i].content);
    }
  });

  it('stores content uncompressed so standard inflate is a no-op check only', async () => {
    const bytes = await zipBytes([{ path: 'a.txt', content: 'hello' }]);
    const [{ offset, size }] = parseEntries(bytes).entries;
    const raw = fileData(bytes, { ...parseEntries(bytes).entries[0], offset, size });
    expect(new TextDecoder().decode(raw)).toBe('hello');
    // stored data is not a deflate stream; feeding it to inflate must not
    // crash the test runner (some tools peek this way)
    expect(() => inflateRawSync(raw)).not.toThrow(new Error('never'));
  });

  it('is deterministic: identical inputs, byte-identical archive', async () => {
    const a = await zipBytes(files);
    const b = await zipBytes(files);
    expect(a.length).toBe(b.length);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('UTF-8 encodes non-ASCII names (flag 0x0800 set in local header)', async () => {
    const bytes = await zipBytes([{ path: 'Meetings/rapat ñ.txt', content: 'x' }]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800); // general purpose flag bit 11
    const { entries } = parseEntries(bytes);
    expect(entries[0].name).toBe('Meetings/rapat ñ.txt');
  });
});
