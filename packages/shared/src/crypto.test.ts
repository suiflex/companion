import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptString, encryptString } from './crypto';

// in-memory chrome.storage.local stub
beforeEach(() => {
  const store: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (obj: Record<string, unknown>) => void Object.assign(store, obj),
      },
    },
  });
});

describe('crypto roundtrip', () => {
  it('encrypt -> decrypt returns original; ciphertext differs from plaintext', async () => {
    const secret = 'sk-super-secret-key-123';
    const packed = await encryptString(secret);
    expect(packed).not.toContain(secret);
    expect(packed).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(await decryptString(packed)).toBe(secret);
  });

  it('unique IV per encryption', async () => {
    const a = await encryptString('same');
    const b = await encryptString('same');
    expect(a).not.toBe(b);
  });

  it('empty and corrupted inputs degrade to empty string', async () => {
    expect(await encryptString('')).toBe('');
    expect(await decryptString('')).toBe('');
    expect(await decryptString('not-packed')).toBe('');
    expect(await decryptString('aGVsbG8=:aGVsbG8=')).toBe(''); // wrong key/data
  });
});
