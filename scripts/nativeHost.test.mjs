import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extensionIdFor,
  extensionIdFromKey,
  hostManifest,
  hostManifestDir,
  verifyInstalledHost,
  wrapperScript,
} from './nativeHost.mjs';
import manifest from '../apps/extension/public/manifest.json' with { type: 'json' };

describe('extension id', () => {
  it('derives the id INSTALL.md documents from the pinned manifest key', () => {
    // If this ever drifts, every allowed_origins we write is wrong and the
    // browser refuses to launch the host — silently, from the extension's side.
    expect(extensionIdFor(manifest, 'chromium')).toBe('pkgpllhlmhhocidmipbokpigndoeiemb');
  });

  it('maps each nibble onto a-p', () => {
    expect(extensionIdFromKey(Buffer.from('x').toString('base64'))).toMatch(/^[a-p]{32}$/);
  });

  it('takes the gecko id from browser_specific_settings', () => {
    expect(extensionIdFor(manifest, 'gecko')).toBe('companion@suiflex.dev');
  });
});

describe('hostManifestDir', () => {
  const profile = '/home/u/.meetcc/browser-profiles/brave-browser';

  it('puts a Chromium manifest inside the profile it was launched with', () => {
    // The whole bug: Chromium resolves this against the effective
    // --user-data-dir, so the browser's default location is never read.
    expect(hostManifestDir('chromium', profile, 'darwin', '/home/u')).toBe(
      `${profile}/NativeMessagingHosts`,
    );
    expect(hostManifestDir('chromium', profile, 'linux', '/home/u')).toBe(
      `${profile}/NativeMessagingHosts`,
    );
  });

  it('keeps Firefox global — it ignores the profile for native messaging', () => {
    expect(hostManifestDir('gecko', profile, 'darwin', '/home/u')).toBe(
      '/home/u/Library/Application Support/Mozilla/NativeMessagingHosts',
    );
    expect(hostManifestDir('gecko', profile, 'linux', '/home/u')).toBe(
      '/home/u/.mozilla/native-messaging-hosts',
    );
  });

  it('declines Windows, where registration is a registry write', () => {
    expect(hostManifestDir('chromium', profile, 'win32', 'C:\\Users\\u')).toBeNull();
  });
});

describe('hostManifest', () => {
  it('allowlists an origin for Chromium and an id for Gecko', () => {
    expect(hostManifest('abc', '/opt/host', 'chromium')).toMatchObject({
      name: 'dev.suiflex.companion',
      type: 'stdio',
      path: '/opt/host',
      allowed_origins: ['chrome-extension://abc/'],
    });
    expect(hostManifest('a@b', '/opt/host', 'gecko')).toMatchObject({
      allowed_extensions: ['a@b'],
    });
    expect(hostManifest('a@b', '/opt/host', 'gecko').allowed_origins).toBeUndefined();
  });
});

describe('wrapperScript', () => {
  it('pins an absolute node, since a browser inherits no shell PATH', () => {
    const sh = wrapperScript('/opt/homebrew/bin/node', '/opt/c/native-host.mjs');
    expect(sh).toContain('#!/bin/sh');
    expect(sh).toContain('exec "/opt/homebrew/bin/node" "/opt/c/native-host.mjs" "$@"');
  });

  it('quotes paths so a space in them cannot split the command', () => {
    const sh = wrapperScript('/usr/bin/node', '/Users/a b/Application Support/native-host.mjs');
    expect(sh).toContain('"/Users/a b/Application Support/native-host.mjs"');
  });
});

describe('verifyInstalledHost', () => {
  let dir, manifestPath, wrapperPath, hostPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meetcc-nativehost-'));
    manifestPath = join(dir, 'dev.suiflex.companion.json');
    wrapperPath = join(dir, 'native-host');
    hostPath = join(dir, 'native-host.mjs');
    writeFileSync(wrapperPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(hostPath, '// host\n');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (m) => writeFileSync(manifestPath, JSON.stringify(m));

  it('passes for a correctly written Chromium manifest', () => {
    write(hostManifest('abc', wrapperPath, 'chromium'));
    const r = verifyInstalledHost({ manifestPath, wrapperPath, hostPath, extensionId: 'abc', engine: 'chromium' });
    expect(r).toEqual({ ok: true, problems: [] });
  });

  it('passes for a correctly written Gecko manifest', () => {
    write(hostManifest('a@b', wrapperPath, 'gecko'));
    const r = verifyInstalledHost({ manifestPath, wrapperPath, hostPath, extensionId: 'a@b', engine: 'gecko' });
    expect(r).toEqual({ ok: true, problems: [] });
  });

  it('catches a stale manifest pinned to the wrong extension id (§36.2)', () => {
    write(hostManifest('dev-id-not-prod', wrapperPath, 'chromium'));
    const r = verifyInstalledHost({ manifestPath, wrapperPath, hostPath, extensionId: 'prod-id', engine: 'chromium' });
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('wrong extension id'))).toBe(true);
  });

  it('catches a missing manifest', () => {
    const r = verifyInstalledHost({
      manifestPath: join(dir, 'missing.json'),
      wrapperPath,
      hostPath,
      extensionId: 'abc',
      engine: 'chromium',
    });
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes('manifest missing'))).toBe(true);
  });

  it('catches a manifest pointing at a different wrapper path', () => {
    write(hostManifest('abc', '/some/other/path', 'chromium'));
    const r = verifyInstalledHost({ manifestPath, wrapperPath, hostPath, extensionId: 'abc', engine: 'chromium' });
    expect(r.problems.some((p) => p.includes("manifest 'path'"))).toBe(true);
  });

  it('catches a missing host binary', () => {
    write(hostManifest('abc', wrapperPath, 'chromium'));
    rmSync(hostPath);
    const r = verifyInstalledHost({ manifestPath, wrapperPath, hostPath, extensionId: 'abc', engine: 'chromium' });
    expect(r.problems.some((p) => p.includes('host binary missing'))).toBe(true);
  });

  it('catches a non-executable wrapper', () => {
    write(hostManifest('abc', wrapperPath, 'chromium'));
    chmodSync(wrapperPath, 0o644);
    const r = verifyInstalledHost({ manifestPath, wrapperPath, hostPath, extensionId: 'abc', engine: 'chromium' });
    expect(r.problems.some((p) => p.includes('not executable'))).toBe(true);
  });
});
