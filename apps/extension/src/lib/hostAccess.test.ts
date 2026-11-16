import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostsLabel, requestHostAccess } from './hostAccess';

const ORIGINS = ['https://api.example.com/*'];

function api(opts: { has?: boolean; answer?: boolean | 'never'; grants?: boolean }) {
  let granted = opts.has ?? false;
  return {
    contains: vi.fn(async () => granted),
    request: vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          if (opts.answer === 'never') return;
          if (opts.answer && (opts.grants ?? true)) granted = true;
          resolve(Boolean(opts.answer));
        }),
    ),
  } as unknown as Pick<typeof chrome.permissions, 'contains' | 'request'> & {
    request: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => vi.useRealTimers());

describe('requestHostAccess', () => {
  it('does not prompt for nothing, or for an origin already granted', async () => {
    const none = api({});
    expect(await requestHostAccess([], none)).toBe('granted');
    const had = api({ has: true });
    expect(await requestHostAccess(ORIGINS, had)).toBe('granted');
    expect(had.request).not.toHaveBeenCalled();
  });

  it('reports a grant the user gave', async () => {
    expect(await requestHostAccess(ORIGINS, api({ answer: true }))).toBe('granted');
  });

  it('reports a refusal', async () => {
    expect(await requestHostAccess(ORIGINS, api({ answer: false }))).toBe('denied');
  });

  it('does not trust a `true` the browser never recorded', async () => {
    expect(await requestHostAccess(ORIGINS, api({ answer: true, grants: false }))).toBe('denied');
  });

  it('stops waiting on a request that never settles', async () => {
    vi.useFakeTimers();
    const pending = requestHostAccess(ORIGINS, api({ answer: 'never' }), 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBe('unanswered');
  });

  it('lets a failing request throw to its caller', async () => {
    const broken = api({});
    broken.request.mockRejectedValueOnce(new Error('Only permissions specified in the manifest'));
    await expect(requestHostAccess(ORIGINS, broken)).rejects.toThrow('manifest');
  });
});

describe('hostsLabel', () => {
  it('drops the match-pattern tail', () => {
    expect(hostsLabel(['https://a.example/*', 'http://localhost/*'])).toBe(
      'https://a.example, http://localhost',
    );
  });
});
