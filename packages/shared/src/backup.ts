// Whole-archive backup and restore.
//
// chrome.storage.local is the source of truth for every meeting, and it is
// scoped to the extension id. Pinning that id (manifest `key`) means it never
// changes again — but it did change once, and anyone who was running an older
// build has their meetings under the old id. Per-meeting share files exist, but
// exporting fifty meetings one passphrase at a time is not a migration path.
//
// So: one file, every meeting, no secrets.

import { TRANSCRIPT_PREFIX } from './storage';
import { t } from './i18n';

/** Never leaves the browser. The AES key sits beside the data it protects, so
 *  a file carrying both is a plaintext API key with extra steps. */
export const SECRET_KEYS = ['settings', 'cryptoKey', 'audit'];

/** Machine-local state that would be wrong to carry to another profile. */
export const EPHEMERAL_KEYS = ['update:latest', 'update:dismissed'];

/**
 * A denylist rather than an allowlist: a new kind of meeting data should end up
 * in the backup by default, and forgetting to add a prefix here loses nothing.
 * Forgetting to add one to an allowlist would silently lose it.
 */
export function isPortableKey(key: string): boolean {
  return !SECRET_KEYS.includes(key) && !EPHEMERAL_KEYS.includes(key);
}

export const BACKUP_FORMAT = 'meetcc-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  /** The extension version that wrote it, for a human reading the file. */
  extensionVersion: string;
  /** Meeting count, so the UI can say what a file holds before restoring it. */
  meetings: number;
  data: Record<string, unknown>;
}

export function countMeetings(data: Record<string, unknown>): number {
  return Object.keys(data).filter((k) => k.startsWith(TRANSCRIPT_PREFIX)).length;
}

/** Build a backup from a raw chrome.storage.local dump. */
export function makeBackup(
  dump: Record<string, unknown>,
  extensionVersion: string,
  now: Date = new Date(),
): BackupFile {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dump)) {
    if (isPortableKey(key)) data[key] = value;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    extensionVersion,
    meetings: countMeetings(data),
    data,
  };
}

/**
 * Parse and validate a backup file.
 *
 * Restoring writes straight into storage, so anything malformed has to be
 * rejected here rather than half-applied. Throws with a message meant for the
 * person who picked the wrong file.
 */
export function readBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Berkas ini bukan JSON.');
  }
  const b = parsed as Partial<BackupFile>;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error(t('pkg.backup.unrecognised'));
  if (b.format !== BACKUP_FORMAT) throw new Error('Berkas ini bukan backup Companion.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error(`Backup versi ${String(b.version)} lebih baru dari yang bisa dibaca versi ini.`);
  }
  if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) {
    throw new Error(t('pkg.backup.empty'));
  }
  // A backup written by a future build could carry a key we now refuse; drop it
  // rather than trusting the file's own filtering.
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(b.data)) {
    if (isPortableKey(key)) data[key] = value;
  }
  return {
    format: BACKUP_FORMAT,
    version: b.version,
    createdAt: typeof b.createdAt === 'string' ? b.createdAt : '',
    extensionVersion: typeof b.extensionVersion === 'string' ? b.extensionVersion : '',
    meetings: countMeetings(data),
    data,
  };
}

export interface RestorePlan {
  /** Keys to write. Never includes one that already exists. */
  writes: Record<string, unknown>;
  added: number;
  /** Present already, left untouched. */
  skipped: number;
}

/**
 * Work out what a restore would change.
 *
 * Additive on purpose: restoring into a profile that already has meetings must
 * not overwrite them. A meeting already present wins over the copy in the file,
 * because the live one may have notes the backup predates.
 */
export function planRestore(
  existing: Record<string, unknown>,
  backup: BackupFile,
): RestorePlan {
  const writes: Record<string, unknown> = {};
  let skipped = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    if (key in existing) skipped++;
    else writes[key] = value;
  }
  return { writes, added: Object.keys(writes).length, skipped };
}
