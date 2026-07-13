import { describe, expect, it } from 'vitest';
import type { Analysis, AnalysisRecord } from './types';
import {
  buildAgenda,
  collectDecisions,
  collectOpenQuestions,
  decisionTopics,
} from './aggregate';

const done = (
  id: string,
  generatedAt: string,
  over: Partial<Analysis> = {},
): [string, AnalysisRecord] => [
  `${id}`,
  {
    status: 'done',
    generatedAt,
    provider: 'openai',
    analysis: {
      executiveSummary: 'x',
      timeline: [],
      keyDiscussions: [],
      decisions: [],
      actionItems: [],
      risks: [],
      openQuestions: [],
      nextSteps: [],
      diagrams: [],
      ...over,
    },
  },
];

const records: Record<string, AnalysisRecord> = Object.fromEntries([
  done('mtg-old', '2026-07-10T00:00:00Z', {
    decisions: [{ what: 'Pakai Redis', why: 'kecil', rejected: ['Kafka'], topic: 'arsitektur' }],
    openQuestions: ['Siapa reviewer?'],
  }),
  done('mtg-new', '2026-07-13T00:00:00Z', {
    decisions: [
      { what: 'Rilis Jumat', why: '', rejected: [], topic: 'jadwal' },
      { what: 'Pakai PDF', why: '', rejected: [], topic: 'arsitektur' },
    ],
    openQuestions: ['Format apa?', 'Perlu QA?'],
  }),
  ['mtg-processing', { status: 'processing', step: 'ai', startedAt: '2026-07-13T00:00:00Z', provider: 'openai' }],
]);

describe('collectDecisions', () => {
  it('flattens all done decisions, newest meeting first, tagged with meeting id', () => {
    const d = collectDecisions(records);
    expect(d).toHaveLength(3);
    expect(d[0].meetingId).toBe('mtg-new'); // newest generatedAt first
    expect(d.every((x) => x.generatedAt)).toBe(true);
  });

  it('ignores non-done records', () => {
    expect(collectDecisions(records).some((d) => d.meetingId === 'mtg-processing')).toBe(false);
  });
});

describe('decisionTopics', () => {
  it('returns distinct non-empty topics', () => {
    expect(decisionTopics(collectDecisions(records)).sort()).toEqual(['arsitektur', 'jadwal']);
  });
});

describe('collectOpenQuestions', () => {
  it('marks questions resolved from the resolved map', () => {
    const qs = collectOpenQuestions(records, { 'mtg-new': ['Format apa?'] });
    const format = qs.find((q) => q.question === 'Format apa?');
    const qa = qs.find((q) => q.question === 'Perlu QA?');
    expect(format?.resolved).toBe(true);
    expect(qa?.resolved).toBe(false);
  });
});

describe('buildAgenda', () => {
  it('lists only unresolved questions grouped by meeting', () => {
    const qs = collectOpenQuestions(records, { 'mtg-new': ['Format apa?'] });
    const md = buildAgenda(qs);
    expect(md).toContain('# Agenda — carry-over');
    expect(md).toContain('## Dari mtg-new');
    expect(md).toContain('- [ ] Perlu QA?');
    expect(md).not.toContain('Format apa?'); // resolved -> excluded
    expect(md).toContain('- [ ] Siapa reviewer?');
  });

  it('says so when nothing is open', () => {
    expect(buildAgenda([])).toContain('Tidak ada pertanyaan terbuka');
  });
});
