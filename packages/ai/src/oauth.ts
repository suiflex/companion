/**
 * Sign in with ChatGPT / Sign in with Google — OAuth protocol helpers.
 *
 * Both flows let the user spend a subscription they already pay for instead of
 * pasting an API key. Neither backend is a documented public API: the endpoints,
 * bodies and status codes below mirror the vendors' own open-source clients
 * (`openai/codex` for ChatGPT, `google-gemini/gemini-cli` for Code Assist), and
 * are reached with those clients' public credentials. The settings page carries
 * the matching risk notice.
 *
 * Transport is picked by what a Chrome extension can actually receive. Neither
 * bundled client allows an extension redirect URI, and `launchWebAuthFlow` only
 * terminates on `chromiumapp.org`, so:
 *
 * - **ChatGPT** uses the device-code transport, which has no redirect at all.
 * - **Google** opens the consent page in a tab and the user pastes the
 *   `127.0.0.1` URL the browser lands on back into the extension.
 *
 * Pure protocol: no chrome.* calls, no storage. The caller owns both.
 */

import type { OAuthSettings } from '@meetcc/shared';

const TIMEOUT_MS = 30_000;

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new OAuthError('NETWORK', `Tidak bisa menghubungi ${new URL(url).host}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

async function body(res: Response, code: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new OAuthError(code, 'Auth service tidak mengembalikan JSON');
  }
}

// -- shared primitives -------------------------------------------------------

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** Epoch ms. Zero when the response named no lifetime. */
  expiresAt: number;
}

/** Refresh this long before expiry rather than after a 401. */
export const REFRESH_WINDOW_MS = 5 * 60_000;

export function needsRefresh(expiresAt: number, now = Date.now()): boolean {
  return expiresAt > 0 && expiresAt - now <= REFRESH_WINDOW_MS;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(24)));
}

/** PKCE pair. S256 only — the plain method is accepted by neither client. */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** Unverified JWT payload. Used only to read a claim the issuer just handed us. */
export function jwtClaims(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) return {};
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function tokensOf(raw: Record<string, unknown>, code: string, previous?: OAuthTokens): OAuthTokens {
  const accessToken = raw.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new OAuthError(code, 'Respons tidak memuat access token');
  }
  const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : 0;
  return {
    accessToken,
    // Google does not reissue a refresh token on refresh; keep the stored one.
    refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : (previous?.refreshToken ?? ''),
    idToken: typeof raw.id_token === 'string' ? raw.id_token : (previous?.idToken ?? ''),
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
  };
}

// -- ChatGPT -----------------------------------------------------------------

export const CHATGPT_ISSUER = 'https://auth.openai.com';
/** Codex CLI's public client id (`codex-rs/login/src/auth/manager.rs`). */
export const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
/** Where the user types the device code. */
export const CHATGPT_DEVICE_URL = `${CHATGPT_ISSUER}/codex/device`;
/** The redirect URI a device-code authorization code was issued against. */
const CHATGPT_DEVICE_REDIRECT = `${CHATGPT_ISSUER}/deviceauth/callback`;
/** The ChatGPT backend Codex talks to. Responses API, not chat/completions. */
export const CHATGPT_API_BASE = 'https://chatgpt.com/backend-api/codex';

const AUTH_CLAIM = 'https://api.openai.com/auth';
// A device code the user has not approved yet comes back as 403 or 404.
const DEVICE_PENDING = new Set([403, 404]);

export interface DeviceCode {
  deviceAuthId: string;
  userCode: string;
  intervalMs: number;
  verificationUrl: string;
}

/** Request a device code for the user to approve at {@link CHATGPT_DEVICE_URL}. */
export async function chatgptDeviceStart(): Promise<DeviceCode> {
  const res = await request(`${CHATGPT_ISSUER}/api/accounts/deviceauth/usercode`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ client_id: CHATGPT_CLIENT_ID }),
  });
  if (res.status >= 400) {
    throw new OAuthError('DEVICE_START_FAILED', `Gagal meminta device code (HTTP ${res.status})`);
  }
  const raw = await body(res, 'DEVICE_START_FAILED');
  const deviceAuthId = raw.device_auth_id;
  // The service has spelled this key both ways.
  const userCode = raw.user_code ?? raw.usercode;
  if (typeof deviceAuthId !== 'string' || typeof userCode !== 'string') {
    throw new OAuthError('DEVICE_START_FAILED', 'Respons tidak memuat device code');
  }
  const interval = Number(raw.interval);
  return {
    deviceAuthId,
    userCode,
    intervalMs: (Number.isFinite(interval) && interval > 0 ? interval : 5) * 1000,
    verificationUrl: CHATGPT_DEVICE_URL,
  };
}

/**
 * Poll once. Returns null while the user has not approved yet.
 *
 * The auth service generates the PKCE pair for this transport, so the code and
 * its verifier both arrive here.
 */
export async function chatgptDevicePoll(
  device: DeviceCode,
): Promise<{ code: string; verifier: string } | null> {
  const res = await request(`${CHATGPT_ISSUER}/api/accounts/deviceauth/token`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ device_auth_id: device.deviceAuthId, user_code: device.userCode }),
  });
  if (DEVICE_PENDING.has(res.status)) return null;
  if (res.status >= 400) {
    throw new OAuthError('DEVICE_POLL_FAILED', `Device auth gagal (HTTP ${res.status})`);
  }
  const raw = await body(res, 'DEVICE_POLL_FAILED');
  const code = raw.authorization_code;
  const verifier = raw.code_verifier;
  if (typeof code !== 'string' || typeof verifier !== 'string') {
    throw new OAuthError('DEVICE_POLL_FAILED', 'Persetujuan tidak memuat authorization code');
  }
  return { code, verifier };
}

/** Trade a device-code approval for tokens. */
export async function chatgptExchangeCode(code: string, verifier: string): Promise<OAuthTokens> {
  const res = await request(`${CHATGPT_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CHATGPT_DEVICE_REDIRECT,
      client_id: CHATGPT_CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  });
  if (res.status >= 400) {
    throw new OAuthError('CODE_EXCHANGE_FAILED', `Penukaran code gagal (HTTP ${res.status})`);
  }
  return tokensOf(await body(res, 'CODE_EXCHANGE_FAILED'), 'CODE_EXCHANGE_FAILED');
}

/** Refresh an expiring token. This endpoint takes JSON, not a form. */
export async function chatgptRefresh(previous: OAuthTokens): Promise<OAuthTokens> {
  const res = await request(`${CHATGPT_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      client_id: CHATGPT_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: previous.refreshToken,
    }),
  });
  if (res.status >= 400) {
    throw new OAuthError('REFRESH_FAILED', `Refresh token ditolak (HTTP ${res.status}). Masuk ulang.`);
  }
  return tokensOf(await body(res, 'REFRESH_FAILED'), 'REFRESH_FAILED', previous);
}

/** `chatgpt_account_id` — the value of the `chatgpt-account-id` request header. */
export function chatgptAccountId(idToken: string): string {
  const auth = jwtClaims(idToken)[AUTH_CLAIM];
  if (!auth || typeof auth !== 'object') return '';
  const value = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof value === 'string' ? value : '';
}

/** The signed-in address, for showing who is connected. */
export function claimEmail(idToken: string): string {
  const email = jwtClaims(idToken).email;
  return typeof email === 'string' ? email : '';
}

// -- Google / Code Assist ----------------------------------------------------

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Gemini CLI's public Desktop-app client (`packages/core/src/code_assist/oauth2.ts`). */
export const GOOGLE_CLIENT_ID =
  '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
// Its paired secret. Not a credential in the usual sense: Google's own docs say
// an installed application "cannot keep the client_secret confidential", and
// PKCE is what actually secures this flow. gemini-cli ships it in source too.
export const GOOGLE_CLIENT_SECRET = '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';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid',
];

/**
 * A loopback port nothing is listening on. A Desktop-app client accepts any
 * port on the loopback address, and the user pastes the resulting URL back —
 * so the port only has to be stable between the consent URL and the exchange.
 */
export const GOOGLE_REDIRECT_URI = 'http://127.0.0.1:45789';

/** Where Code Assist onboarding runs, for both the free and paid tiers. */
export const CLOUDCODE_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const CODE_ASSIST_USER_AGENT = 'GeminiCLI/1.0.0 (meet-companion)';
const DEFAULT_TIER = 'legacy-tier';
const ONBOARD_ATTEMPTS = 10;
const ONBOARD_INTERVAL_MS = 5_000;

/**
 * Consent URL for the paste-back flow.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google return a
 * refresh token. Without the forced prompt it issues one only on the very first
 * consent, so a returning user would come back with an access token that
 * expires in an hour and no way to renew it.
 */
export function googleAuthorizeUrl(challenge: string, state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    scope: GOOGLE_SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${query.toString()}`;
}

/**
 * The authorization code out of the URL the user pasted.
 *
 * Google reports a refusal in the query string rather than by status code, so a
 * denied consent arrives here and not at the token endpoint.
 */
export function parseCallbackUrl(url: string, expectedState: string): string {
  let query: URLSearchParams;
  try {
    query = new URL(url.trim()).searchParams;
  } catch {
    throw new OAuthError('BAD_URL', 'Itu bukan URL. Salin seluruh isi address bar.');
  }
  const error = query.get('error');
  if (error) throw new OAuthError('CONSENT_DENIED', `Google menolak: ${error}`);
  if (query.get('state') !== expectedState) {
    throw new OAuthError('STATE_MISMATCH', 'URL itu milik proses sign-in yang lain. Ulangi.');
  }
  const code = query.get('code');
  if (!code) throw new OAuthError('NO_CODE', 'URL itu tidak memuat authorization code.');
  return code;
}

export async function googleExchangeCode(code: string, verifier: string): Promise<OAuthTokens> {
  const res = await request(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: GOOGLE_REDIRECT_URI,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code_verifier: verifier,
    }).toString(),
  });
  if (res.status >= 400) {
    throw new OAuthError('CODE_EXCHANGE_FAILED', `Penukaran code gagal (HTTP ${res.status})`);
  }
  return tokensOf(await body(res, 'CODE_EXCHANGE_FAILED'), 'CODE_EXCHANGE_FAILED');
}

export async function googleRefresh(previous: OAuthTokens): Promise<OAuthTokens> {
  const res = await request(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: previous.refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }).toString(),
  });
  if (res.status >= 400) {
    throw new OAuthError('REFRESH_FAILED', `Refresh token ditolak (HTTP ${res.status}). Masuk ulang.`);
  }
  return tokensOf(await body(res, 'REFRESH_FAILED'), 'REFRESH_FAILED', previous);
}

function codeAssistHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': CODE_ASSIST_USER_AGENT,
    'x-request-source': 'local',
  };
}

/** `ideType`/`platform`/`pluginType` are numeric enums in the vendor's protobuf.
 *  An unrecognised host reports platform 0, which the endpoint accepts. */
function clientMetadata(): Record<string, number> {
  const ua = navigator.userAgent;
  const platform = /Mac/i.test(ua) ? 1 : /Win/i.test(ua) ? 5 : /Linux|X11/i.test(ua) ? 3 : 0;
  return { ideType: 9, platform, pluginType: 2 };
}

/** `cloudaicompanionProject` is sometimes a string, sometimes an object. */
function projectOf(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const id = (raw as Record<string, unknown>).id;
    if (typeof id === 'string') return id.trim();
  }
  return '';
}

export interface CodeAssistAccount {
  projectId: string;
  tierId: string;
}

interface Tier {
  id: string;
  /** The tier expects a Google Cloud project the user owns; Code Assist will
   *  not provision one on their behalf. */
  userDefined: boolean;
}

function tierOf(raw: unknown): Tier | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const id = typeof t.id === 'string' ? t.id.trim() : '';
  return id ? { id, userDefined: t.userDefinedCloudaicompanionProject === true } : null;
}

function defaultTier(raw: unknown): Tier {
  for (const entry of Array.isArray(raw) ? raw : []) {
    if ((entry as Record<string, unknown> | null)?.isDefault) {
      const tier = tierOf(entry);
      if (tier) return tier;
    }
  }
  return { id: DEFAULT_TIER, userDefined: false };
}

/**
 * The account's Code Assist project, provisioning one when it has none.
 *
 * This is what makes signing in ask the user for nothing: Vertex would need a
 * GCP project up front, here the account's own is discovered or created.
 *
 * `projectId` is the escape hatch for the one case that cannot be automated —
 * a tier whose project the user has to bring themselves.
 */
export async function resolveCodeAssistAccount(
  accessToken: string,
  projectId = '',
): Promise<CodeAssistAccount> {
  const given = projectId.trim();
  const load = await request(`${CLOUDCODE_ENDPOINT}/v1internal:loadCodeAssist`, {
    method: 'POST',
    headers: codeAssistHeaders(accessToken),
    body: JSON.stringify({
      ...(given ? { cloudaicompanionProject: given } : {}),
      metadata: clientMetadata(),
    }),
  });
  if (load.status >= 400) {
    throw new OAuthError('LOAD_FAILED', `loadCodeAssist gagal (HTTP ${load.status})`);
  }
  const raw = await body(load, 'LOAD_FAILED');

  const known = projectOf(raw.cloudaicompanionProject) || given;
  // An account already onboarded reports the tier it sits on. Sending it back
  // through provisioning is at best a no-op and at worst the reason onboarding
  // answers `done` without naming a project.
  const current = tierOf(raw.currentTier);
  if (current && known) return { projectId: known, tierId: current.id };

  const tier = current ?? defaultTier(raw.allowedTiers);
  if (known) return { projectId: known, tierId: tier.id };
  if (tier.userDefined) {
    throw new OAuthError(
      'PROJECT_REQUIRED',
      `Akun ini pada tier "${tier.id}" yang mewajibkan project Google Cloud milikmu sendiri — ` +
        'Code Assist tidak membuatkannya. Isi Project ID di bawah lalu masuk lagi.',
    );
  }
  return { projectId: await onboardUser(accessToken, tier.id, given), tierId: tier.id };
}

/**
 * Provision a Code Assist project and return its id.
 *
 * A long-running operation: the first call usually answers `done: false`, so it
 * is re-issued until it settles. Treating the first reply as final would hand
 * back an empty project id and fail at the first completion instead.
 */
async function onboardUser(accessToken: string, tierId: string, projectId: string): Promise<string> {
  for (let attempt = 0; attempt < ONBOARD_ATTEMPTS; attempt++) {
    const res = await request(`${CLOUDCODE_ENDPOINT}/v1internal:onboardUser`, {
      method: 'POST',
      headers: codeAssistHeaders(accessToken),
      body: JSON.stringify({
        tierId,
        ...(projectId ? { cloudaicompanionProject: projectId } : {}),
        metadata: clientMetadata(),
      }),
    });
    if (res.status >= 400) {
      throw new OAuthError('ONBOARD_FAILED', `onboardUser gagal (HTTP ${res.status})`);
    }
    const raw = await body(res, 'ONBOARD_FAILED');
    if (raw.done === true) {
      // the project rides in the operation's response, but some replies carry
      // it at the top level instead
      const inner = raw.response;
      const project =
        projectOf(
          inner && typeof inner === 'object'
            ? (inner as Record<string, unknown>).cloudaicompanionProject
            : null,
        ) ||
        projectOf(raw.cloudaicompanionProject) ||
        projectId;
      if (!project) {
        throw new OAuthError(
          'ONBOARD_NO_PROJECT',
          `Onboarding tier "${tierId}" selesai tanpa menyebut project. ` +
            'Isi Project ID Google Cloud di bawah lalu masuk lagi.',
        );
      }
      return project;
    }
    if (attempt + 1 < ONBOARD_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, ONBOARD_INTERVAL_MS));
    }
  }
  throw new OAuthError('ONBOARD_TIMEOUT', 'Onboarding tidak selesai. Coba masuk lagi.');
}

// -- keeping a stored sign-in usable ----------------------------------------

/**
 * A refreshed copy of a stored sign-in, or null when it is still good.
 *
 * The caller persists what comes back — this module never touches storage.
 * Refreshing ahead of expiry is what keeps a scheduled analysis from failing on
 * a token that went stale while nobody was looking.
 */
export async function refreshedOAuth(oauth: OAuthSettings): Promise<OAuthSettings | null> {
  if (!oauth.provider || !oauth.refreshToken) return null;
  if (!needsRefresh(oauth.expiresAt)) return null;
  const previous: OAuthTokens = {
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    idToken: '',
    expiresAt: oauth.expiresAt,
  };
  const next =
    oauth.provider === 'chatgpt' ? await chatgptRefresh(previous) : await googleRefresh(previous);
  return {
    ...oauth,
    accessToken: next.accessToken,
    refreshToken: next.refreshToken || oauth.refreshToken,
    expiresAt: next.expiresAt,
  };
}
