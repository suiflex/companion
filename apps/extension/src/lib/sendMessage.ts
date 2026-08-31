// §32.1 W1/W4: single funnel for extension → background service-worker
// messages that carry a payload. `lib/db.ts` owns the `db`-op shape; this
// owns the rest (export-obsidian, export-audit, global-ask, …) so call
// sites stay one-liners and the async-response contract lives in one place.

export async function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  const res = (await chrome.runtime.sendMessage(message)) as T & { ok?: boolean; error?: string };
  if (res && res.ok === false) throw new Error(res.error || 'Operasi gagal.');
  return res;
}
