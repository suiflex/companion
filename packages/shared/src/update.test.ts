import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  fetchLatestRelease,
  updateAvailable,
  type UpdateState,
} from './update';

describe('compareVersions', () => {
  it('orders by numeric component, not lexically', () => {
    // the case a string compare gets wrong
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
  });

  it('treats equal versions as equal, with or without the v prefix', () => {
    expect(compareVersions('1.5.1', '1.5.1')).toBe(0);
    expect(compareVersions('v1.5.1', '1.5.1')).toBe(0);
  });

  it('pads missing components with zero', () => {
    expect(compareVersions('1.6', '1.6.0')).toBe(0);
    expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0);
  });
});

describe('updateAvailable', () => {
  const state: UpdateState = { latest: '1.6.0', url: 'https://example/r', checkedAt: 0 };

  it('is true when the release is newer and undismissed', () => {
    expect(updateAvailable('1.5.1', state, undefined)).toBe(true);
  });

  it('is false on the newest version', () => {
    expect(updateAvailable('1.6.0', state, undefined)).toBe(false);
  });

  it('is false for a dev build ahead of the release', () => {
    expect(updateAvailable('1.7.0', state, undefined)).toBe(false);
  });

  it('stays dismissed for that version only', () => {
    expect(updateAvailable('1.5.1', state, '1.6.0')).toBe(false);
    expect(updateAvailable('1.5.1', state, '1.5.9')).toBe(true);
  });

  it('is false before the first check', () => {
    expect(updateAvailable('1.5.1', undefined, undefined)).toBe(false);
  });
});

describe('fetchLatestRelease', () => {
  const ok = (body: unknown) =>
    (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

  it('strips the v from the tag', async () => {
    const r = await fetchLatestRelease(ok({ tag_name: 'v1.6.0', html_url: 'https://example/r' }));
    expect(r?.latest).toBe('1.6.0');
    expect(r?.url).toBe('https://example/r');
  });

  it('returns undefined when the request fails', async () => {
    const fail = (async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await fetchLatestRelease(fail)).toBeUndefined();
  });

  it('returns undefined when offline rather than throwing', async () => {
    const boom = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    await expect(fetchLatestRelease(boom)).resolves.toBeUndefined();
  });

  it('returns undefined for a release with no tag', async () => {
    expect(await fetchLatestRelease(ok({}))).toBeUndefined();
  });
});
