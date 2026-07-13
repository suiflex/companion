import { describe, expect, it } from 'vitest';
import type { Meeting } from '@meetcc/shared';
import { analyzeMeeting, buildUserPrompt, formatTranscript, parseAnalysis } from './analyze';
import { AIError, type AIClient } from './client';

const meeting: Meeting = {
  id: 'abc-defg-hij',
  meta: { id: 'abc-defg-hij', startedAt: '2026-07-13T01:00:00Z', lastSeenAt: '2026-07-13T02:00:00Z' },
  entries: [
    { speaker: 'Manan', text: 'PDF logonya masih geser', time: '2026-07-13T01:00:05Z' },
    { speaker: 'Gunawan', text: 'Saya ambil filter kondisi di WS', time: '2026-07-13T01:01:00Z' },
  ],
};

const VALID = JSON.stringify({
  executiveSummary: 'Bahas perbaikan PDF invoice.',
  timeline: [{ time: '01:00', topic: 'PDF layout' }],
  keyDiscussions: ['Logo PDF geser'],
  decisions: ['Perbaiki template PDF'],
  actionItems: [{ task: 'Fix logo', owner: 'Gunawan', due: 'besok' }],
  risks: [],
  openQuestions: [],
  nextSteps: ['Review ulang'],
});

describe('parseAnalysis', () => {
  it('parses clean JSON', () => {
    const a = parseAnalysis(VALID);
    expect(a.executiveSummary).toContain('PDF');
    expect(a.actionItems[0]).toEqual({ task: 'Fix logo', owner: 'Gunawan', due: 'besok' });
  });

  it('parses JSON wrapped in markdown fences and prose', () => {
    const a = parseAnalysis('Berikut hasilnya:\n```json\n' + VALID + '\n```\nSemoga membantu.');
    // decisions are normalized from the old string form to the enriched shape
    expect(a.decisions).toEqual([{ what: 'Perbaiki template PDF', why: '', rejected: [], topic: '' }]);
  });

  it('accepts the enriched decision object shape', () => {
    const a = parseAnalysis(
      JSON.stringify({
        executiveSummary: 'ok',
        decisions: [
          { what: 'Pakai Redis', why: 'Volume kecil', rejected: ['Kafka — overkill'], topic: 'arsitektur' },
          { what: '', why: 'x' }, // no `what` -> dropped
        ],
      }),
    );
    expect(a.decisions).toEqual([
      { what: 'Pakai Redis', why: 'Volume kecil', rejected: ['Kafka — overkill'], topic: 'arsitektur' },
    ]);
  });

  it('drops malformed items instead of failing', () => {
    const a = parseAnalysis(
      JSON.stringify({
        executiveSummary: 'ok',
        actionItems: [{ task: '' }, { task: 'valid' }, 'garbage'],
        timeline: [{ topic: '' }, { time: '01:00', topic: 'x' }],
      }),
    );
    expect(a.actionItems).toEqual([{ task: 'valid', owner: '', due: '' }]);
    expect(a.timeline).toEqual([{ time: '01:00', topic: 'x' }]);
    expect(a.risks).toEqual([]);
  });

  it('throws AIError on non-JSON and on missing summary', () => {
    expect(() => parseAnalysis('maaf, saya tidak bisa')).toThrow(AIError);
    expect(() => parseAnalysis('{"executiveSummary": ""}')).toThrow(AIError);
  });

  it('defaults diagrams to [] and keeps only valid ones', () => {
    expect(parseAnalysis(VALID).diagrams).toEqual([]);
    const withDiagrams = parseAnalysis(
      JSON.stringify({
        executiveSummary: 'ok',
        diagrams: [
          { title: 'Alur', type: 'flowchart', mermaid: 'flowchart TB\nA-->B' },
          { title: 'bad', type: 'mindmap', mermaid: 'mindmap' },
        ],
      }),
    );
    expect(withDiagrams.diagrams).toHaveLength(1);
    expect(withDiagrams.diagrams[0].type).toBe('flowchart');
  });
});

describe('formatTranscript / buildUserPrompt', () => {
  it('includes speakers and meeting id', () => {
    const p = buildUserPrompt(meeting);
    expect(p).toContain('abc-defg-hij');
    expect(p).toContain('Manan:');
  });

  it('truncates very long transcripts around the middle', () => {
    const long: Meeting = {
      ...meeting,
      entries: Array.from({ length: 2000 }, (_, i) => ({
        speaker: 'A',
        text: 'kata '.repeat(20) + i,
        time: '2026-07-13T01:00:00Z',
      })),
    };
    const t = formatTranscript(long);
    expect(t.length).toBeLessThan(70_000);
    expect(t).toContain('dipotong');
  });
});

describe('analyzeMeeting retry', () => {
  const clientOf = (fn: () => Promise<string>): AIClient => ({ provider: 'custom', complete: fn });

  it('retries once on retryable error then succeeds', async () => {
    let calls = 0;
    const client = clientOf(async () => {
      if (++calls === 1) throw new AIError('rate limited', true);
      return VALID;
    });
    const a = await analyzeMeeting(client, meeting);
    expect(calls).toBe(2);
    expect(a.executiveSummary).toBeTruthy();
  });

  it('does not retry on non-retryable error', async () => {
    let calls = 0;
    const client = clientOf(async () => {
      calls++;
      throw new AIError('bad api key', false);
    });
    await expect(analyzeMeeting(client, meeting)).rejects.toThrow('bad api key');
    expect(calls).toBe(1);
  });
});
