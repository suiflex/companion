// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('standalone dev mock', () => {
  beforeEach(async () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      length: 0,
      key: () => null,
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    // Clear globals
    const win = window as unknown as { chrome?: unknown; __resetDevData?: () => void };
    delete win.chrome;
    delete win.__resetDevData;

    // Re-import / re-evaluate mock setup
    vi.resetModules();
    await import('./mock');
  });

  it('polyfills chrome.storage.local with seeded dummy meetings', async () => {
    const all = await chrome.storage.local.get(null);
    expect(all['meta:meet/arch-sync-2026']).toBeDefined();
    expect(all['title:meet/arch-sync-2026']).toBe('Q3 System Architecture & Performance Review');
    expect(all['transcript:meet/arch-sync-2026']).toBeInstanceOf(Array);
    expect(all['analysis:meet/arch-sync-2026']).toBeDefined();
  });

  it('supports getting specific keys and arrays of keys', async () => {
    const titleRes = await chrome.storage.local.get('title:meet/arch-sync-2026');
    expect(titleRes['title:meet/arch-sync-2026']).toBe('Q3 System Architecture & Performance Review');

    const multiRes = await chrome.storage.local.get(['theme', 'lang']);
    expect(multiRes).toEqual({ theme: 'system', lang: 'system' });
  });

  it('persists updates and fires onChanged listeners', async () => {
    const listener = vi.fn();
    chrome.storage.onChanged.addListener(listener);

    await chrome.storage.local.set({ theme: 'dark' });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: { oldValue: 'system', newValue: 'dark' },
      }),
      'local',
    );

    const updated = await chrome.storage.local.get('theme');
    expect(updated.theme).toBe('dark');

    // Remove key
    await chrome.storage.local.remove('theme');
    const removed = await chrome.storage.local.get('theme');
    expect(removed.theme).toBeUndefined();

    chrome.storage.onChanged.removeListener(listener);
  });

  it('provides runtime, permissions, and manifest mocks', async () => {
    expect(chrome.runtime.getManifest().name).toContain('Meet Companion');
    expect(chrome.runtime.getURL('icons/suiflex.svg')).toBe('/icons/suiflex.svg');

    const sendRes = await chrome.runtime.sendMessage({ type: 'test' });
    expect(sendRes).toEqual({ ok: true, rows: [] });

    expect(await chrome.permissions.contains({ origins: ['<all_urls>'] })).toBe(true);
    expect(await chrome.permissions.request({ origins: ['<all_urls>'] })).toBe(true);
  });
});
