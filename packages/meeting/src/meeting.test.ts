import { describe, expect, it, vi } from 'vitest';
import type { AnalysisRecord, Meeting } from '@meetcc/shared';
import { AIError, type AIClient } from '@meetcc/ai';
import { findExpiredMeetings, needsAnalysis, MIN_ENTRIES, STALE_PROCESSING_MS } from './detect';
import { runPipeline, type PipelineDeps } from './pipeline';

// Promise.withResolvers needs lib ES2024; the repo targets ES2022.
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

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
  it('re-analyses a meeting whose only notes are a mid-meeting MoM', () => {
    const provisional: AnalysisRecord = {
      status: 'done',
      analysis: {} as never,
      generatedAt: iso(0),
      provider: 'openai',
      provisional: true,
    };
    // Ended: the partial notes get replaced by the real ones.
    expect(needsAnalysis(meeting(), provisional, NOW)).toBe(true);
    // Still running: pressing the button again is the user's call, not the sweep's.
    const live = meeting({ meta: { id: 'x', startedAt: iso(600_000), lastSeenAt: iso(3_000) } });
    expect(needsAnalysis(live, provisional, NOW)).toBe(false);
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

  it('concurrent non-force runs share ONE AI run (check-then-set would double-bill)', async () => {
    const gate = deferred();
    let calls = 0;
    const slow: AIClient = {
      provider: 'openai',
      complete: async () => {
        calls++; // arrived at the provider: a real analysis has started
        await gate.promise; // hold the run in flight
        return VALID;
      },
    };
    const { deps, records } = makeDeps({ createClient: async () => slow });

    const p1 = runPipeline('conc', deps);
    await vi.waitFor(() => expect(calls).toBe(1)); // first run is mid-analysis
    const p2 = runPipeline('conc', deps); // second trigger before it lands
    gate.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(calls).toBe(1); // the old guard lost this race: 2 analyses
    expect(records.filter((r) => r.status === 'done')).toHaveLength(1);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('force while a run is in flight joins it instead of starting a second run', async () => {
    const gate = deferred();
    let calls = 0;
    const slow: AIClient = {
      provider: 'openai',
      complete: async () => {
        calls++;
        await gate.promise;
        return VALID;
      },
    };
    const { deps } = makeDeps({ createClient: async () => slow });

    const p1 = runPipeline('force-conc', deps);
    await vi.waitFor(() => expect(calls).toBe(1));
    const p2 = runPipeline('force-conc', deps, { force: true });
    gate.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('rejects unknown/empty meetings', async () => {
    const { deps } = makeDeps({ getMeeting: async () => null });
    expect(await runPipeline('x', deps)).toMatchObject({ ok: false, reason: 'not-found' });
    const { deps: d2 } = makeDeps({ getMeeting: async () => meeting({ entries: [] }) });
    expect(await runPipeline('x', d2)).toMatchObject({ ok: false, reason: 'empty' });
  });
});
