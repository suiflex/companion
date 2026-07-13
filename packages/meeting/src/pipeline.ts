import type { AIClient } from '@meetcc/ai';
import { analyzeMeeting } from '@meetcc/ai';
import type { AnalysisRecord, Meeting } from '@meetcc/shared';

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
  notify(title: string, message: string): void;
  now(): string; // ISO
}

export type PipelineResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'empty' | 'already-processing' | 'ai-failed'; error?: string };

export async function runPipeline(
  id: string,
  deps: PipelineDeps,
  opts: { force?: boolean } = {},
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
    });
    await deps.audit('pipeline.done', id);
    deps.notify('Notulen siap ✓', `Meeting ${id} selesai dianalisis AI.`);
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
    deps.notify('Analisis gagal', `Meeting ${id}: ${error}`);
    return { ok: false, reason: 'ai-failed', error };
  }
}
