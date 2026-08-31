import { describe, expect, it } from 'vitest';
import { launchArgs } from './companion.mjs';

const sources = { chromium: '/home/u/.companion/dist', gecko: '/home/u/.companion/companion.xpi' };
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

  it('hands Firefox the xpi as a file URL, not a --load-extension flag', () => {
    const args = launchArgs({ engine: 'gecko' }, sources, profile);
    expect(args).toEqual(['-profile', profile, '-no-remote', 'file:///home/u/.companion/companion.xpi']);
    expect(args.join(' ')).not.toContain('--load-extension');
  });

  it('keeps the profile out of the url for Firefox', () => {
    // -profile takes a path; a stale --user-data-dir here would silently put
    // every Firefox install in the same profile.
    const args = launchArgs({ engine: 'gecko' }, sources, profile);
    expect(args.some((a) => a.startsWith('--user-data-dir'))).toBe(false);
  });
});
