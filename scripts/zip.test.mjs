import { describe, expect, it } from 'vitest';
import { makeZip } from './zip.mjs';
import { readZip } from './unzip.mjs';
import { firefoxManifest } from './pack.mjs';

describe('makeZip', () => {
  it('round-trips through the reader', () => {
    const entries = [
      { name: 'manifest.json', data: Buffer.from('{"manifest_version":3}') },
      // long and repetitive, so it actually deflates
      { name: 'assets/app.js', data: Buffer.from('console.log(1);'.repeat(200)) },
      { name: 'icons/icon16.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]) },
    ];

    const files = readZip(makeZip(entries));
    expect(files.map((f) => f.name).sort()).toEqual([
      'assets/app.js',
      'icons/icon16.png',
      'manifest.json',
    ]);
    for (const { name, data } of entries) {
      expect(files.find((f) => f.name === name).data).toEqual(data);
    }
  });

  it('stores a file that deflates larger than the original', () => {
    // 4 random-ish bytes: deflate adds framing, so the writer must fall back
    // to storing them raw rather than growing the archive.
    const data = Buffer.from([0x1f, 0x8b, 0x3c, 0xa7]);
    const [file] = readZip(makeZip([{ name: 'tiny.bin', data }]));
    expect(file.data).toEqual(data);
  });

  it('produces the same bytes for the same input', () => {
    const entries = [{ name: 'a.txt', data: Buffer.from('hello') }];
    expect(makeZip(entries)).toEqual(makeZip(entries));
  });
});

describe('firefoxManifest', () => {
  const chrome = {
    manifest_version: 3,
    key: 'MIIBIjAN…',
    background: { service_worker: 'background.js', type: 'module' },
    browser_specific_settings: { gecko: { id: 'companion@suiflex.dev' } },
    permissions: ['storage'],
    host_permissions: ['https://meet.google.com/*', 'https://api.github.com/*'],
  };

  it('swaps the service worker for an event page', () => {
    expect(firefoxManifest(chrome).background).toEqual({
      scripts: ['background.js'],
      type: 'module',
    });
  });

  it('drops the Chromium key and keeps the gecko id', () => {
    const m = firefoxManifest(chrome);
    expect(m.key).toBeUndefined();
    expect(m.browser_specific_settings.gecko.id).toBe('companion@suiflex.dev');
    expect(m.permissions).toEqual(['storage']);
    expect(m.host_permissions).toEqual(['https://meet.google.com/*']);
  });

  it('leaves the source manifest untouched', () => {
    firefoxManifest(chrome);
    expect(chrome.background.service_worker).toBe('background.js');
    expect(chrome.key).toBe('MIIBIjAN…');
    expect(chrome.host_permissions).toContain('https://api.github.com/*');
  });
});
