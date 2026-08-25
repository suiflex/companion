import { describe, expect, it } from 'vitest';
import type { Meeting } from '@meetcc/shared';
import {
  analyzeMeeting,
  buildUserPrompt,
  chunkEntries,
  formatEntries,
  formatTranscript,
  mergeAnalyses,
  parseAnalysis,
} from './analyze';
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

describe('chunkEntries', () => {
  const entries = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      speaker: 'A',
      text: `baris ${i}`,
      time: '2026-07-13T01:00:00Z',
    }));

  it('keeps a short transcript in one chunk', () => {
    expect(chunkEntries(entries(10))).toHaveLength(1);
  });

  it('splits so no chunk exceeds the budget, losing no entry and keeping order', () => {
    const all = entries(50);
    const budget = formatEntries(all.slice(0, 6)).length;
    const chunks = chunkEntries(all, budget);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(formatEntries(c).length).toBeLessThanOrEqual(budget);
    expect(chunks.flat()).toEqual(all);
  });

  it('gives an oversized single entry its own chunk instead of dropping it', () => {
    const chunks = chunkEntries(entries(3), 1);
    expect(chunks).toHaveLength(3);
    expect(chunks.flat()).toHaveLength(3);
  });
});

describe('mergeAnalyses', () => {
  const part = (over: Partial<ReturnType<typeof parseAnalysis>>) =>
    parseAnalysis(JSON.stringify({ executiveSummary: 'x', ...over }));

  it('de-dupes case-insensitively across parts and keeps the first spelling', () => {
    const merged = mergeAnalyses([
      part({ risks: ['Deadline mepet'], keyDiscussions: ['Auth'] }),
      part({ risks: ['deadline mepet', 'Budget'], keyDiscussions: ['auth'] }),
    ]);
    expect(merged.risks).toEqual(['Deadline mepet', 'Budget']);
    expect(merged.keyDiscussions).toEqual(['Auth']);
  });

  it('de-dupes decisions by "what" and action items by task', () => {
    const merged = mergeAnalyses([
      part({
        decisions: [{ what: 'Pakai Redis', why: 'cepat', rejected: [], topic: 'arsitektur' }],
        actionItems: [{ task: 'Fix logo', owner: 'Gunawan', due: '' }],
      }),
      part({
        decisions: [{ what: 'pakai redis', why: 'lain', rejected: [], topic: '' }],
        actionItems: [{ task: 'Fix logo', owner: 'X', due: '' }, { task: 'Deploy', owner: '', due: '' }],
      }),
    ]);
    expect(merged.decisions).toHaveLength(1);
    expect(merged.decisions[0].why).toBe('cepat'); // first spelling wins
    expect(merged.actionItems.map((a) => a.task)).toEqual(['Fix logo', 'Deploy']);
  });

  it('concatenates timelines in chunk order', () => {
    const merged = mergeAnalyses([
      part({ timeline: [{ time: '01:00', topic: 'Awal' }] }),
      part({ timeline: [{ time: '02:00', topic: 'Akhir' }] }),
    ]);
    expect(merged.timeline.map((t) => t.topic)).toEqual(['Awal', 'Akhir']);
  });
});

describe('analyzeMeeting on transcripts too long for one request', () => {
  // ~2000 lines of ~120 chars is several times the per-request budget
  const long: Meeting = {
    ...meeting,
    entries: Array.from({ length: 2000 }, (_, i) => ({
      speaker: 'A',
      text: 'kata '.repeat(20) + i,
      time: '2026-07-13T01:00:00Z',
    })),
  };

  const recorded = (over: { chunk?: () => string; reduce?: () => string } = {}) => {
    const seen: string[] = [];
    const client: AIClient = {
      provider: 'custom',
      complete: async (req) => {
        seen.push(req.user);
        if (req.system.includes('Gabungkan menjadi satu ringkasan')) {
          return over.reduce ? over.reduce() : 'Ringkasan gabungan rapat.';
        }
        return over.chunk ? over.chunk() : VALID;
      },
    };
    return { client, seen };
  };

  it('analyzes every chunk, labels each part, and reduces one summary', async () => {
    const { client, seen } = recorded();
    const a = await analyzeMeeting(client, long);
    const chunkCalls = seen.filter((u) => u.startsWith('Meeting:'));
    expect(chunkCalls.length).toBe(chunkEntries(long.entries).length);
    expect(chunkCalls.length).toBeGreaterThan(1);
    expect(chunkCalls[0]).toContain('bagian 1 dari');
    // no chunk was truncated: the mid-transcript marker never appears
    for (const u of chunkCalls) expect(u).not.toContain('dipotong');
    expect(a.executiveSummary).toBe('Ringkasan gabungan rapat.');
    expect(a.keyDiscussions).toEqual(['Logo PDF geser']); // identical chunks de-duped
  });

  it('keeps the concatenated summaries when the reduce call fails', async () => {
    const { client } = recorded({
      reduce: () => {
        throw new AIError('reduce down', true);
      },
    });
    const a = await analyzeMeeting(client, long);
    expect(a.executiveSummary).toContain('Bahas perbaikan PDF invoice.');
  });

  it('skips a failing chunk instead of losing the whole meeting', async () => {
    let n = 0;
    const { client } = recorded({
      chunk: () => {
        // fail every attempt for the first chunk only (it retries once)
        if (++n <= 2) throw new AIError('chunk down', false);
        return VALID;
      },
    });
    const a = await analyzeMeeting(client, long);
    expect(a.executiveSummary).toBe('Ringkasan gabungan rapat.');
  });

  it('propagates the error when every chunk fails', async () => {
    const { client } = recorded({
      chunk: () => {
        throw new AIError('provider down', false);
      },
    });
    await expect(analyzeMeeting(client, long)).rejects.toThrow('provider down');
  });
});
