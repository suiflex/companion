import type { CleanRecord, Entry } from './types';

// P0.2 — grounding needs a handle the model can cite and we can verify. The
// capture path only ever appends (or extends the last line in place), so an
// entry's position in the array is stable for the meeting's whole life; ids
// are therefore derived on read instead of stored, which also gives every
// pre-existing transcript ids without a migration.

export function entryId(index: number): string {
  return `E${index + 1}`;
}

export function withEntryIds(entries: Entry[]): Entry[] {
  return entries.map((e, i) => (e.id ? e : { ...e, id: entryId(i) }));
}

/** Lookup by id for evidence verification. Unknown ids simply miss. */
export function entriesById(entries: Entry[]): Map<string, Entry> {
  const map = new Map<string, Entry>();
  entries.forEach((e, i) => map.set(e.id ?? entryId(i), e));
  return map;
}

/** One line the AI rewrote, paired with what was actually said. */
export interface CleanChange {
  index: number;
  raw: string;
  cleaned: string;
  /** true when the user rejected the correction and kept the raw line. */
  kept: boolean;
}

export function cleanChanges(raw: Entry[], record: CleanRecord | null): CleanChange[] {
  if (record?.status !== 'done') return [];
  const kept = new Set(record.kept ?? []);
  const out: CleanChange[] = [];
  record.entries.forEach((e, i) => {
    const original = raw[i];
    if (!original || original.text === e.text) return;
    out.push({ index: i, raw: original.text, cleaned: e.text, kept: kept.has(i) });
  });
  return out;
}

/**
 * The transcript downstream AI should actually read: cleaned lines, except
 * where the user kept the original, plus any raw lines captured after the
 * cleanup ran. One function so the UI, the service worker and the index can
 * never disagree about what the "clean" transcript is.
 */
export function effectiveClean(raw: Entry[], record: CleanRecord | null): Entry[] {
  if (record?.status !== 'done' || !record.entries.length) return raw;
  const kept = new Set(record.kept ?? []);
  const merged = record.entries.map((e, i) => (kept.has(i) && raw[i] ? raw[i] : e));
  return raw.length > merged.length ? merged.concat(raw.slice(merged.length)) : merged;
}
