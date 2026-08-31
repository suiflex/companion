import { describe, expect, it, vi } from 'vitest';
import { createInFlight, docGenKey } from './inflight';

// Promise.withResolvers needs lib ES2024; the repo targets ES2022.
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createInFlight', () => {
  it('second concurrent caller joins the same run (one fn execution)', async () => {
    const gate = deferred();
    const fn = vi.fn(async () => {
      await gate.promise;
      return 'result';
    });
    const guard = createInFlight<string>();

    const p1 = guard.run('k', fn);
    const p2 = guard.run('k', fn); // before p1 settles
    gate.resolve();

    expect(await p1).toBe('result');
    expect(await p2).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('key frees after the run settles: a later call starts a fresh run', async () => {
    let calls = 0;
    const guard = createInFlight<number>();
    const first = await guard.run('k', async () => ++calls);
    const second = await guard.run('k', async () => ++calls);
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it('a failed run is shared by joiners AND frees the key afterwards', async () => {
    const gate = deferred();
    const fn = vi.fn(async () => {
      await gate.promise;
      throw new Error('ai down');
    });
    const guard = createInFlight<string>();

    const p1 = guard.run('k', fn);
    const p2 = guard.run('k', fn);
    gate.resolve();

    await expect(p1).rejects.toThrow('ai down');
    await expect(p2).rejects.toThrow('ai down');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(guard.has('k')).toBe(false);

    // after the failure a retry runs for real
    await expect(guard.run('k', async () => 'ok')).resolves.toBe('ok');
  });

  it('different keys never share a run', async () => {
    const gate = deferred();
    const fn = vi.fn(async () => {
      await gate.promise;
      return 'x';
    });
    const guard = createInFlight<string>();

    const p1 = guard.run('a', fn);
    const p2 = guard.run('b', fn);
    expect(guard.has('a')).toBe(true);
    expect(guard.has('b')).toBe(true);
    gate.resolve();
    await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('docGenKey', () => {
  it('separates meeting, doc type and template', () => {
    expect(docGenKey('m1', 'brd')).toBe(docGenKey('m1', 'brd'));
    expect(docGenKey('m1', 'brd')).not.toBe(docGenKey('m1', 'prd'));
    expect(docGenKey('m1', 'brd')).not.toBe(docGenKey('m2', 'brd'));
    expect(docGenKey('m1', 'brd')).not.toBe(docGenKey('m1', 'brd', 'tpl1'));
    expect(docGenKey('m1', 'brd', 'tpl1')).toBe(docGenKey('m1', 'brd', 'tpl1'));
  });

  it('stays unambiguous when the session id contains the separator', () => {
    // `#` is the session-id separator; docgen uses it as its own marker after
    // the id, and a readable docType never collides with a millisecond
    expect(docGenKey('room#123', 'brd')).toBe(docGenKey('room#123', 'brd'));
    expect(docGenKey('room#123', 'brd')).not.toBe(docGenKey('room', 'brd'));
  });
});
