import { describe, expect, it, vi } from 'vitest';
import { AIError, type AIClient } from '@meetcc/ai';
import type { Meeting } from '@meetcc/shared';
import { runDocGen, type DocGenDeps } from './docgen';

// Promise.withResolvers needs lib ES2024; the repo targets ES2022.
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const meeting: Meeting = {
  id: 'm-docgen',
  meta: { id: 'm-docgen', startedAt: '2026-07-13T01:00:00Z', lastSeenAt: '2026-07-13T02:00:00Z' },
  entries: [{ speaker: 'A', text: 'Kita butuh fitur export', time: '2026-07-13T01:00:05Z' }],
};

const NOW = '2026-07-13T03:00:00Z';

// A critique answering "no real problems" makes generateDoc return the draft:
// one generate costs exactly 2 complete() calls (draft + critique), and every
// generate costs the same no matter how concurrent runs interleave.
const FINE = 'TIDAK ADA MASALAH BERARTI';
const clientOf = (impl: AIClient['complete']): AIClient => ({ provider: 'openai', complete: impl });

function makeDeps(client: AIClient, over: Partial<DocGenDeps> = {}) {
  const deps: DocGenDeps = {
    getMeeting: vi.fn(async () => meeting),
    getAnalysis: vi.fn(async () => null),
    createClient: vi.fn(async () => client),
    saveProgress: vi.fn(async () => {}),
    clearProgress: vi.fn(async () => {}),
    saveDoc: vi.fn(async () => {}),
    getTemplate: vi.fn(async () => undefined),
    audit: vi.fn(async () => {}),
    now: vi.fn(() => NOW),
    ...over,
  };
  return { deps };
}

describe('runDocGen double-submit guard', () => {
  it('double-trigger while in flight: exactly ONE generate, both callers get the doc', async () => {
    const gate = deferred();
    let calls = 0;
    const client = clientOf(async () => {
      calls++; // arrived at the provider: a real generate has started
      await gate.promise; // hold the run in flight
      return FINE;
    });
    const { deps } = makeDeps(client);

    const p1 = runDocGen('m1', 'brd', undefined, deps);
    await vi.waitFor(() => expect(calls).toBe(1)); // run 1 is drafting
    const p2 = runDocGen('m1', 'brd', undefined, deps); // the second click, same doc
    gate.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r2.content).toBe(r1.content);
    expect(calls).toBe(2); // draft + critique once — a second generate would make 4
    expect(deps.saveDoc).toHaveBeenCalledTimes(1); // one write, not last-writer-wins
    expect(deps.audit).toHaveBeenCalledTimes(1);
    expect(deps.clearProgress).toHaveBeenCalled();
  });

  it('triple-trigger still produces a single generate', async () => {
    const gate = deferred();
    let calls = 0;
    const client = clientOf(async () => {
      calls++;
      await gate.promise;
      return FINE;
    });
    const { deps } = makeDeps(client);

    const p1 = runDocGen('m2', 'brd', undefined, deps);
    await vi.waitFor(() => expect(calls).toBe(1));
    const p2 = runDocGen('m2', 'brd', undefined, deps);
    const p3 = runDocGen('m2', 'brd', undefined, deps);
    gate.resolve();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(calls).toBe(2);
    expect(deps.saveDoc).toHaveBeenCalledTimes(1);
  });

  it('after a run settles a new request generates again (guard must not over-block)', async () => {
    let calls = 0;
    const client = clientOf(async () => {
      calls++;
      return FINE;
    });
    const { deps } = makeDeps(client);

    const first = await runDocGen('m3', 'brd', undefined, deps);
    expect(first.ok).toBe(true);
    const second = await runDocGen('m3', 'brd', undefined, deps);
    expect(second.ok).toBe(true);
    expect(calls).toBe(4); // two real generates
    expect(deps.saveDoc).toHaveBeenCalledTimes(2);
  });

  it('same template joins the run; a different template is a different document', async () => {
    let calls = 0;
    const client = clientOf(async () => {
      calls++;
      return FINE;
    });

    // same templateId -> one shared run
    const { deps: d1 } = makeDeps(client);
    const [a1, a2] = await Promise.all([
      runDocGen('m4', 'brd', 'tpl1', d1),
      runDocGen('m4', 'brd', 'tpl1', d1),
    ]);
    expect(a1.ok).toBe(true);
    expect(a2.ok).toBe(true);
    expect(calls).toBe(2);

    // different templateId (or none) -> parallel, both really generate
    const { deps: d2 } = makeDeps(client);
    const [b1, b2] = await Promise.all([
      runDocGen('m5', 'brd', 'tpl1', d2),
      runDocGen('m5', 'brd', 'tpl2', d2),
    ]);
    expect(b1.ok).toBe(true);
    expect(b2.ok).toBe(true);
    expect(calls).toBe(6); // + 2 per document

    const { deps: d3 } = makeDeps(client);
    const [c1, c2] = await Promise.all([
      runDocGen('m6', 'brd', undefined, d3),
      runDocGen('m6', 'prd', undefined, d3),
    ]);
    expect(c1.ok).toBe(true);
    expect(c2.ok).toBe(true);
    expect(calls).toBe(10); // + 2 per document
  });
});

describe('runDocGen behaviour', () => {
  it('stores the doc with timestamp + provider and audits the run', async () => {
    const client = clientOf(async () => FINE);
    const { deps } = makeDeps(client);
    const r = await runDocGen('m-save', 'notulen', undefined, deps);
    expect(r.ok).toBe(true);
    expect(deps.saveDoc).toHaveBeenCalledWith(
      'm-save',
      'notulen',
      expect.objectContaining({ generatedAt: NOW, provider: 'openai' }),
    );
    expect(deps.audit).toHaveBeenCalledWith('docgen', 'm-save: notulen');
  });

  it('writes progress (Mulai first) and always clears it, even on success', async () => {
    const client = clientOf(async () => FINE);
    const { deps } = makeDeps(client);
    await runDocGen('m-prog', 'prd', undefined, deps);
    expect(deps.saveProgress).toHaveBeenCalledWith(
      'm-prog',
      expect.objectContaining({ type: 'prd', label: 'Mulai', startedAt: NOW }),
    );
    expect(deps.clearProgress).toHaveBeenCalledWith('m-prog');
  });

  it('AI failure: typed ai-failed result shared by the joiner, no doc, progress cleared', async () => {
    const gate = deferred();
    let calls = 0;
    const client = clientOf(async () => {
      calls++;
      await gate.promise;
      throw new AIError('boom', false);
    });
    const { deps } = makeDeps(client);

    const p1 = runDocGen('m-fail', 'prd', undefined, deps);
    await vi.waitFor(() => expect(calls).toBe(1));
    const p2 = runDocGen('m-fail', 'prd', undefined, deps);
    gate.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toMatchObject({ ok: false, reason: 'ai-failed', error: 'boom' });
    expect(r2).toMatchObject({ ok: false, reason: 'ai-failed', error: 'boom' });
    expect(calls).toBe(1);
    expect(deps.saveDoc).not.toHaveBeenCalled();
    expect(deps.clearProgress).toHaveBeenCalledWith('m-fail');
  });

  it('not-found and empty are typed results: no client, no doc, progress cleared', async () => {
    const client = clientOf(async () => FINE);

    const a = makeDeps(client, { getMeeting: vi.fn(async () => null) }).deps;
    expect(await runDocGen('m-nf', 'brd', undefined, a)).toMatchObject({
      ok: false,
      reason: 'not-found',
    });
    expect(a.createClient).not.toHaveBeenCalled();
    expect(a.clearProgress).toHaveBeenCalled();

    const b = makeDeps(client, {
      getMeeting: vi.fn(async () => ({ ...meeting, entries: [] })),
    }).deps;
    expect(await runDocGen('m-empty', 'brd', undefined, b)).toMatchObject({
      ok: false,
      reason: 'empty',
    });
    expect(b.createClient).not.toHaveBeenCalled();
  });

  it('resolves the template by id through deps', async () => {
    const client = clientOf(async () => FINE);
    const getTemplate = vi.fn(async (id?: string) =>
      id ? { name: 'T', instructions: 'IKUTI STRUKTUR' } : undefined,
    );
    const { deps } = makeDeps(client, { getTemplate });
    await runDocGen('m-tpl', 'brd', 'tpl9', deps);
    expect(getTemplate).toHaveBeenCalledWith('tpl9');
  });
});
