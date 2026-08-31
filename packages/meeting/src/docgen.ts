import type { AIClient, DocTemplate } from '@meetcc/ai';
import { generateDoc } from '@meetcc/ai';
import type {
  Analysis,
  DocProgressRecord,
  DocType,
  Meeting,
  StoredDoc,
} from '@meetcc/shared';
import { createInFlight, docGenKey } from './inflight';

/**
 * All side effects injected (same pattern as PipelineDeps) so the whole
 * generate-doc flow is unit-testable without chrome.* — the service worker
 * only wires storage/client/audit in.
 */
export interface DocGenDeps {
  getMeeting(id: string): Promise<Meeting | null>;
  getAnalysis(id: string): Promise<Analysis | null>;
  createClient(): Promise<AIClient>;
  saveProgress(id: string, p: DocProgressRecord): Promise<void>;
  clearProgress(id: string): Promise<void>;
  saveDoc(id: string, type: DocType, doc: StoredDoc): Promise<void>;
  getTemplate(templateId?: string): Promise<DocTemplate | undefined>;
  audit(event: string, detail: string): Promise<void>;
  now(): string;
}

export type DocGenResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'not-found' | 'empty' | 'ai-failed'; error: string };

// Module-level, one guard per worker process. Double-clicking "Generate BRD"
// (or firing the same doc from two dashboard windows) used to start TWO AI
// pipelines for the same document — double the provider cost, hidden by
// last-writer-wins storage. The UI button is advisory only (it unlocks after
// a stale-progress timeout), so the authoritative guard lives here: the first
// caller registers its promise synchronously, every equal-key caller joins
// that same run and gets the same result.
const docRuns = createInFlight<DocGenResult>();

/** Generate one document for a meeting. Concurrent requests for the same
 *  meeting + docType + template share one run (one AI bill); a different
 *  docType or template is a different document and runs in parallel. */
export function runDocGen(
  id: string,
  docType: DocType,
  templateId: string | undefined,
  deps: DocGenDeps,
): Promise<DocGenResult> {
  return docRuns.run(docGenKey(id, docType, templateId), () =>
    runDocGenInner(id, docType, templateId, deps),
  );
}

async function runDocGenInner(
  id: string,
  docType: DocType,
  templateId: string | undefined,
  deps: DocGenDeps,
): Promise<DocGenResult> {
  const startedAt = deps.now();
  try {
    const meeting = await deps.getMeeting(id);
    if (!meeting) return { ok: false, reason: 'not-found', error: 'Meeting tidak ditemukan.' };
    if (!meeting.entries.length) {
      return { ok: false, reason: 'empty', error: 'Transcript masih kosong.' };
    }
    await deps.saveProgress(id, {
      type: docType,
      step: 0,
      total: 1,
      label: 'Mulai',
      startedAt,
      updatedAt: startedAt,
    });
    const client = await deps.createClient();
    const template = await deps.getTemplate(templateId);
    const content = await generateDoc(
      client,
      meeting,
      await deps.getAnalysis(id),
      docType,
      async (step, total, label) => {
        await deps.saveProgress(id, {
          type: docType,
          step,
          total,
          label,
          startedAt,
          updatedAt: deps.now(),
        });
      },
      template,
    );
    await deps.saveDoc(id, docType, {
      content,
      generatedAt: deps.now(),
      provider: client.provider,
    });
    await deps.audit('docgen', `${id}: ${docType}`);
    return { ok: true, content };
  } catch (e) {
    // every failure — including a throwing dep — comes back as a typed
    // result, so callers never see a raw rejection
    return { ok: false, reason: 'ai-failed', error: (e as Error).message };
  } finally {
    await deps.clearProgress(id); // free the button on every exit path
  }
}
