import { describe, expect, it } from 'vitest';
import { launchArgs } from './companion.mjs';

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
