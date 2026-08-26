import { refreshedOAuth } from '@meetcc/ai';
import { loadSettings, saveSettings, type Settings } from '@meetcc/shared';

/**
 * Settings with a usable access token.
 *
 * An OAuth access token lives about an hour, and the pipeline runs on an alarm
 * long after the user pressed anything — so the token is renewed ahead of
 * expiry here rather than after a 401 has already failed an analysis. A refresh
 * the issuer refuses is not fatal on its own: the stale token is returned and
 * the provider call reports the real problem, which is that the user has to
 * sign in again.
 */
export async function loadSettingsForAI(): Promise<Settings> {
  const settings = await loadSettings();
  try {
    const oauth = await refreshedOAuth(settings.oauth);
    if (!oauth) return settings;
    const next = { ...settings, oauth };
    await saveSettings(next);
    return next;
  } catch {
    return settings;
  }
}
