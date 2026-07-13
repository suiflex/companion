import type { AnalysisRecord, Decision } from './types';

// Cross-meeting rollups for the decision log + carry-over (F3). Pure functions
// over the already-loaded analysis records, so they're unit-testable without
// chrome.* — the storage layer just feeds them raw data.

export interface DecisionEntry extends Decision {
  meetingId: string;
  generatedAt: string;
}

export interface OpenQuestionEntry {
  meetingId: string;
  question: string;
  resolved: boolean;
  generatedAt: string;
}

function doneRecords(
  records: Record<string, AnalysisRecord>,
): Array<{ id: string; generatedAt: string; rec: Extract<AnalysisRecord, { status: 'done' }> }> {
  return Object.entries(records)
    .filter(([, r]) => r.status === 'done')
    .map(([id, r]) => ({ id, generatedAt: (r as { generatedAt: string }).generatedAt, rec: r as Extract<AnalysisRecord, { status: 'done' }> }))
    // newest meeting first; stable within a meeting
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
}

/** Every decision across all analyzed meetings, newest meeting first. */
export function collectDecisions(records: Record<string, AnalysisRecord>): DecisionEntry[] {
  const out: DecisionEntry[] = [];
  for (const { id, generatedAt, rec } of doneRecords(records)) {
    for (const d of rec.analysis.decisions ?? []) {
      out.push({ ...d, meetingId: id, generatedAt });
    }
  }
  return out;
}

/** Distinct decision topics (non-empty), in first-seen order. */
export function decisionTopics(decisions: DecisionEntry[]): string[] {
  return [...new Set(decisions.map((d) => d.topic).filter(Boolean))];
}

/**
 * Open questions across meetings, each tagged with whether it's been marked
 * resolved. `resolved` maps meetingId -> the list of question texts closed.
 */
export function collectOpenQuestions(
  records: Record<string, AnalysisRecord>,
  resolved: Record<string, string[]>,
): OpenQuestionEntry[] {
  const out: OpenQuestionEntry[] = [];
  for (const { id, generatedAt, rec } of doneRecords(records)) {
    const done = new Set(resolved[id] ?? []);
    for (const q of rec.analysis.openQuestions ?? []) {
      out.push({ meetingId: id, question: q, resolved: done.has(q), generatedAt });
    }
  }
  return out;
}

/** Markdown agenda draft of the still-open questions, grouped by meeting. */
export function buildAgenda(entries: OpenQuestionEntry[]): string {
  const open = entries.filter((e) => !e.resolved);
  const lines = ['# Agenda — carry-over', ''];
  if (!open.length) {
    lines.push('_Tidak ada pertanyaan terbuka yang tersisa._');
    return lines.join('\n');
  }
  const byMeeting = new Map<string, string[]>();
  for (const e of open) {
    const list = byMeeting.get(e.meetingId) ?? [];
    list.push(e.question);
    byMeeting.set(e.meetingId, list);
  }
  for (const [meetingId, questions] of byMeeting) {
    lines.push(`## Dari ${meetingId}`, '');
    for (const q of questions) lines.push(`- [ ] ${q}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
