import { describe, expect, it } from 'vitest';
import { launchArgs, pickRelease } from './companion.mjs';

const sources = { chromium: '/home/u/.companion/dist' };
const profile = '/home/u/.meetcc/browser-profiles/chrome';

describe('launchArgs', () => {
  it('loads the unpacked dist in a Chromium browser', () => {
    const args = launchArgs({ engine: 'chromium' }, sources, profile);
    expect(args).toEqual([
      `--user-data-dir=${profile}`,
      `--load-extension=${sources.chromium}`,
      `--disable-extensions-except=${sources.chromium}`,
      '--no-first-run',
      'https://meet.google.com/',
    ]);
  });

  it('sends Firefox to the AMO page, not a --load-extension flag', () => {
    const args = launchArgs({ engine: 'gecko' }, sources, profile);
    // addressed by add-on id: AMO resolves it and the slug can be renamed
    expect(args).toEqual([
      '-profile', profile, '-no-remote',
      'https://addons.mozilla.org/en-US/firefox/addon/companion%40suiflex.dev/',
    ]);
    expect(args.join(' ')).not.toContain('--load-extension');
  });

  it('keeps the profile out of the url for Firefox', () => {
    // -profile takes a path; a stale --user-data-dir here would silently put
    // every Firefox install in the same profile.
    const args = launchArgs({ engine: 'gecko' }, sources, profile);
    expect(args.some((a) => a.startsWith('--user-data-dir'))).toBe(false);
  });
});

describe('resolveSources', () => {
  it('resolves nothing locally when only Firefox is picked', async () => {
    // Firefox installs from AMO, so there is no download to fail on and no
    // reason to build the Chromium dist.
    const { resolveSources } = await import('./companion.mjs');
    const sources = await resolveSources({ dir: null }, [{ engine: 'gecko', name: 'Firefox' }]);
    expect(sources.chromium).toBeNull();
  });
});

// A repository releasing two products on two tag shapes cannot ask GitHub for
// "the latest release" — the answer is whichever product shipped last.
describe('pickRelease', () => {
  const releases = [
    { tag_name: 'companion-desktop-v0.2.0', draft: false, prerelease: false },
    { tag_name: 'v1.8.0', draft: false, prerelease: false },
    { tag_name: 'companion-desktop-v0.1.0', draft: false, prerelease: false },
    { tag_name: 'v1.7.1', draft: false, prerelease: false },
  ];

  it('picks the newest release of the product asked for', () => {
    expect(pickRelease(releases, 'extension').tag_name).toBe('v1.8.0');
    expect(pickRelease(releases, 'desktop').tag_name).toBe('companion-desktop-v0.2.0');
  });

  it('never hands a desktop release to the extension installer', () => {
    // The exact shape that broke it: the desktop shipped most recently.
    const desktopOnTop = [releases[0], releases[3]];
    expect(pickRelease(desktopOnTop, 'extension').tag_name).toBe('v1.7.1');
  });

  it('defaults to the extension, which is what the old call site wanted', () => {
    expect(pickRelease(releases).tag_name).toBe('v1.8.0');
  });

  it('skips drafts and prereleases, as /releases/latest did', () => {
    const noisy = [
      { tag_name: 'v2.0.0', draft: true, prerelease: false },
      { tag_name: 'v1.9.0', draft: false, prerelease: true },
      { tag_name: 'v1.8.0', draft: false, prerelease: false },
    ];
    expect(pickRelease(noisy, 'extension').tag_name).toBe('v1.8.0');
  });

  it('returns null rather than a wrong release when the product never shipped', () => {
    expect(pickRelease([{ tag_name: 'v1.8.0', draft: false, prerelease: false }], 'desktop')).toBeNull();
    expect(pickRelease([], 'extension')).toBeNull();
  });

  it('rejects a product it has no tag shape for', () => {
    expect(() => pickRelease(releases, 'mobile')).toThrow(/Unknown product/);
  });
});
