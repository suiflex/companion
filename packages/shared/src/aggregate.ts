import type { Analysis, AnalysisRecord, Decision } from './types';
import { t } from './i18n';

// Cross-meeting rollups for the decision log + carry-over (F3). Pure functions
// over the already-loaded analysis records, so they're unit-testable without
// chrome.* — the storage layer just feeds them raw data.

/** Longest title we auto-derive — the sidebar row is one line. */
export const TITLE_MAX_CHARS = 60;

/**
 * A human label for a meeting, taken from the first sentence of the executive
 * summary. Only a suggestion: the user can always rename, and an empty result
 * means the UI falls back to the meeting id.
 */
export function deriveTitle(analysis: Analysis): string {
  const summary = analysis.executiveSummary.trim().replace(/\s+/g, ' ');
  if (!summary) return '';
  // first sentence, but only when the split leaves something usable
  const sentence = summary.split(/(?<=[.!?])\s/)[0] || summary;
  const text = sentence.length >= 12 ? sentence : summary;
  if (text.length <= TITLE_MAX_CHARS) return text.replace(/[.\s]+$/, '');
  const cut = text.slice(0, TITLE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[,.\s]+$/, '') + '…';
}

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
    lines.push(t('pkg.agenda.noOpenQuestions'));
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
