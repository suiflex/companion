import { decryptString, encryptString } from './crypto';
import { migrateAnalysis } from './migrate';
import {
  DEFAULT_INTEGRATIONS,
  DEFAULT_OAUTH,
  DEFAULT_SETTINGS,
  type AnalysisRecord,
  type AuditEvent,
  type ChatMessage,
  type CleanRecord,
  type DocProgressRecord,
  type DocType,
  type Entry,
  type IntegrationSettings,
  type Meeting,
  type MeetingDocs,
  type MeetingMeta,
  type OAuthSettings,
  type Settings,
  type StoredDoc,
} from './types';

/** Old stored 'done' records predate later Analysis fields; migrate on read. */
function migrateRecord(r: AnalysisRecord): AnalysisRecord {
  return r.status === 'done' ? { ...r, analysis: migrateAnalysis(r.analysis) } : r;
}

export const TRANSCRIPT_PREFIX = 'transcript:';
export const META_PREFIX = 'meta:';
export const ANALYSIS_PREFIX = 'analysis:';
export const CHAT_PREFIX = 'chat:';
export const DOCS_PREFIX = 'docs:';
export const RESOLVED_PREFIX = 'resolved:';
export const CLEAN_PREFIX = 'clean:';
export const DOCPROG_PREFIX = 'docprog:';
export const TITLE_PREFIX = 'title:';
const SETTINGS_KEY = 'settings';
const AUDIT_KEY = 'audit';

/** Heartbeat is every 5s; 15s of silence means the tab left the call. */
export const LIVE_THRESHOLD_MS = 15_000;

export function isLive(m: Meeting, now: number): boolean {
  return !!m.meta && now - Date.parse(m.meta.lastSeenAt) < LIVE_THRESHOLD_MS;
}

export function startedAt(m: Meeting): string | null {
  return m.meta?.startedAt ?? m.entries[0]?.time ?? null;
}

export function lastActivity(m: Meeting): number {
  const t = m.meta?.lastSeenAt ?? m.entries[m.entries.length - 1]?.time;
  return t ? Date.parse(t) : 0;
}

export function participants(m: Meeting): string[] {
  return [...new Set(m.entries.map((e) => e.speaker))];
}

/**
 * chrome.storage.local has no key-enumeration API, so listing meetings always
 * costs one full `get(null)`. Parsing is split out from fetching so a caller
 * that needs several views (dashboard) pays for that dump once instead of
 * once per view — see `loadDashboard`.
 */
export function parseMeetings(all: Record<string, unknown>): Meeting[] {
  const byId = new Map<string, Meeting>();
  const get = (id: string): Meeting => {
    let m = byId.get(id);
    if (!m) {
      m = { id, meta: null, entries: [] };
      byId.set(id, m);
    }
    return m;
  };
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(TRANSCRIPT_PREFIX) && Array.isArray(value)) {
      get(key.slice(TRANSCRIPT_PREFIX.length)).entries = value as Entry[];
    } else if (key.startsWith(META_PREFIX) && value) {
      get(key.slice(META_PREFIX.length)).meta = value as MeetingMeta;
    }
  }
  // Sort by start time, NOT lastActivity: live heartbeats bump lastSeenAt
  // every 5s, so concurrent meetings would leapfrog each other and the
  // sidebar would keep reordering. startedAt is immutable for a meeting's
  // whole life (kept across rejoins) -> stable order, newest first.
  const sortKey = (m: Meeting): number => {
    const s = startedAt(m);
    return s ? Date.parse(s) : lastActivity(m);
  };
  return [...byId.values()].sort(
    (a, b) => sortKey(b) - sortKey(a) || a.id.localeCompare(b.id),
  );
}

export function parseAnalyses(all: Record<string, unknown>): Record<string, AnalysisRecord> {
  const out: Record<string, AnalysisRecord> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(ANALYSIS_PREFIX) && value) {
      out[key.slice(ANALYSIS_PREFIX.length)] = migrateRecord(value as AnalysisRecord);
    }
  }
  return out;
}

export function parseTitles(all: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(TITLE_PREFIX) && typeof value === 'string' && value) {
      out[key.slice(TITLE_PREFIX.length)] = value;
    }
  }
  return out;
}

export async function loadMeetings(): Promise<Meeting[]> {
  return parseMeetings(await chrome.storage.local.get(null));
}

export async function loadAnalyses(): Promise<Record<string, AnalysisRecord>> {
  return parseAnalyses(await chrome.storage.local.get(null));
}

export interface DashboardData {
  meetings: Meeting[];
  records: Record<string, AnalysisRecord>;
  titles: Record<string, string>;
}

/** Everything the dashboard renders, from a single storage dump. */
export async function loadDashboard(): Promise<DashboardData> {
  const all = await chrome.storage.local.get(null);
  return {
    meetings: parseMeetings(all),
    records: parseAnalyses(all),
    titles: parseTitles(all),
  };
}

// -- meeting title (auto-derived from the analysis, user-overridable) --

export async function getTitle(id: string): Promise<string> {
  const v = (await chrome.storage.local.get(TITLE_PREFIX + id))[TITLE_PREFIX + id];
  return typeof v === 'string' ? v : '';
}

/** Empty/blank title removes the override so the UI falls back to the id. */
export async function saveTitle(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return chrome.storage.local.remove(TITLE_PREFIX + id);
  await chrome.storage.local.set({ [TITLE_PREFIX + id]: trimmed });
}

export async function getAnalysis(id: string): Promise<AnalysisRecord | null> {
  const r = (await chrome.storage.local.get(ANALYSIS_PREFIX + id))[ANALYSIS_PREFIX + id];
  return r ? migrateRecord(r as AnalysisRecord) : null;
}

export async function setAnalysis(id: string, record: AnalysisRecord): Promise<void> {
  await chrome.storage.local.set({ [ANALYSIS_PREFIX + id]: record });
}

export async function clearMeeting(id: string): Promise<void> {
  await chrome.storage.local.remove([
    TRANSCRIPT_PREFIX + id,
    META_PREFIX + id,
    ANALYSIS_PREFIX + id,
    CHAT_PREFIX + id,
    DOCS_PREFIX + id,
    DOCPROG_PREFIX + id,
    RESOLVED_PREFIX + id,
    CLEAN_PREFIX + id,
    TITLE_PREFIX + id,
  ]);
}

// -- cleaned transcript (AI-corrected ASR errors, kept alongside the raw one) --

export async function loadClean(id: string): Promise<CleanRecord | null> {
  return (await chrome.storage.local.get(CLEAN_PREFIX + id))[CLEAN_PREFIX + id] ?? null;
}

export async function saveClean(id: string, data: CleanRecord): Promise<void> {
  await chrome.storage.local.set({ [CLEAN_PREFIX + id]: data });
}

export async function clearClean(id: string): Promise<void> {
  await chrome.storage.local.remove(CLEAN_PREFIX + id);
}

// -- carry-over: which open questions have been marked resolved, per meeting --

export async function loadAllResolved(): Promise<Record<string, string[]>> {
  const all = await chrome.storage.local.get(null);
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(RESOLVED_PREFIX) && Array.isArray(value)) {
      out[key.slice(RESOLVED_PREFIX.length)] = value as string[];
    }
  }
  return out;
}

/** Toggle a single open question's resolved state; returns the new state. */
export async function toggleResolved(id: string, question: string): Promise<boolean> {
  const key = RESOLVED_PREFIX + id;
  const list: string[] = (await chrome.storage.local.get(key))[key] ?? [];
  const set = new Set(list);
  const nowResolved = !set.has(question);
  if (nowResolved) set.add(question);
  else set.delete(question);
  await chrome.storage.local.set({ [key]: [...set] });
  return nowResolved;
}

// -- chat with transcript (per-meeting Q&A history) --

export async function loadChat(id: string): Promise<ChatMessage[]> {
  const v = (await chrome.storage.local.get(CHAT_PREFIX + id))[CHAT_PREFIX + id];
  return Array.isArray(v) ? (v as ChatMessage[]) : [];
}

export async function saveChat(id: string, messages: ChatMessage[]): Promise<void> {
  // cap history so a long-running Q&A never bloats storage
  await chrome.storage.local.set({ [CHAT_PREFIX + id]: messages.slice(-100) });
}

export async function clearChat(id: string): Promise<void> {
  await chrome.storage.local.remove(CHAT_PREFIX + id);
}

// -- generated documents (BRD / PRD / notulen), per meeting --

export async function loadDocs(id: string): Promise<MeetingDocs> {
  return (await chrome.storage.local.get(DOCS_PREFIX + id))[DOCS_PREFIX + id] ?? {};
}

export async function saveDoc(id: string, type: DocType, doc: StoredDoc): Promise<void> {
  const docs = await loadDocs(id);
  docs[type] = doc;
  await chrome.storage.local.set({ [DOCS_PREFIX + id]: docs });
}

export async function loadDocProgress(id: string): Promise<DocProgressRecord | null> {
  return (await chrome.storage.local.get(DOCPROG_PREFIX + id))[DOCPROG_PREFIX + id] ?? null;
}

export async function saveDocProgress(id: string, p: DocProgressRecord): Promise<void> {
  await chrome.storage.local.set({ [DOCPROG_PREFIX + id]: p });
}

export async function clearDocProgress(id: string): Promise<void> {
  await chrome.storage.local.remove(DOCPROG_PREFIX + id);
}

/** A live meeting writes its transcript every 500ms; without coalescing every
 *  watcher re-read the whole of storage twice a second. */
export const WATCH_DEBOUNCE_MS = 400;

/** True when at least one changed key is one this watcher cares about. */
export function matchesPrefixes(keys: string[], prefixes?: string[]): boolean {
  if (!prefixes?.length) return true;
  return keys.some((k) => prefixes.some((p) => k.startsWith(p)));
}

/**
 * Subscribe to storage changes, debounced and (optionally) narrowed to the
 * key prefixes the caller actually reads — a transcript write should not make
 * the document tab reload its documents.
 */
export function watchStorage(onChange: () => void, prefixes?: string[]): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listener = (changes: Record<string, unknown>) => {
    if (!matchesPrefixes(Object.keys(changes), prefixes)) return;
    clearTimeout(timer);
    timer = setTimeout(onChange, WATCH_DEBOUNCE_MS);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => {
    clearTimeout(timer);
    chrome.storage.onChanged.removeListener(listener);
  };
}

// -- settings (API key encrypted at rest) --

/** Integration secrets get the same at-rest treatment as the provider key:
 *  encrypted on write, decrypted on read, never stored in plain text. */
async function mapSecrets(
  integrations: IntegrationSettings,
  fn: (value: string) => Promise<string>,
): Promise<IntegrationSettings> {
  return {
    ...integrations,
    tracker: { ...integrations.tracker, token: await fn(integrations.tracker.token) },
    sync: {
      ...integrations.sync,
      token: await fn(integrations.sync.token),
      passphrase: await fn(integrations.sync.passphrase),
    },
    transcription: { ...integrations.transcription, apiKey: await fn(integrations.transcription.apiKey) },
  };
}

/** OAuth tokens are credentials like any other: encrypted on write, decrypted
 *  on read. The account id, project id and email are not secrets and stay
 *  readable so the settings page can name the connected account. */
async function mapOAuthSecrets(
  oauth: OAuthSettings,
  fn: (value: string) => Promise<string>,
): Promise<OAuthSettings> {
  return {
    ...oauth,
    accessToken: await fn(oauth.accessToken),
    refreshToken: await fn(oauth.refreshToken),
  };
}

/** Merge stored settings over the defaults without losing nested defaults when
 *  an older install has no `integrations` block at all. */
function withDefaults(raw: Partial<Settings>): Settings {
  const stored = raw.integrations ?? DEFAULT_INTEGRATIONS;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    oauth: { ...DEFAULT_OAUTH, ...raw.oauth },
    byProvider: { ...raw.byProvider },
    integrations: {
      ...DEFAULT_INTEGRATIONS,
      ...stored,
      tracker: { ...DEFAULT_INTEGRATIONS.tracker, ...stored.tracker },
      sync: { ...DEFAULT_INTEGRATIONS.sync, ...stored.sync },
      transcription: { ...DEFAULT_INTEGRATIONS.transcription, ...stored.transcription },
    },
  };
}

export async function loadSettings(): Promise<Settings> {
  const raw = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  if (!raw) return { ...DEFAULT_SETTINGS };
  const s = withDefaults(raw as Partial<Settings>);
  s.apiKey = await decryptString(s.apiKey);
  s.oauth = await mapOAuthSecrets(s.oauth, decryptString);
  s.integrations = await mapSecrets(s.integrations, decryptString);
  // retention drives irreversible deletion: anything not a positive finite
  // number falls back to "keep forever" rather than to some guessed window
  s.retentionDays =
    Number.isFinite(s.retentionDays) && s.retentionDays > 0 ? Math.floor(s.retentionDays) : 0;
  return s;
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      ...s,
      apiKey: await encryptString(s.apiKey),
      oauth: await mapOAuthSecrets(s.oauth, encryptString),
      integrations: await mapSecrets(s.integrations, encryptString),
    },
  });
}

// -- audit log (capped ring) --

export async function appendAudit(event: string, detail = ''): Promise<void> {
  const log: AuditEvent[] = (await chrome.storage.local.get(AUDIT_KEY))[AUDIT_KEY] ?? [];
  log.push({ time: new Date().toISOString(), event, detail });
  await chrome.storage.local.set({ [AUDIT_KEY]: log.slice(-200) });
}

export async function loadAudit(): Promise<AuditEvent[]> {
  return (await chrome.storage.local.get(AUDIT_KEY))[AUDIT_KEY] ?? [];
}
