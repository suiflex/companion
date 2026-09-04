import {
  decryptWithPassphrase,
  encryptWithPassphrase,
  type Analysis,
  type AnalysisRecord,
  type Entry,
} from '@meetcc/shared';
import { t } from '@meetcc/shared/i18n';
import type { CompanionStore } from '@meetcc/store';

// P2.6 / P2.7 / P2.8 — optional sync, workspace and sharing.
//
// Local-first is the product's spine (§35.1, §35.7), so this is strictly
// opt-in and end-to-end encrypted: the payload is sealed with the user's
// passphrase before it is sent, and the endpoint is whatever URL the user
// configured. There is no Companion server, no default host, and nothing is
// uploaded until sync is switched on.

export interface SyncConfig {
  /** User-supplied base URL, e.g. https://sync.example.com/companion */
  endpoint: string;
  token: string;
  /** Shared namespace = team workspace (P2.7). Empty = personal. */
  workspaceId: string;
  /** Never sent anywhere; only used to derive the encryption key. */
  passphrase: string;
}

export interface SessionBundle {
  version: 1;
  sessionId: string;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  platform: string;
  participants: string[];
  entries: Entry[];
  analysis: Analysis | null;
  updatedAt: string;
}

export interface RemoteRecord {
  sessionId: string;
  updatedAt: string;
  /** `encryptWithPassphrase` output — opaque to the server. */
  payload: string;
}

/**
 * https anywhere, or plain http on loopback only.
 *
 * The bearer token travels in a header, so http on a routable address would
 * put it on the wire in clear. Loopback is the exception browsers themselves
 * make (localhost is a secure context) and is how @meetcc/sync-server is meant
 * to be run — on the user's own machine. Anything remote needs TLS.
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedSyncEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint.trim());
    if (url.protocol === 'https:') return true;
    // URL keeps the brackets on an IPv6 host, so '[::1]' is what to compare
    return url.protocol === 'http:' && LOOPBACK.has(url.hostname);
  } catch {
    return false;
  }
}

export function validateSync(config: SyncConfig): string | null {
  if (!isAllowedSyncEndpoint(config.endpoint)) {
    return 'Endpoint sync harus https://, atau http:// khusus localhost.';
  }
  if (!config.passphrase || config.passphrase.length < 8) {
    return 'Passphrase minimal 8 karakter (kunci enkripsi diturunkan darinya).';
  }
  return null;
}

export function buildBundle(store: CompanionStore, sessionId: string): SessionBundle | null {
  const session = store.getSession(sessionId);
  if (!session) return null;
  const record = store.getAnalysis(sessionId);
  return {
    version: 1,
    sessionId,
    title: session.title,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    platform: session.platform,
    participants: session.participants,
    entries: store.getEntries(sessionId),
    analysis: record?.status === 'done' ? record.analysis : null,
    updatedAt: new Date().toISOString(),
  };
}

export function parseBundle(raw: string): SessionBundle {
  const b = JSON.parse(raw) as SessionBundle;
  if (b?.version !== 1 || !b.sessionId || !Array.isArray(b.entries)) {
    throw new Error(t('pkg.meeting.invalidBundle'));
  }
  return b;
}

/** Write a decrypted bundle into the local store (pull, or an imported share). */
export function applyBundle(store: CompanionStore, bundle: SessionBundle): void {
  store.upsertSession({
    id: bundle.sessionId,
    title: bundle.title,
    platform: bundle.platform,
    startedAt: bundle.startedAt,
    endedAt: bundle.endedAt,
    // no chrome.storage copy exists for a pulled/imported meeting, so it must
    // not look like a locally captured one that was deleted (see pruneMissing)
    source: 'remote',
  });
  store.replaceEntries(bundle.sessionId, 'raw', bundle.entries);
  if (bundle.analysis) {
    const record: AnalysisRecord = {
      status: 'done',
      analysis: bundle.analysis,
      generatedAt: bundle.updatedAt,
      provider: 'sync',
    };
    store.setAnalysis(bundle.sessionId, record);
    store.indexAnalysis(bundle.sessionId, bundle.analysis);
  }
}

const headers = (config: SyncConfig): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  ...(config.workspaceId ? { 'X-Companion-Workspace': config.workspaceId } : {}),
});

export interface SyncReport {
  pushed: string[];
  pulled: string[];
  failed: { sessionId: string; error: string }[];
}

/**
 * Push everything queued in the outbox, then pull anything the workspace has
 * that is newer locally-unknown. Conflicts resolve by `updatedAt`
 * (last-writer-wins per meeting) — meetings are append-only in practice, so a
 * per-row merge would add machinery for a case that does not arise.
 */
export async function runSync(
  store: CompanionStore,
  config: SyncConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncReport> {
  const problem = validateSync(config);
  if (problem) throw new Error(problem);
  const base = config.endpoint.replace(/\/+$/, '');
  const report: SyncReport = { pushed: [], pulled: [], failed: [] };

  const pending = store.pendingSync();
  const sent: number[] = [];
  for (const item of pending) {
    const bundle = buildBundle(store, item.sessionId);
    if (!bundle) {
      sent.push(item.id); // meeting deleted locally: drop the queued push
      continue;
    }
    try {
      const payload = await encryptWithPassphrase(JSON.stringify(bundle), config.passphrase);
      const res = await fetchImpl(`${base}/sessions/${encodeURIComponent(bundle.sessionId)}`, {
        method: 'PUT',
        headers: headers(config),
        body: JSON.stringify({ sessionId: bundle.sessionId, updatedAt: bundle.updatedAt, payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      report.pushed.push(bundle.sessionId);
      sent.push(item.id);
    } catch (e) {
      report.failed.push({ sessionId: item.sessionId, error: (e as Error).message });
    }
  }
  store.markSynced(sent);

  const since = store.get('sync.cursor') ?? '';
  const listRes = await fetchImpl(
    `${base}/sessions?since=${encodeURIComponent(since)}`,
    { headers: headers(config) },
  );
  if (!listRes.ok) throw new Error(`Sync gagal membaca daftar (${listRes.status})`);
  const remote = (await listRes.json()) as { sessions?: RemoteRecord[] };

  let cursor = since;
  for (const rec of remote.sessions ?? []) {
    try {
      const bundle = parseBundle(await decryptWithPassphrase(rec.payload, config.passphrase));
      const local = store.getSession(bundle.sessionId);
      const localEntries = local ? store.countEntries(bundle.sessionId) : 0;
      // never let a remote copy shrink a transcript we captured ourselves
      if (!local || bundle.entries.length >= localEntries) {
        applyBundle(store, bundle);
        report.pulled.push(bundle.sessionId);
      }
      if (rec.updatedAt > cursor) cursor = rec.updatedAt;
    } catch (e) {
      report.failed.push({ sessionId: rec.sessionId, error: (e as Error).message });
    }
  }
  if (cursor) store.set('sync.cursor', cursor);
  return report;
}

// -- P2.8: sharing without a server --

export interface ShareOptions {
  /** Leave the transcript out and share only the analysis. */
  summaryOnly?: boolean;
}

/**
 * A share bundle is the same encrypted envelope, handed over as a file. The
 * recipient needs the passphrase; permission is therefore "who has the
 * passphrase", which is honest for a local-first tool with no accounts.
 */
export async function exportShare(
  store: CompanionStore,
  sessionId: string,
  passphrase: string,
  opts: ShareOptions = {},
): Promise<string> {
  const bundle = buildBundle(store, sessionId);
  if (!bundle) throw new Error(t('pkg.meeting.notFound'));
  if (opts.summaryOnly) bundle.entries = [];
  return encryptWithPassphrase(JSON.stringify(bundle), passphrase);
}

export async function importShare(
  store: CompanionStore,
  packed: string,
  passphrase: string,
): Promise<string> {
  const bundle = parseBundle(await decryptWithPassphrase(packed, passphrase));
  applyBundle(store, bundle);
  return bundle.sessionId;
}
