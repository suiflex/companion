import { isLive, type AnalysisRecord, type Meeting } from '@meetcc/shared';

/** Don't burn AI calls on accidental joins / empty rooms. */
export const MIN_ENTRIES = 5;

/** A stuck 'processing' record older than this may be retried (SW died mid-run). */
export const STALE_PROCESSING_MS = 5 * 60_000;

/**
 * A meeting is "finished and awaiting analysis" when it has content,
 * its heartbeat went silent, and no non-stale analysis exists yet.
 * Pure function -> unit-testable without chrome.*
 */
export function needsAnalysis(
  meeting: Meeting,
  record: AnalysisRecord | null | undefined,
  now: number,
): boolean {
  if (meeting.entries.length < MIN_ENTRIES) return false;
  if (isLive(meeting, now)) return false;
  if (!record) return true;
  if (record.status === 'processing') {
    return now - Date.parse(record.startedAt) > STALE_PROCESSING_MS;
  }
  return false; // done or error: never auto-reprocess, only manual regenerate
}

export function findFinishedMeetings(
  meetings: Meeting[],
  records: Record<string, AnalysisRecord>,
  now: number,
): Meeting[] {
  return meetings.filter((m) => needsAnalysis(m, records[m.id], now));
}
