// AES-GCM at-rest encryption for API keys via WebCrypto.
// Honest scope: the AES key lives in chrome.storage.local next to the data,
// so this is obfuscation against casual storage inspection / accidental
// export leaks — not against an attacker with full profile access.
// (No extension can do better without a user-supplied passphrase.)

const KEY_SLOT = 'cryptoKey';

async function getKey(): Promise<CryptoKey> {
  const stored = (await chrome.storage.local.get(KEY_SLOT))[KEY_SLOT];
  if (stored) {
    return crypto.subtle.importKey('jwk', stored, { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt',
    ]);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  await chrome.storage.local.set({ [KEY_SLOT]: await crypto.subtle.exportKey('jwk', key) });
  return key;
}

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptString(plain: string): Promise<string> {
  if (!plain) return '';
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `${b64(iv)}:${b64(data)}`;
}

export async function decryptString(packed: string): Promise<string> {
  if (!packed) return '';
  const [iv, data] = packed.split(':');
  if (!iv || !data) return '';
  try {
    const key = await getKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(iv) },
      key,
      unb64(data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return ''; // key rotated / corrupted -> treat as unset, user re-enters
  }
}
