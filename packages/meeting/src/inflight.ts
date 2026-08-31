/**
 * In-flight de-duplication ("double-submit guard").
 *
 * A storage check-then-set (`if (record.status === 'processing') ...`) loses
 * races: two callers read the old value before either writes, and both start
 * an AI run — two provider bills for one user click. The only atomic place in
 * a service worker is the event loop itself, so the guard is a plain Map from
 * key to the running promise: the first caller sets it synchronously before
 * awaiting anything, every later caller joins the same promise. This lives in
 * the worker's module scope, which means it guards one browser session —
 * exactly the scope a double-click or a second dashboard window lives in.
 */

/** Join-or-start runner, one instance per concern (pipeline, docgen, ...). */
export function createInFlight<T>() {
  const inflight = new Map<string, Promise<T>>();
  return {
    /** Run `fn` for `key`; concurrent callers with the same key share the
     *  result (including the rejection). After the run settles — either way —
     *  the key is free again and a later call starts a fresh run. */
    run(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing;
      const p = fn().finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, p);
      return p;
    },
    /** True while a run for `key` is in flight (diagnostics/tests). */
    has(key: string): boolean {
      return inflight.has(key);
    },
  };
}

export type InFlight<T> = ReturnType<typeof createInFlight<T>>;

/**
 * Doc generation is keyed per meeting AND per document type AND per template:
 * the same meeting generating a BRD and a PRD in parallel is legitimate, and a
 * different template is a different document. Session ids contain `#`, so the
 * readable marker after it stays unambiguous.
 */
export function docGenKey(id: string, docType: string, templateId?: string): string {
  return `${id}#docgen:${docType}:${templateId ?? ''}`;
}
