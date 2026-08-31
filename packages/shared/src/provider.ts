import type { ProviderId, Settings } from './types';

const EMPTY = { model: '', baseUrl: '' };

/**
 * Settings with `next` as the active provider, keeping every provider's own
 * model and Base URL.
 *
 * Switching used to blank both fields, so a user who had tuned OpenAI, moved to
 * Claude and came back found their model gone — and gone from storage too, the
 * next time they pressed Simpan.
 *
 * The current provider's values are folded into the map before `next` is read
 * out of it, which makes `switchProvider(s, s.provider)` an identity: the save
 * path can call it to capture the last edit without restoring a stale copy over
 * it.
 */
export function switchProvider(s: Settings, next: ProviderId): Settings {
  const byProvider = {
    ...s.byProvider,
    [s.provider]: { model: s.model, baseUrl: s.baseUrl },
  };
  const restored = byProvider[next] ?? EMPTY;
  return { ...s, provider: next, model: restored.model, baseUrl: restored.baseUrl, byProvider };
}
