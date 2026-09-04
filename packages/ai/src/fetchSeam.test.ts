import { describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, setFetch } from './providers';

describe('the fetch seam', () => {
  // The desktop WebView's CSP refuses any connect-src but its own, so a
  // provider call has to leave through Rust. Every adapter goes through
  // fetchWithTimeout, which is why one seam covers all of them.
  it('routes every provider request through the installed fetch', async () => {
    const spy = vi.fn(async (_url: string, _init: RequestInit) => new Response('ok'));
    setFetch(spy);
    await fetchWithTimeout('https://api.example.com/v1', { method: 'POST' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('https://api.example.com/v1');
    // The abort signal has to survive being handed on, or the timeout stops
    // being a timeout.
    expect(spy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    setFetch((url, init) => fetch(url, init));
  });
});
