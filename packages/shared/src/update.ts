// Chromium cannot auto-update an extension loaded unpacked — `update_url` only
// applies to a Web Store CRX or an enterprise policy install. So the extension
// checks for itself and says so; `companion update` does the actual work.
// Firefox installs the signed .xpi and updates on its own, which is why the
// banner is only worth showing on Chromium.

export const UPDATE_KEY = 'update:latest';
export const UPDATE_DISMISSED_KEY = 'update:dismissed';

const RELEASES_URL = 'https://api.github.com/repos/suiflex/companion/releases/latest';

export interface UpdateState {
  /** Version from the newest release, without the leading `v`. */
  latest: string;
  /** Release page, so the banner can link out. */
  url: string;
  checkedAt: number;
}

/**
 * Compare two dotted version strings numerically.
 *
 * String comparison gets this wrong the moment a component reaches double
 * digits — '1.10.0' < '1.9.0' — which is exactly when an update notice would
 * silently stop appearing.
 *
 * @returns negative when a < b, 0 when equal, positive when a > b.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when a newer release exists and the user has not waved it away. */
export function updateAvailable(
  current: string,
  state: UpdateState | undefined,
  dismissed: string | undefined,
): boolean {
  if (!state?.latest) return false;
  if (compareVersions(state.latest, current) <= 0) return false;
  return dismissed !== state.latest;
}

/**
 * Ask GitHub what the newest release is. Returns undefined on any failure —
 * offline, rate-limited, a release with no tag — because a background version
 * check must never surface as an error the user has to deal with.
 */
export async function fetchLatestRelease(
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateState | undefined> {
  try {
    const res = await fetchImpl(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return undefined;
    const rel = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!rel.tag_name) return undefined;
    return {
      latest: rel.tag_name.replace(/^v/, ''),
      url: rel.html_url ?? 'https://github.com/suiflex/companion/releases/latest',
      checkedAt: Date.now(),
    };
  } catch {
    return undefined;
  }
}
