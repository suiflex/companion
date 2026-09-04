import { t } from './i18n';
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

// -- passphrase-based encryption, for anything that leaves the machine --
// Sync and share bundles are encrypted with a key derived from a passphrase
// the user knows and the server never sees, so "optional cloud sync" does not
// quietly become "our transcripts live on someone else's disk in the clear".

/** OWASP's 2023 floor for PBKDF2-HMAC-SHA256. */
export const KDF_ITERATIONS = 210_000;

async function deriveKey(passphrase: string, salt: BufferSource): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptWithPassphrase(plain: string, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error(t('pkg.crypto.emptyPassphrase'));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `v1:${b64(salt)}:${b64(iv)}:${b64(data)}`;
}

/** Throws on a wrong passphrase or tampered payload — callers must not treat
 *  undecryptable remote data as empty data. */
export async function decryptWithPassphrase(packed: string, passphrase: string): Promise<string> {
  const [version, salt, iv, data] = packed.split(':');
  if (version !== 'v1' || !salt || !iv || !data) throw new Error(t('pkg.crypto.unknownFormat'));
  const key = await deriveKey(passphrase, unb64(salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data));
  return new TextDecoder().decode(plain);
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
