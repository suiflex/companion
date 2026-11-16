// Runtime host access (roadmap §8.3): the provider and integration origins are
// `optional_host_permissions`, granted one origin at a time from a click.
//
// Not every Chromium browser holds up its end of `chrome.permissions.request`.
// Dia shows no prompt and never settles the promise, and a browser can also
// answer `true` without recording the grant. Either way the caller used to
// carry on and the fetch failed on CORS as a bare "Failed to fetch", which
// points at the API key or the server rather than at the missing permission.
// So the answer is bounded in time and checked against `contains` afterwards.
import { t } from '@meetcc/shared/i18n';

export type HostAccess = 'granted' | 'denied' | 'unanswered';

/** Long enough to read the prompt and decide; a real prompt that is still open
 *  when this runs out keeps working, the caller just stops waiting for it. */
export const PERMISSION_ANSWER_MS = 20_000;

type PermissionsApi = Pick<typeof chrome.permissions, 'contains' | 'request'>;

export async function requestHostAccess(
  origins: string[],
  api: PermissionsApi = chrome.permissions,
  waitMs = PERMISSION_ANSWER_MS,
): Promise<HostAccess> {
  if (!origins.length || (await api.contains({ origins }))) return 'granted';

  let timer: ReturnType<typeof setTimeout> | undefined;
  const unanswered = new Promise<'unanswered'>((resolve) => {
    timer = setTimeout(() => resolve('unanswered'), waitMs);
  });
  try {
    const answer = await Promise.race([api.request({ origins }), unanswered]);
    if (answer === 'unanswered') return answer;
    // the promise's word is not the grant; `contains` is
    return (await api.contains({ origins })) ? 'granted' : 'denied';
  } finally {
    clearTimeout(timer);
  }
}

/** {@link requestHostAccess} for a settings action, saying why it failed. A
 *  refusal is only a warning: the caller decides whether to go on. */
export async function grantHostAccess(
  origins: string[],
  toast: (kind: 'error', message: string) => void,
): Promise<boolean> {
  try {
    const access = await requestHostAccess(origins);
    if (access === 'granted') return true;
    const hosts = hostsLabel(origins);
    toast(
      'error',
      access === 'denied'
        ? t('ext.settings.accessDenied', { hosts })
        : t('ext.settings.accessUnanswered', { hosts }),
    );
  } catch (e) {
    toast('error', t('ext.settings.permissionFailed', { error: (e as Error).message }));
  }
  return false;
}

/** `https://api.example.com/*` → `https://api.example.com`, for messages. */
export function hostsLabel(origins: string[]): string {
  return origins.map((o) => o.replace(/\/\*$/, '')).join(', ');
}
