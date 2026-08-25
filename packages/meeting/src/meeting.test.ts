import { describe, expect, it, vi } from 'vitest';
import type { AnalysisRecord, Meeting } from '@meetcc/shared';
import { AIError, type AIClient } from '@meetcc/ai';
import { findExpiredMeetings, needsAnalysis, MIN_ENTRIES, STALE_PROCESSING_MS } from './detect';
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

describe('findExpiredMeetings', () => {
  const DAY = 24 * 60 * 60_000;
  const aged = (id: string, daysAgo: number): Meeting =>
    meeting({
      id,
      meta: { id, startedAt: iso(daysAgo * DAY + 3_600_000), lastSeenAt: iso(daysAgo * DAY) },
    });

  it('returns nothing when retention is off (the default)', () => {
    const old = [aged('a', 400), aged('b', 91)];
    expect(findExpiredMeetings(old, 0, NOW)).toEqual([]);
    expect(findExpiredMeetings(old, -1, NOW)).toEqual([]);
    expect(findExpiredMeetings(old, Number.NaN, NOW)).toEqual([]);
  });

  it('expires only meetings past the window', () => {
    const list = [aged('old', 91), aged('edge', 89), aged('fresh', 1)];
    expect(findExpiredMeetings(list, 90, NOW).map((m) => m.id)).toEqual(['old']);
  });

  it('never expires a live meeting, however old its start', () => {
    const live = meeting({
      id: 'live',
      meta: { id: 'live', startedAt: iso(400 * DAY), lastSeenAt: iso(2_000) },
    });
    expect(findExpiredMeetings([live], 30, NOW)).toEqual([]);
  });

  it('leaves meetings with no timestamp at all alone', () => {
    const unknown: Meeting = { id: 'ghost', meta: null, entries: [] };
    expect(findExpiredMeetings([unknown], 1, NOW)).toEqual([]);
  });

  it('falls back to the last transcript entry when there is no heartbeat', () => {
    const noMeta: Meeting = {
      id: 'nometa',
      meta: null,
      entries: [{ speaker: 'A', text: 'x', time: iso(200 * DAY) }],
    };
    expect(findExpiredMeetings([noMeta], 90, NOW).map((m) => m.id)).toEqual(['nometa']);
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
    expect(deps.notify).toHaveBeenCalledWith(
      expect.stringContaining('siap'),
      expect.any(String),
      'aaa-bbbb-ccc',
    );
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
