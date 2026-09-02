import type { AIClient } from '@meetcc/ai';
import { analyzeMeeting } from '@meetcc/ai';
import type { AnalysisRecord, Meeting } from '@meetcc/shared';
import { createInFlight } from './inflight';

/**
 * All side effects injected -> the workflow is unit-testable and the
 * business logic is independent of chrome.* and of any provider.
 */
export interface PipelineDeps {
  getMeeting(id: string): Promise<Meeting | null>;
  getRecord(id: string): Promise<AnalysisRecord | null>;
  setRecord(id: string, record: AnalysisRecord): Promise<void>;
  createClient(): Promise<AIClient>;
  audit(event: string, detail: string): Promise<void>;
  /** `meetingId` lets the host make the notification open that meeting. */
  notify(title: string, message: string, meetingId: string): void;
  now(): string; // ISO
}

export type PipelineResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'empty' | 'already-processing' | 'ai-failed'; error?: string };

// Module-level, so every runPipeline call in this worker process shares one
// guard per meeting. The `processing` record in storage stays as the second
// layer (it survives worker restarts); this map closes the check-then-set
// race that the storage layer alone provably loses (two callers read the old
// record before either writes).
const pipelineRuns = createInFlight<PipelineResult>();

export function runPipeline(
  id: string,
  deps: PipelineDeps,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  return pipelineRuns.run(`pipeline:${id}`, () => runPipelineInner(id, deps, opts));
}

export interface PipelineOptions {
  force?: boolean;
  /** The meeting is still running: analyse what exists so far and mark the
   *  result provisional, so the sweep replaces it once the meeting ends. */
  provisional?: boolean;
}

async function runPipelineInner(
  id: string,
  deps: PipelineDeps,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const meeting = await deps.getMeeting(id);
  if (!meeting) return { ok: false, reason: 'not-found' };
  if (!meeting.entries.length) return { ok: false, reason: 'empty' };

  const existing = await deps.getRecord(id);
  if (existing?.status === 'processing' && !opts.force) {
    return { ok: false, reason: 'already-processing' };
  }

  let client: AIClient;
  try {
    client = await deps.createClient();
  } catch (e) {
    const error = (e as Error).message;
    await deps.setRecord(id, { status: 'error', error, failedAt: deps.now(), provider: 'unknown' });
    return { ok: false, reason: 'ai-failed', error };
  }

  await deps.setRecord(id, {
    status: 'processing',
    step: 'ai',
    startedAt: deps.now(),
    provider: client.provider,
  });
  await deps.audit('pipeline.start', id);

  try {
    const analysis = await analyzeMeeting(client, meeting);
    await deps.setRecord(id, {
      status: 'processing',
      step: 'saving',
      startedAt: deps.now(),
      provider: client.provider,
    });
    await deps.setRecord(id, {
      status: 'done',
      analysis,
      generatedAt: deps.now(),
      provider: client.provider,
      ...(opts.provisional ? { provisional: true } : {}),
    });
    await deps.audit(opts.provisional ? 'pipeline.provisional' : 'pipeline.done', id);
    // No notification for a provisional run: the user pressed a button and is
    // looking at the result already.
    if (!opts.provisional) {
      deps.notify('Notulen siap ✓', `Meeting ${id} selesai dianalisis AI.`, id);
    }
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message;
    await deps.setRecord(id, {
      status: 'error',
      error,
      failedAt: deps.now(),
      provider: client.provider,
    });
    await deps.audit('pipeline.error', `${id}: ${error}`);
    deps.notify('Analisis gagal', `Meeting ${id}: ${error}`, id);
    return { ok: false, reason: 'ai-failed', error };
  }
}
