import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Entry } from '@meetcc/shared';
import { CompanionStore, openDatabase } from '@meetcc/store';
import type { AIClient } from '@meetcc/ai';
import { askMeetings } from './globalask';

// docs/ask-v2-spec.md §11.13-11.14 — the two Global Ask evaluation categories.
// Both need a real store (session/entries/FTS), not a single in-memory
// Meeting, so they live beside globalask.ts rather than in @meetcc/ai's
// single-meeting askeval.test.ts.

interface FixtureSession {
  sessionId: string;
  title: string;
  startedAt: string;
  entries: { speaker: string; text: string; offset: number }[];
}

interface GlobalAskFixture {
  id: string;
  roomId?: string;
  sessions: FixtureSession[];
  question: string;
  expected: {
    answerability: 'explicit' | 'partial' | 'inferred' | 'not_found';
    mustMention: string[];
    forbidden: string[];
    notes?: string;
  };
}

function loadFixture(name: string): GlobalAskFixture {
  const path = fileURLToPath(new URL(`./fixtures/ask-eval/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as GlobalAskFixture;
}

const toEntries = (list: FixtureSession['entries'], startedAt: string): Entry[] =>
  list.map((e) => ({
    speaker: e.speaker,
    text: e.text,
    time: new Date(Date.parse(startedAt) + e.offset * 1000).toISOString(),
  }));

async function seedFixture(fx: GlobalAskFixture, roomPrefix: string): Promise<CompanionStore> {
  const { driver } = await openDatabase();
  const store = CompanionStore.open(driver);
  fx.sessions.forEach((s, i) => {
    const id = `${roomPrefix}#${i}`;
    store.upsertSession({ id, title: s.title, startedAt: s.startedAt });
    store.replaceEntries(id, 'raw', toEntries(s.entries, s.startedAt));
  });
  return store;
}

function scriptedClient(replies: string[]): { client: AIClient; prompts: string[] } {
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

describe('eval-13: reused meeting room (session id != room id)', () => {
  it('answers from the later session only, not an earlier session in the same room', async () => {
    const fx = loadFixture('eval-13-reused-room');
    const store = await seedFixture(fx, fx.roomId ?? 'room');
    const r = scriptedClient([
      JSON.stringify({ intent: 'recall', kind: 'any', entity: '', keywords: ['production'], months: 0 }),
      JSON.stringify({
        answer: 'Deploy ke production dijadwalkan besok (Wednesday standup).',
        answerability: 'explicit',
        confidence: 0.85,
        evidence: ['E1'],
        missing: [],
        followUps: [],
      }),
    ]);

    const result = await askMeetings(r.client, store, fx.question);
    expect(result.answerability).toBe(fx.expected.answerability);
    for (const must of fx.expected.mustMention) expect(result.answer.toLowerCase()).toContain(must.toLowerCase());
    for (const forbidden of fx.expected.forbidden) expect(result.answer).not.toContain(forbidden);
  });
});

describe('eval-14: multiple concurrent meetings', () => {
  it('cites both meetings, each attributed to its own session', async () => {
    const fx = loadFixture('eval-14-concurrent');
    const store = await seedFixture(fx, 'meeting');
    const r = scriptedClient([
      JSON.stringify({ intent: 'recall', kind: 'any', entity: '', keywords: ['midtrans', 'auth0'], months: 0 }),
      JSON.stringify({
        answer: 'Alpha Team (Payment) memutuskan pakai Midtrans; Beta Team (Auth) memutuskan pakai Auth0.',
        answerability: 'explicit',
        confidence: 0.85,
        evidence: ['E1'],
        missing: [],
        followUps: [],
      }),
    ]);

    const result = await askMeetings(r.client, store, fx.question);
    expect(result.answerability).toBe(fx.expected.answerability);
    for (const must of fx.expected.mustMention) expect(result.answer.toLowerCase()).toContain(must.toLowerCase());
    expect(result.sessions.length).toBeGreaterThanOrEqual(2);
  });
});
