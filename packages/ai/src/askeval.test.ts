import { describe, expect, it } from 'vitest';
import { withEntryIds, type Entry, type Meeting } from '@meetcc/shared';
import { askMeeting, ASK_SYSTEM_PROMPT, fallbackPlan } from './ask';
import { retrieve, selectContext } from './retrieval';
import type { AIClient } from './client';

// P0.11 — the regression suite for Ask. Every case here is one of the failure
// modes from the roadmap; the one that started it all is `partial`: the
// meeting DID discuss the topic, and the old engine answered "Tidak
// disebutkan dalam rapat." The model is faked, so what is under test is what
// we control: does the evidence reach the prompt, and is the graded, verified
// result faithful to the transcript.

const T0 = Date.parse('2026-08-24T07:00:00Z');
const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();
const line = (speaker: string, text: string, sec: number): Entry => ({ speaker, text, time: at(sec) });

/** fixture: meeting-shared-solution (the screenshot case) */
const SHARED_SOLUTION: Entry[] = [
  line('Rina', 'Kita mulai dari status insiden kemarin', 0),
  line('Akbar', 'Ada beberapa aplikasi yang terdampak, bukan cuma satu', 40),
  line('Widi', 'Solusinya nanti dishare untuk semua aplikasi atau dibuat terpisah per aplikasi?', 70),
  line('Akbar', 'Dua-duanya masih dipertimbangkan, belum ada keputusan final', 100),
  line('Rina', 'Oke, kita bahas lagi minggu depan setelah data lengkap', 130),
];

/** The same discussion buried in the middle of a two-hour meeting. */
const LONG: Entry[] = [
  ...Array.from({ length: 400 }, (_, i) => line('Rina', `pembukaan dan laporan rutin bagian ${i} soal operasional harian tim`, i * 10)),
  ...SHARED_SOLUTION.map((e, i) => ({ ...e, time: at(4000 + i * 20) })),
  ...Array.from({ length: 400 }, (_, i) => line('Rina', `penutup dan administrasi bagian ${i} soal jadwal berikutnya`, 5000 + i * 10)),
];

const meetingOf = (entries: Entry[]): Meeting => ({
  id: 'xdr-fdbe-zqz#' + T0,
  meta: { id: 'xdr-fdbe-zqz#' + T0, startedAt: at(0), lastSeenAt: at(200) },
  entries,
});

const QUESTION = 'gimana caranya solusi dari beberapa aplikasi yang terdampak?';

/** Captures the prompt the model was given, and replies with a fixed script. */
function recorder(...replies: string[]): { client: AIClient; prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  return {
    prompts,
    client: {
      provider: 'custom',
      complete: async (req) => {
        prompts.push(req.user);
        return replies[Math.min(i++, replies.length - 1)];
      },
    },
  };
}

const PLAN = JSON.stringify({
  intent: 'analyze',
  keywords: ['solusi', 'aplikasi', 'terdampak'],
  relatedTerms: ['shared', 'terpisah'],
});

describe('ask prompt policy', () => {
  it('forbids the canned refusal and demands verifiable evidence ids', () => {
    expect(ASK_SYSTEM_PROMPT).toContain('Tidak disebutkan dalam rapat.');
    expect(ASK_SYSTEM_PROMPT).toContain('Dilarang menjawab');
    expect(ASK_SYSTEM_PROMPT).toContain('partial');
    expect(ASK_SYSTEM_PROMPT).toContain('inferred');
    expect(ASK_SYSTEM_PROMPT).toMatch(/ID yang benar-benar ada/);
  });
});

describe('eval: partial answer (the screenshot case)', () => {
  const answer = JSON.stringify({
    answer:
      'Belum ada keputusan final. Pembahasan mengarah ke dua opsi: solusi shared untuk semua aplikasi, atau implementasi terpisah per aplikasi.',
    answerability: 'partial',
    confidence: 0.65,
    evidence: ['E2', 'E3', 'E4'],
    missing: ['arsitektur final'],
    followUps: ['Kapan keputusan arsitektur diambil?'],
  });

  it('keeps a partial answer partial, with verified evidence', async () => {
    const r = recorder(PLAN, answer);
    const result = await askMeeting(r.client, meetingOf(withEntryIds(SHARED_SOLUTION)), null, [], QUESTION);

    expect(result.answerability).toBe('partial');
    expect(result.answer).not.toContain('Tidak disebutkan dalam rapat');
    for (const must of ['belum ada keputusan final', 'shared', 'terpisah']) {
      expect(result.answer.toLowerCase()).toContain(must);
    }
    expect(result.evidence).toHaveLength(1); // E2..E4 are consecutive -> one span
    expect(result.evidence[0].entryIds).toEqual(['E2', 'E3', 'E4']);
    expect(result.evidence[0].speakers).toEqual(['Akbar', 'Widi']);
    expect(result.missing).toEqual(['arsitektur final']);
  });

  it('shows the model the whole short meeting, including the answer turns', async () => {
    const r = recorder(PLAN, answer);
    await askMeeting(r.client, meetingOf(withEntryIds(SHARED_SOLUTION)), null, [], QUESTION);
    const prompt = r.prompts[1];
    expect(prompt).toContain('dishare untuk semua aplikasi atau dibuat terpisah');
    expect(prompt).toContain('belum ada keputusan final');
  });
});

describe('eval: middle-of-transcript retrieval on a long meeting', () => {
  it('puts the buried discussion in the prompt instead of cutting it out', async () => {
    const r = recorder(
      PLAN,
      JSON.stringify({ answer: 'Dua opsi, belum diputuskan.', answerability: 'partial', evidence: ['E402'] }),
    );
    const entries = withEntryIds(LONG);
    await askMeeting(r.client, meetingOf(entries), null, [], QUESTION);

    const prompt = r.prompts[1];
    expect(prompt).toContain('aplikasi yang terdampak');
    expect(prompt).toContain('dibuat terpisah per aplikasi');
    // the filler head/tail must NOT crowd out the evidence: what reaches the
    // model is the discussion, not the first and last N characters
    expect(prompt).not.toContain('pembukaan dan laporan rutin bagian 0 ');
    expect(prompt).not.toContain('penutup dan administrasi bagian 399');
    expect(prompt).toContain('bagian paling relevan');
  });

  it('retrieval reaches the middle turns, not just the ends', () => {
    const entries = withEntryIds(LONG);
    const r = retrieve(
      entries,
      { intent: 'analyze', keywords: ['aplikasi', 'terdampak'], relatedTerms: ['shared', 'terpisah'] },
      QUESTION,
    );
    const covered = r.spans.some((s) => s.start <= 401 && s.end >= 401);
    expect(covered).toBe(true);
  });
});

describe('eval: cross-turn and speaker questions', () => {
  const crossTurn = withEntryIds([
    line('Akbar', 'Service existing masih bisa dipakai', 0),
    line('Widi', 'Jadi tidak perlu service baru?', 20),
    line('Akbar', 'Iya, pakai existing saja', 40),
  ]);

  it('hands over the full exchange, not just the matching line', () => {
    const c = selectContext(crossTurn, fallbackPlan('perlu service baru?'), 'perlu service baru?', 60_000);
    expect(c.text).toContain('Service existing masih bisa dipakai');
    expect(c.text).toContain('pakai existing saja');
  });

  it('a question naming a speaker pulls that speaker up', () => {
    const r = retrieve(crossTurn, fallbackPlan('apa kata Widi?'), 'apa kata Widi?');
    expect(r.hits).toBeGreaterThan(0);
    expect(r.spans.some((s) => s.start <= 1 && s.end >= 1)).toBe(true);
  });
});

describe('eval: truly missing answer', () => {
  it('answers not_found without calling the model a second time', async () => {
    const r = recorder(JSON.stringify({ intent: 'recall', keywords: ['kubernetes'], relatedTerms: [] }));
    const long = withEntryIds(LONG);
    const result = await askMeeting(r.client, meetingOf(long), null, [], 'berapa node kubernetes kita?');

    expect(result.answerability).toBe('not_found');
    expect(result.evidence).toEqual([]);
    expect(r.prompts).toHaveLength(1); // planner only
  });
});

describe('eval: hallucinated citations', () => {
  it('drops evidence ids that are not in the transcript', async () => {
    const r = recorder(
      PLAN,
      JSON.stringify({
        answer: 'Diputuskan pakai shared service.',
        answerability: 'explicit',
        confidence: 0.95,
        evidence: ['E2', 'E9999'],
      }),
    );
    const result = await askMeeting(r.client, meetingOf(withEntryIds(SHARED_SOLUTION)), null, [], QUESTION);
    expect(result.evidence.flatMap((e) => e.entryIds)).toEqual(['E2']);
  });
});
