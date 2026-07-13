import { describe, expect, it, vi } from 'vitest';
import type { AnalysisRecord, Meeting } from '@meetcc/shared';
import { AIError, type AIClient } from '@meetcc/ai';
import { needsAnalysis, MIN_ENTRIES, STALE_PROCESSING_MS } from './detect';
import { runPipeline, type PipelineDeps } from './pipeline';

const NOW = Date.parse('2026-07-13T03:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: 'aaa-bbbb-ccc',
  meta: { id: 'aaa-bbbb-ccc', startedAt: iso(3_600_000), lastSeenAt: iso(60_000) },
  entries: Array.from({ length: MIN_ENTRIES }, (_, i) => ({
    speaker: 'A',
    text: `line ${i}`,
    time: iso(3_000_000),
  })),
  ...over,
});

describe('needsAnalysis', () => {
  it('true for ended meeting with content and no record', () => {
    expect(needsAnalysis(meeting(), null, NOW)).toBe(true);
  });
  it('false while meeting is live', () => {
    const live = meeting({ meta: { id: 'x', startedAt: iso(600_000), lastSeenAt: iso(3_000) } });
    expect(needsAnalysis(live, null, NOW)).toBe(false);
  });
  it('false for tiny transcripts', () => {
    expect(needsAnalysis(meeting({ entries: [] }), null, NOW)).toBe(false);
  });
  it('false when done or fresh-processing; true when processing is stale', () => {
    const done: AnalysisRecord = {
      status: 'done',
      analysis: {} as never,
      generatedAt: iso(0),
      provider: 'openai',
    };
    expect(needsAnalysis(meeting(), done, NOW)).toBe(false);
    const fresh: AnalysisRecord = { status: 'processing', step: 'ai', startedAt: iso(30_000), provider: 'openai' };
    expect(needsAnalysis(meeting(), fresh, NOW)).toBe(false);
    const stale: AnalysisRecord = {
      status: 'processing',
      step: 'ai',
      startedAt: iso(STALE_PROCESSING_MS + 1000),
      provider: 'openai',
    };
    expect(needsAnalysis(meeting(), stale, NOW)).toBe(true);
  });
});

describe('findFinishedMeetings', () => {
  it('filters only meetings needing analysis', async () => {
    const { findFinishedMeetings } = await import('./detect');
    const ended = meeting();
    const live = meeting({
      id: 'live-mtg',
      meta: { id: 'live-mtg', startedAt: iso(600_000), lastSeenAt: iso(3_000) },
    });
    const out = findFinishedMeetings([ended, live], {}, NOW);
    expect(out.map((m) => m.id)).toEqual(['aaa-bbbb-ccc']);
  });
});

const VALID = JSON.stringify({ executiveSummary: 'ok', timeline: [], keyDiscussions: [], decisions: [], actionItems: [], risks: [], openQuestions: [], nextSteps: [] });

function makeDeps(over: Partial<PipelineDeps> = {}) {
  const records: AnalysisRecord[] = [];
  const client: AIClient = { provider: 'openai', complete: vi.fn(async () => VALID) };
  const deps: PipelineDeps = {
    getMeeting: async () => meeting(),
    getRecord: async () => null,
    setRecord: async (_id, r) => void records.push(r),
    createClient: async () => client,
    audit: vi.fn(async () => {}),
    notify: vi.fn(),
    now: () => iso(0),
    ...over,
  };
  return { deps, records, client };
}

describe('runPipeline', () => {
  it('happy path: processing -> done, notifies success', async () => {
    const { deps, records } = makeDeps();
    const res = await runPipeline('aaa-bbbb-ccc', deps);
    expect(res.ok).toBe(true);
    expect(records.map((r) => r.status)).toEqual(['processing', 'processing', 'done']);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining('siap'), expect.any(String));
  });

  it('records error state when AI fails', async () => {
    const failing: AIClient = {
      provider: 'openai',
      complete: async () => {
        throw new AIError('boom', false);
      },
    };
    const { deps, records } = makeDeps({ createClient: async () => failing });
    const res = await runPipeline('aaa-bbbb-ccc', deps);
    expect(res).toMatchObject({ ok: false, reason: 'ai-failed' });
    expect(records.at(-1)?.status).toBe('error');
  });

  it('skips when already processing unless forced', async () => {
    const processing: AnalysisRecord = { status: 'processing', step: 'ai', startedAt: iso(0), provider: 'openai' };
    const { deps } = makeDeps({ getRecord: async () => processing });
    expect((await runPipeline('x', deps)).ok).toBe(false);
    expect((await runPipeline('x', deps, { force: true })).ok).toBe(true);
  });

  it('rejects unknown/empty meetings', async () => {
    const { deps } = makeDeps({ getMeeting: async () => null });
    expect(await runPipeline('x', deps)).toMatchObject({ ok: false, reason: 'not-found' });
    const { deps: d2 } = makeDeps({ getMeeting: async () => meeting({ entries: [] }) });
    expect(await runPipeline('x', d2)).toMatchObject({ ok: false, reason: 'empty' });
  });
});
