import { afterEach, describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, readZip } from './unzip.mjs';

/** Build a zip the way `zip -qr` does, so the fixture is the real format. */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, body, store = false } of entries) {
    const raw = Buffer.from(body);
    const data = store ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(store ? 0 : 8, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const body = Buffer.concat(locals);
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, dirBuf, end]);
}

const dirs = [];
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), 'unzip-test-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('readZip', () => {
  it('inflates a deflated entry', () => {
    const body = 'x'.repeat(500); // long enough that deflate actually shrinks it
    expect(readZip(zip([{ name: 'manifest.json', body }]))[0].data.toString()).toBe(body);
  });

  it('reads a stored entry, which is what zip does for tiny files', () => {
    expect(readZip(zip([{ name: 'a.txt', body: 'hi', store: true }]))[0].data.toString()).toBe('hi');
  });

  it('drops directory entries', () => {
    const entries = readZip(zip([{ name: 'icons/', body: '' }, { name: 'icons/16.png', body: 'x' }]));
    expect(entries.map((e) => e.name)).toEqual(['icons/16.png']);
  });

  it('rejects something that is not a zip', () => {
    expect(() => readZip(Buffer.from('not a zip at all'))).toThrow(/Not a zip file/);
  });
});

describe('extractZip', () => {
  it('writes entries, creating the directories they name', async () => {
    const dir = scratch();
    await extractZip(zip([{ name: 'assets/icons/16.png', body: 'PNG' }]), dir);
    expect(readFileSync(join(dir, 'assets', 'icons', '16.png'), 'utf8')).toBe('PNG');
  });

  it('refuses an entry that would escape the target directory', async () => {
    const dir = scratch();
    await expect(extractZip(zip([{ name: '../escaped.txt', body: 'no' }]), dir)).rejects.toThrow(
      /outside the target directory/,
    );
  });
});
