import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { withEntryIds, type ChatMessage, type Entry, type Meeting } from '@meetcc/shared';
import { askMeeting, ASK_SYSTEM_PROMPT, fallbackPlan } from './ask';
import { retrieve, selectContext } from './retrieval';
import type { AIClient } from './client';
import { entriesFromList, fixtureEntries, type AskFixture } from './askeval.fixtures';

// P0.11 / docs/ask-v2-spec.md §11 — the regression suite for Ask. Every case
// here is one of the 15 evaluation categories the spec requires; each loads
// its transcript from a standalone fixture file (§14 DoD) instead of an
// inline const. The model is faked, so what is under test is what we
// control: does the evidence reach the prompt, and is the graded, verified
// result faithful to the transcript.

function loadFixture(name: string): AskFixture {
  const path = fileURLToPath(new URL(`./fixtures/ask-eval/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as AskFixture;
}

const meetingOf = (entries: Entry[]): Meeting => ({
  id: 'xdr-fdbe-zqz#eval',
  meta: { id: 'xdr-fdbe-zqz#eval', startedAt: entries[0]?.time ?? '', lastSeenAt: entries.at(-1)?.time ?? '' },
  entries,
});

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

/** Runs a fixture through askMeeting with a scripted plan+answer, and checks
 *  the result against the fixture's `expected` block. */
async function evalFixture(
  fx: AskFixture,
  planReply: string,
  answerReply: string,
): Promise<void> {
  const r = recorder(planReply, answerReply);
  const history = (fx.history ?? []) as ChatMessage[];
  const result = await askMeeting(
    r.client,
    meetingOf(withEntryIds(fixtureEntries(fx))),
    null,
    history,
    fx.question,
  );
  expect(result.answerability).toBe(fx.expected.answerability);
  for (const must of fx.expected.mustMention) {
    expect(result.answer.toLowerCase()).toContain(must.toLowerCase());
  }
  for (const forbidden of fx.expected.forbidden) {
    expect(result.answer).not.toContain(forbidden);
  }
}

describe('ask prompt policy', () => {
  it('forbids the canned refusal and demands verifiable evidence ids', () => {
    expect(ASK_SYSTEM_PROMPT).toContain('Tidak disebutkan dalam rapat.');
    expect(ASK_SYSTEM_PROMPT).toContain('Dilarang menjawab');
    expect(ASK_SYSTEM_PROMPT).toContain('partial');
    expect(ASK_SYSTEM_PROMPT).toContain('inferred');
    expect(ASK_SYSTEM_PROMPT).toMatch(/ID yang benar-benar ada/);
  });
});

const PLAN = (over: Partial<Record<'intent' | 'keywords' | 'relatedTerms', unknown>> = {}): string =>
  JSON.stringify({ intent: 'analyze', keywords: [], relatedTerms: [], ...over });

describe('eval-01: explicit answer', () => {
  it('grades an explicit, stated answer as explicit', async () => {
    const fx = loadFixture('eval-01-explicit');
    await evalFixture(
      fx,
      PLAN({ keywords: ['service', 'aplikasi', 'keputusan'] }),
      JSON.stringify({
        answer: 'Keputusannya: pakai shared service untuk semua aplikasi.',
        answerability: 'explicit',
        confidence: 0.9,
        evidence: ['E1', 'E2'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-02: partial answer (the screenshot regression)', () => {
  const fx = loadFixture('meeting-shared-solution');
  const answer = JSON.stringify({
    answer:
      'Belum ada keputusan final. Pembahasan mengarah ke dua opsi: solusi shared untuk semua aplikasi, atau implementasi terpisah per aplikasi.',
    answerability: 'partial',
    confidence: 0.65,
    evidence: ['E2', 'E3', 'E4'],
    missing: ['arsitektur final'],
    followUps: ['Kapan keputusan arsitektur diambil?'],
  });
  const plan = PLAN({ keywords: ['solusi', 'aplikasi', 'terdampak'], relatedTerms: ['shared', 'terpisah'] });

  it('keeps a partial answer partial, with verified evidence', async () => {
    const r = recorder(plan, answer);
    const result = await askMeeting(r.client, meetingOf(withEntryIds(fixtureEntries(fx))), null, [], fx.question);

    expect(result.answerability).toBe('partial');
    for (const must of fx.expected.mustMention) expect(result.answer.toLowerCase()).toContain(must.toLowerCase());
    expect(result.evidence).toHaveLength(1); // E2..E4 are consecutive -> one span
    expect(result.evidence[0].entryIds).toEqual(['E2', 'E3', 'E4']);
    expect(result.evidence[0].speakers).toEqual(['Akbar', 'Widi']);
  });

  it('shows the model the whole short meeting, including the answer turns', async () => {
    const r = recorder(plan, answer);
    await askMeeting(r.client, meetingOf(withEntryIds(fixtureEntries(fx))), null, [], fx.question);
    const prompt = r.prompts[1];
    expect(prompt).toContain('dishare untuk semua aplikasi atau dibuat terpisah');
    expect(prompt).toContain('belum ada keputusan final');
  });
});

describe('eval-03: inferred answer', () => {
  it('infers an unstated answer from the surrounding turns', async () => {
    const fx = loadFixture('eval-03-inferred');
    await evalFixture(
      fx,
      PLAN({ keywords: ['service', 'baru', 'existing'] }),
      JSON.stringify({
        answer: 'Tim tidak perlu membuat service baru karena existing masih bisa dipakai.',
        answerability: 'inferred',
        confidence: 0.5,
        evidence: ['E1', 'E2', 'E3'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-04: truly not found', () => {
  it('answers not_found without calling the model a second time', async () => {
    const fx = loadFixture('eval-04-not-found');
    const r = recorder(PLAN({ intent: 'recall', keywords: ['kubernetes'] }));
    const result = await askMeeting(r.client, meetingOf(withEntryIds(fixtureEntries(fx))), null, [], fx.question);

    expect(result.answerability).toBe('not_found');
    expect(result.evidence).toEqual([]);
    expect(result.answer).not.toContain(fx.expected.forbidden[0]);
    expect(r.prompts).toHaveLength(1); // planner only
  });
});

describe('eval-05: cross-turn answer', () => {
  it('draws on the general statement plus the Freeport-specific follow-up', async () => {
    const fx = loadFixture('eval-05-cross-turn');
    await evalFixture(
      fx,
      PLAN({ keywords: ['arsitektur', 'freeport'], relatedTerms: ['monolith', 'microservice'] }),
      JSON.stringify({
        answer:
          'Untuk Freeport dipakai monolith dulu untuk fase pertama, meskipun arsitektur umum tim sudah microservice.',
        answerability: 'inferred',
        confidence: 0.55,
        evidence: ['E1', 'E2', 'E3', 'E4'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-06: long transcript keeps the buried discussion', () => {
  const fx = loadFixture('eval-06-long-transcript');
  const plan = PLAN({ keywords: ['solusi', 'aplikasi', 'terdampak'], relatedTerms: ['shared', 'terpisah'] });
  const answer = JSON.stringify({
    answer: 'Ada beberapa aplikasi yang terdampak; solusinya masih dipertimbangkan, apakah shared atau terpisah.',
    answerability: 'partial',
    confidence: 0.6,
    evidence: ['E401', 'E402'],
    missing: [],
    followUps: [],
  });

  it('puts the buried discussion in the prompt instead of cutting it out', async () => {
    const r = recorder(plan, answer);
    const result = await askMeeting(r.client, meetingOf(withEntryIds(fixtureEntries(fx))), null, [], fx.question);
    expect(result.answerability).toBe('partial');
    for (const must of fx.expected.mustMention) expect(result.answer.toLowerCase()).toContain(must.toLowerCase());

    const prompt = r.prompts[1];
    for (const forbidden of fx.expected.forbidden) expect(prompt).not.toContain(forbidden);
    expect(prompt).toContain('bagian paling relevan');
  });

  it('retrieval reaches the middle turns, not just the ends', () => {
    const entries = withEntryIds(fixtureEntries(fx));
    const r = retrieve(
      entries,
      { intent: 'analyze', keywords: ['aplikasi', 'terdampak'], relatedTerms: ['shared', 'terpisah'] },
      fx.question,
    );
    const covered = r.spans.some((s) => s.start <= 400 && s.end >= 400);
    expect(covered).toBe(true);
  });
});

describe('eval-07: middle-of-transcript retrieval', () => {
  it('finds an explicit answer buried in the middle turns', async () => {
    const fx = loadFixture('eval-07-middle-retrieval');
    await evalFixture(
      fx,
      PLAN({ keywords: ['insiden', 'status'], relatedTerms: ['aplikasi'] }),
      JSON.stringify({
        answer: 'Status insiden kemarin: beberapa aplikasi terdampak.',
        answerability: 'explicit',
        confidence: 0.85,
        evidence: ['E401', 'E402'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-08: speaker reference', () => {
  it('pulls the named speaker turns, not the other participant', () => {
    const fx = loadFixture('eval-08-speaker-ref');
    const entries = withEntryIds(fixtureEntries(fx));
    const r = retrieve(entries, fallbackPlan(fx.question), fx.question);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.spans.some((s) => s.start <= 2 && s.end >= 2)).toBe(true); // E3, index 2
  });

  it('answers with the named speaker content', async () => {
    const fx = loadFixture('eval-08-speaker-ref');
    await evalFixture(
      fx,
      PLAN({ keywords: ['akbar', 'deployment'], relatedTerms: ['production'] }),
      JSON.stringify({
        answer: 'Akbar bilang deploy ke production minggu depan.',
        answerability: 'explicit',
        confidence: 0.9,
        evidence: ['E3'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-09: pronoun/coreference', () => {
  it('resolves "itu" back to the timeline Freeport asked to accelerate', async () => {
    const fx = loadFixture('eval-09-pronoun');
    await evalFixture(
      fx,
      PLAN({ keywords: ['freeport', 'timeline', 'dipercepat'] }),
      JSON.stringify({
        answer: 'Freeport yang meminta timeline dipercepat.',
        answerability: 'explicit',
        confidence: 0.85,
        evidence: ['E1'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-10: follow-up question using history', () => {
  it('resolves "fee-nya" to the Midtrans fee via conversation history', async () => {
    const fx = loadFixture('eval-10-followup');
    await evalFixture(
      fx,
      PLAN({ keywords: ['fee', 'midtrans'], relatedTerms: ['transaksi'] }),
      JSON.stringify({
        answer: 'Fee-nya 2.5% per transaksi.',
        answerability: 'explicit',
        confidence: 0.9,
        evidence: ['E2'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-11: contradictory statements', () => {
  it('shows both positions and states the decision is not final', async () => {
    const fx = loadFixture('eval-11-contradiction');
    await evalFixture(
      fx,
      PLAN({ keywords: ['arsitektur', 'microservice', 'monolith'] }),
      JSON.stringify({
        answer:
          'Belum diputuskan: Akbar mengusulkan microservice untuk semua, sementara Widi berpendapat monolith lebih cocok karena scale belum sebesar itu.',
        answerability: 'partial',
        confidence: 0.6,
        evidence: ['E1', 'E2', 'E3', 'E4'],
        missing: ['keputusan arsitektur final'],
        followUps: [],
      }),
    );
  });
});

describe('eval-12: changed decision chronology', () => {
  it('shows the chronology from kubernetes to docker compose', async () => {
    const fx = loadFixture('eval-12-changed-decision');
    await evalFixture(
      fx,
      PLAN({ keywords: ['deployment', 'kubernetes', 'docker'], relatedTerms: ['compose'] }),
      JSON.stringify({
        answer:
          'Awalnya tim memakai kubernetes untuk fase pertama, lalu switch ke docker compose karena lebih cocok untuk MVP.',
        answerability: 'inferred',
        confidence: 0.55,
        evidence: ['E1', 'E2', 'E3', 'E4'],
        missing: [],
        followUps: [],
      }),
    );
  });
});

describe('eval-15: cleaned vs raw transcript', () => {
  it('answers from the cleaned transcript, not the raw ASR errors', async () => {
    const fx = loadFixture('eval-15-cleaned-transcript');
    const cleaned = entriesFromList(fx.entries_cleaned!);
    const r = recorder(
      PLAN({ keywords: ['target', 'tahun'] }),
      JSON.stringify({
        answer: 'Target tahun yang disebutkan adalah 2023.',
        answerability: 'explicit',
        confidence: 0.9,
        evidence: ['E1'],
        missing: [],
        followUps: [],
      }),
    );
    const result = await askMeeting(r.client, meetingOf(withEntryIds(cleaned)), null, [], fx.question);
    expect(result.answerability).toBe('explicit');
    expect(result.answer).toContain('2023');
    expect(result.answer).not.toContain('2003');
  });
});

describe('eval: hallucinated citations', () => {
  it('drops evidence ids that are not in the transcript', async () => {
    const fx = loadFixture('meeting-shared-solution');
    const r = recorder(
      PLAN({ keywords: ['solusi', 'aplikasi', 'terdampak'], relatedTerms: ['shared', 'terpisah'] }),
      JSON.stringify({
        answer: 'Diputuskan pakai shared service.',
        answerability: 'explicit',
        confidence: 0.95,
        evidence: ['E2', 'E9999'],
      }),
    );
    const result = await askMeeting(r.client, meetingOf(withEntryIds(fixtureEntries(fx))), null, [], fx.question);
    expect(result.evidence.flatMap((e) => e.entryIds)).toEqual(['E2']);
  });
});

describe('eval: cross-turn retrieval without a scripted answer', () => {
  it('hands over the full exchange, not just the matching line', () => {
    const fx = loadFixture('eval-03-inferred');
    const entries = withEntryIds(fixtureEntries(fx));
    const c = selectContext(entries, fallbackPlan(fx.question), fx.question, 60_000);
    expect(c.text).toContain('Service existing masih bisa dipakai');
    expect(c.text).toContain('pakai existing saja');
  });
});
