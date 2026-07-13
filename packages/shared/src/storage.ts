import { decryptString, encryptString } from './crypto';
import { migrateAnalysis } from './migrate';
import {
  DEFAULT_SETTINGS,
  type AnalysisRecord,
  type AuditEvent,
  type ChatMessage,
  type DocType,
  type Entry,
  type Meeting,
  type MeetingDocs,
  type MeetingMeta,
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

export async function loadMeetings(): Promise<Meeting[]> {
  const all = await chrome.storage.local.get(null);
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

export async function loadAnalyses(): Promise<Record<string, AnalysisRecord>> {
  const all = await chrome.storage.local.get(null);
  const out: Record<string, AnalysisRecord> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(ANALYSIS_PREFIX) && value) {
      out[key.slice(ANALYSIS_PREFIX.length)] = migrateRecord(value as AnalysisRecord);
    }
  }
  return out;
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
    RESOLVED_PREFIX + id,
  ]);
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

export function watchStorage(onChange: () => void): () => void {
  const listener = () => onChange();
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// -- settings (API key encrypted at rest) --

export async function loadSettings(): Promise<Settings> {
  const raw = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  if (!raw) return { ...DEFAULT_SETTINGS };
  const s = { ...DEFAULT_SETTINGS, ...raw } as Settings;
  s.apiKey = await decryptString(s.apiKey);
  return s;
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...s, apiKey: await encryptString(s.apiKey) },
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
