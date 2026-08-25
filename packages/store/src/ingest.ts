import {
  ANALYSIS_PREFIX,
  CHAT_PREFIX,
  CLEAN_PREFIX,
  DOCS_PREFIX,
  META_PREFIX,
  RESOLVED_PREFIX,
  TITLE_PREFIX,
  TRANSCRIPT_PREFIX,
  effectiveClean,
  parseMeetings,
  type AnalysisRecord,
  type ChatMessage,
  type CleanRecord,
  type DocType,
  type Entry,
  type MeetingDocs,
} from '@meetcc/shared';
import type { CompanionStore, EvidenceResolver } from './store';

// Roadmap §30 — migration in phases, never a big-bang swap.
//
// Phase 2 here: read the whole chrome.storage.local dump and rebuild the
// SQLite index from it, verifying counts afterwards. chrome.storage.local is
// left completely untouched, which is what keeps Phase 3 (a rollback window)
// possible: if the database is ever lost or corrupted, deleting it and
// re-ingesting reproduces it exactly.

export const MIGRATION_KEY = 'migration.chromeStorage';

export interface IngestReport {
  sessions: number;
  entries: number;
  analyses: number;
  chats: number;
  documents: number;
  /** Session ids whose transcript length in SQLite != the storage copy. */
  mismatched: string[];
  /** Locally captured meetings that are gone from storage and were dropped. */
  pruned: string[];
}

/**
 * True when the index already matches storage for this meeting. The sweep runs
 * every minute over every meeting, so without this an unchanged two-hour
 * transcript would be deleted and re-inserted 60 times an hour. Transcripts
 * are append-only (the last line can still grow), so "same count, same last
 * line" is exactly the condition under which there is nothing to do.
 */
export function isIndexCurrent(store: CompanionStore, id: string, entries: Entry[]): boolean {
  if (store.countEntries(id, 'raw') !== entries.length) return false;
  if (!entries.length) return true;
  const stored = store.getEntries(id, 'raw');
  const last = entries[entries.length - 1];
  const storedLast = stored[stored.length - 1];
  return storedLast?.text === last.text && storedLast?.time === last.time;
}

/** Ingest one meeting's keys. Exported so a live meeting can be re-synced
 *  incrementally without replaying the entire dump. */
export function ingestMeeting(
  store: CompanionStore,
  id: string,
  all: Record<string, unknown>,
  findEvidence?: (entries: Entry[]) => EvidenceResolver,
): void {
  const entries = (all[TRANSCRIPT_PREFIX + id] as Entry[] | undefined) ?? [];
  const meta = all[META_PREFIX + id] as { startedAt?: string; lastSeenAt?: string } | undefined;
  const title = all[TITLE_PREFIX + id];

  store.upsertSession({
    id,
    startedAt: meta?.startedAt ?? entries[0]?.time ?? null,
    endedAt: meta?.lastSeenAt ?? entries[entries.length - 1]?.time ?? null,
    title: typeof title === 'string' ? title : '',
  });
  const transcriptChanged = !isIndexCurrent(store, id, entries);
  if (transcriptChanged) store.replaceEntries(id, 'raw', entries);

  const clean = all[CLEAN_PREFIX + id] as CleanRecord | undefined;
  if (clean?.entries?.length && store.countEntries(id, 'clean') !== clean.entries.length) {
    store.replaceEntries(id, 'clean', effectiveClean(entries, clean));
  }

  const record = all[ANALYSIS_PREFIX + id] as AnalysisRecord | undefined;
  if (record) {
    const previous = store.getAnalysis(id);
    const analysisChanged =
      !previous ||
      previous.status !== record.status ||
      (record.status === 'done' && previous.status === 'done' && previous.generatedAt !== record.generatedAt);
    store.setAnalysis(id, record);
    // re-extracting the memory also rewrites evidence links, so it only runs
    // when the analysis or the transcript underneath it actually changed
    if (record.status === 'done' && (analysisChanged || transcriptChanged)) {
      store.indexAnalysis(id, record.analysis, findEvidence?.(entries));
      const resolved = all[RESOLVED_PREFIX + id];
      if (Array.isArray(resolved) && resolved.length) {
        for (const q of store.questions({ sessionId: id })) {
          if ((resolved as string[]).includes(q.question)) store.resolveQuestion(q.id, id);
        }
      }
    }
  }

  const chat = all[CHAT_PREFIX + id] as ChatMessage[] | undefined;
  if (chat?.length && store.chat(id, chat.length + 1).length !== chat.length) {
    store.clearChat(id);
    for (const m of chat) store.appendChat(id, m);
  }

  const docs = all[DOCS_PREFIX + id] as MeetingDocs | undefined;
  if (docs) {
    for (const [type, doc] of Object.entries(docs)) {
      if (doc) store.saveDoc(id, type as DocType, doc);
    }
  }
}

/**
 * Rebuild the whole index from a chrome.storage.local dump. Idempotent: every
 * write is an upsert or a replace, so running it again after new captures is
 * the normal way to keep SQLite in step.
 */
export function ingestAll(
  store: CompanionStore,
  all: Record<string, unknown>,
  findEvidence?: (entries: Entry[]) => EvidenceResolver,
): IngestReport {
  const meetings = parseMeetings(all);
  const report: IngestReport = {
    sessions: 0,
    entries: 0,
    analyses: 0,
    chats: 0,
    documents: 0,
    mismatched: [],
    pruned: [],
  };

  for (const m of meetings) {
    ingestMeeting(store, m.id, all, findEvidence);
    report.sessions++;
    report.entries += m.entries.length;
    if (all[ANALYSIS_PREFIX + m.id]) report.analyses++;
    if ((all[CHAT_PREFIX + m.id] as unknown[] | undefined)?.length) report.chats++;
    report.documents += Object.keys((all[DOCS_PREFIX + m.id] as object) ?? {}).length;

    // verification (§30 Phase 2): a silent partial import is worse than a
    // failed one, so every meeting's line count is checked against the source
    if (store.countEntries(m.id, 'raw') !== m.entries.length) report.mismatched.push(m.id);
  }

  // A meeting the user deleted disappears from chrome.storage but would linger
  // in the index — and keep surfacing in search, Global Ask, continuity and MCP
  // snapshots. Pruning here catches every deletion path at once; meetings that
  // arrived by sync or share have no storage copy and are left alone.
  report.pruned = store.pruneMissing(meetings.map((m) => m.id));

  store.set(
    MIGRATION_KEY,
    JSON.stringify({ at: new Date().toISOString(), sessions: report.sessions, entries: report.entries }),
  );
  return report;
}

export function migrationStatus(store: CompanionStore): { at: string; sessions: number; entries: number } | null {
  const raw = store.get(MIGRATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { at: string; sessions: number; entries: number };
  } catch {
    return null;
  }
}
