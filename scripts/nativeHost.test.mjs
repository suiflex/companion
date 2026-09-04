import { describe, expect, it } from 'vitest';
import {
  extensionIdFor,
  extensionIdFromKey,
  hostManifest,
  hostManifestDir,
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
