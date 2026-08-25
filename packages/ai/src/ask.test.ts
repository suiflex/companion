import { describe, expect, it, vi } from 'vitest';
import type { Analysis, ChatMessage, Meeting } from '@meetcc/shared';
import {
  askMeeting,
  askTranscript,
  buildAskPrompt,
  fallbackPlan,
  MAX_HISTORY_TURNS,
  parseAskResult,
  parsePlan,
  verifyEvidence,
} from './ask';
import { AIError, type AIClient } from './client';

const meeting: Meeting = {
  id: 'abc-defg-hij',
  meta: { id: 'abc-defg-hij', startedAt: '2026-07-13T01:00:00Z', lastSeenAt: '2026-07-13T02:00:00Z' },
  entries: [
    { speaker: 'Gunawan', text: 'Deadline rilis Jumat depan', time: '2026-07-13T01:00:05Z' },
    { speaker: 'Manan', text: 'Siap, saya kerjakan', time: '2026-07-13T01:01:00Z' },
  ],
};

const analysis = { executiveSummary: 'Bahas jadwal rilis.' } as Analysis;

const clientOf = (fn: () => Promise<string>): AIClient => ({ provider: 'custom', complete: fn });

const PLAN = JSON.stringify({ intent: 'recall', keywords: ['deadline'], relatedTerms: ['rilis'] });

/** Ask v2 makes two calls: the query plan, then the answer. */
function scripted(...replies: string[]): { client: AIClient; calls: () => number } {
  let i = 0;
  return {
    client: clientOf(async () => replies[Math.min(i++, replies.length - 1)]),
    calls: () => i,
  };
}

const answerJson = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    answer: 'Deadline rilis Jumat depan.',
    answerability: 'explicit',
    confidence: 0.9,
    evidence: ['E1'],
    missing: [],
    followUps: ['Siapa yang mengerjakan?'],
    ...over,
  });

describe('buildAskPrompt', () => {
  it('embeds transcript, citable entry ids, summary, and question', () => {
    const p = buildAskPrompt(meeting, analysis, [], 'Kapan deadline?');
    expect(p).toContain('Gunawan:');
    expect(p).toContain('[E1]');
    expect(p).toContain('Deadline rilis');
    expect(p).toContain('Bahas jadwal rilis.');
    expect(p).toContain('Pertanyaan: Kapan deadline?');
  });

  it('includes only the most recent turns of history', () => {
    const history: ChatMessage[] = Array.from({ length: MAX_HISTORY_TURNS + 4 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn-${i}`,
      time: '2026-07-13T01:00:00Z',
    }));
    const p = buildAskPrompt(meeting, null, history, 'lanjut?');
    expect(p).not.toContain('turn-0');
    expect(p).toContain(`turn-${MAX_HISTORY_TURNS + 3}`);
  });
});

describe('query planner', () => {
  it('parses a valid plan', () => {
    const plan = parsePlan(PLAN, 'kapan deadline?');
    expect(plan).toEqual({ intent: 'recall', keywords: ['deadline'], relatedTerms: ['rilis'] });
  });

  it('falls back to the question terms when the model answers garbage', () => {
    const plan = parsePlan('maaf, saya tidak bisa', 'kenapa opsi shared dipilih?');
    expect(plan.intent).toBe('explain');
    expect(plan.keywords).toContain('shared');
  });

  it('keeps the question terms when the model returns an empty keyword list', () => {
    const plan = parsePlan(JSON.stringify({ intent: 'analyze', keywords: [] }), 'solusi terdampak');
    expect(plan.intent).toBe('analyze');
    expect(plan.keywords).toEqual(['solusi', 'terdampak']);
  });

  it('detects an advise question so the UI can separate it from meeting content', () => {
    expect(fallbackPlan('menurutmu sebaiknya bagaimana?').intent).toBe('advise');
  });
});

describe('verifyEvidence', () => {
  const entries = [
    { id: 'E1', speaker: 'A', text: 'satu', time: '2026-07-13T01:00:00Z' },
    { id: 'E2', speaker: 'B', text: 'dua', time: '2026-07-13T01:00:30Z' },
    { id: 'E5', speaker: 'C', text: 'lima', time: '2026-07-13T01:02:00Z' },
  ];

  it('merges consecutive ids into one span with real timestamps', () => {
    const spans = verifyEvidence(entries, ['E1', 'E2']);
    expect(spans).toHaveLength(1);
    expect(spans[0].entryIds).toEqual(['E1', 'E2']);
    expect(spans[0].startTime).toBe('2026-07-13T01:00:00Z');
    expect(spans[0].endTime).toBe('2026-07-13T01:00:30Z');
    expect(spans[0].speakers).toEqual(['A', 'B']);
  });

  it('drops ids that do not exist in the transcript', () => {
    expect(verifyEvidence(entries, ['E1', 'E999'])).toHaveLength(1);
    expect(verifyEvidence(entries, ['E42'])).toEqual([]);
  });
});

describe('parseAskResult', () => {
  const entries = [{ id: 'E1', speaker: 'Gunawan', text: 'Deadline Jumat', time: '2026-07-13T01:00:00Z' }];
  const plan = fallbackPlan('kapan deadline?');

  it('returns a grounded structured result', () => {
    const r = parseAskResult(answerJson(), entries, plan);
    expect(r.answerability).toBe('explicit');
    expect(r.evidence[0].entryIds).toEqual(['E1']);
    expect(r.followUps).toEqual(['Siapa yang mengerjakan?']);
    expect(r.intent).toBe('recall');
  });

  it('downgrades "explicit" to "inferred" when no cited id survives verification', () => {
    const r = parseAskResult(answerJson({ evidence: ['E99'] }), entries, plan);
    expect(r.answerability).toBe('inferred');
    expect(r.evidence).toEqual([]);
    expect(r.confidence).toBeLessThanOrEqual(0.4);
  });

  it('accepts evidence given as objects', () => {
    const r = parseAskResult(answerJson({ evidence: [{ entryIds: ['E1'] }] }), entries, plan);
    expect(r.evidence[0].entryIds).toEqual(['E1']);
  });

  it('rejects a non-JSON or empty answer as retryable', () => {
    expect(() => parseAskResult('bukan json', entries, plan)).toThrow(AIError);
    expect(() => parseAskResult(answerJson({ answer: '  ' }), entries, plan)).toThrow(AIError);
  });
});

describe('askMeeting', () => {
  it('plans, answers, and verifies in one round', async () => {
    const s = scripted(PLAN, answerJson());
    const r = await askMeeting(s.client, meeting, analysis, [], 'Kapan deadline?');
    expect(s.calls()).toBe(2);
    expect(r.answer).toBe('Deadline rilis Jumat depan.');
    expect(r.evidence[0].speakers).toEqual(['Gunawan']);
  });

  it('still answers when the planner call fails', async () => {
    let first = true;
    const client = clientOf(async () => {
      if (first) {
        first = false;
        throw new AIError('planner down', false);
      }
      return answerJson();
    });
    const r = await askMeeting(client, meeting, null, [], 'Kapan deadline?');
    expect(r.answerability).toBe('explicit');
  });

  it('rejects an empty question without calling the model', async () => {
    const complete = vi.fn(async () => 'x');
    await expect(askMeeting(clientOf(complete), meeting, null, [], '   ')).rejects.toThrow(AIError);
    expect(complete).not.toHaveBeenCalled();
  });

  it('retries the answer once on a retryable error then succeeds', async () => {
    let calls = 0;
    const client = clientOf(async () => {
      calls++;
      if (calls === 1) return PLAN;
      if (calls === 2) throw new AIError('rate limited', true);
      return answerJson({ answer: 'jawaban' });
    });
    const r = await askMeeting(client, meeting, null, [], 'tanya');
    expect(calls).toBe(3);
    expect(r.answer).toBe('jawaban');
  });

  it('does not retry a non-retryable answer error', async () => {
    let calls = 0;
    const client = clientOf(async () => {
      calls++;
      if (calls === 1) return PLAN;
      throw new AIError('bad key', false);
    });
    await expect(askMeeting(client, meeting, null, [], 'tanya')).rejects.toThrow('bad key');
    expect(calls).toBe(2);
  });

  it('askTranscript still returns just the answer text', async () => {
    const s = scripted(PLAN, answerJson({ answer: '  Deadline Jumat depan.  ' }));
    await expect(askTranscript(s.client, meeting, null, [], 'Kapan?')).resolves.toBe(
      'Deadline Jumat depan.',
    );
  });
});
