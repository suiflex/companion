import { describe, expect, it, vi } from 'vitest';
import type { Analysis, ChatMessage, Meeting } from '@meetcc/shared';
import { askTranscript, buildAskPrompt, MAX_HISTORY_TURNS } from './ask';
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

describe('buildAskPrompt', () => {
  it('embeds transcript, summary, and question', () => {
    const p = buildAskPrompt(meeting, analysis, [], 'Kapan deadline?');
    expect(p).toContain('Gunawan:');
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

describe('askTranscript', () => {
  it('returns a trimmed answer', async () => {
    const answer = await askTranscript(
      clientOf(async () => '  Deadline Jumat depan (lihat 01:00, Gunawan).  '),
      meeting,
      analysis,
      [],
      'Kapan deadline?',
    );
    expect(answer).toBe('Deadline Jumat depan (lihat 01:00, Gunawan).');
  });

  it('rejects an empty question without calling the model', async () => {
    const complete = vi.fn(async () => 'x');
    await expect(askTranscript(clientOf(complete), meeting, null, [], '   ')).rejects.toThrow(AIError);
    expect(complete).not.toHaveBeenCalled();
  });

  it('retries once on a retryable error then succeeds', async () => {
    let calls = 0;
    const answer = await askTranscript(
      clientOf(async () => {
        if (++calls === 1) throw new AIError('rate limited', true);
        return 'jawaban';
      }),
      meeting,
      null,
      [],
      'tanya',
    );
    expect(calls).toBe(2);
    expect(answer).toBe('jawaban');
  });

  it('does not retry a non-retryable error', async () => {
    let calls = 0;
    await expect(
      askTranscript(
        clientOf(async () => {
          calls++;
          throw new AIError('bad key', false);
        }),
        meeting,
        null,
        [],
        'tanya',
      ),
    ).rejects.toThrow('bad key');
    expect(calls).toBe(1);
  });
});
