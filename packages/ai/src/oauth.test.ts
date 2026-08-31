import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OAUTH, type OAuthSettings } from '@meetcc/shared';
import {
  chatgptAccountId,
  chatgptDevicePoll,
  chatgptDeviceStart,
  claimEmail,
  generatePkce,
  googleAuthorizeUrl,
  needsRefresh,
  OAuthError,
  parseCallbackUrl,
  randomState,
  refreshedOAuth,
  resolveCodeAssistAccount,
  REFRESH_WINDOW_MS,
} from './oauth';

interface Call {
  url: string;
  body: any;
}

/** Answer each request in order; later requests reuse the last reply. */
function stubFetch(replies: Array<{ status?: number; json?: unknown }>): Call[] {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const raw = init.body as string;
      calls.push({
        url,
        body: raw?.startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw ?? '')),
      });
      const reply = replies[Math.min(i++, replies.length - 1)];
      return new Response(JSON.stringify(reply.json ?? {}), { status: reply.status ?? 200 });
    }),
  );
  return calls;
}

/** A JWT with the given payload. Only the payload is ever read. */
const jwt = (payload: unknown) =>
  `x.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`;

const oauth = (over: Partial<OAuthSettings>): OAuthSettings => ({ ...DEFAULT_OAUTH, ...over });

afterEach(() => vi.unstubAllGlobals());

describe('PKCE and state', () => {
  it('produces a url-safe S256 challenge that differs from the verifier', async () => {
    const { verifier, challenge } = await generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url, unpadded
    expect(challenge).not.toBe(verifier);
  });

  it('does not repeat a state between sign-ins', () => {
    expect(randomState()).not.toBe(randomState());
  });
});

describe('parseCallbackUrl', () => {
  const url = (q: string) => `http://127.0.0.1:45789/?${q}`;

  it('returns the code when the state matches', () => {
    expect(parseCallbackUrl(url('code=abc&state=s1'), 's1')).toBe('abc');
  });

  it('rejects a URL from a different sign-in rather than exchanging it', () => {
    expect(() => parseCallbackUrl(url('code=abc&state=other'), 's1')).toThrow(/sign-in yang lain/);
  });

  it('surfaces a refused consent, which Google reports in the query string', () => {
    expect(() => parseCallbackUrl(url('error=access_denied&state=s1'), 's1')).toThrow(
      /access_denied/,
    );
  });

  it('rejects text that is not a URL at all', () => {
    expect(() => parseCallbackUrl('abc123', 's1')).toThrow(OAuthError);
  });

  it('rejects a callback carrying no code', () => {
    expect(() => parseCallbackUrl(url('state=s1'), 's1')).toThrow(/authorization code/);
  });
});

describe('googleAuthorizeUrl', () => {
  it('forces the consent prompt so a returning user still gets a refresh token', () => {
    const parsed = new URL(googleAuthorizeUrl('chal', 'st'));
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('scope')).toContain('cloud-platform');
  });
});

describe('id token claims', () => {
  it('reads the account id out of the OpenAI auth claim', () => {
    const token = jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc_1' } });
    expect(chatgptAccountId(token)).toBe('acc_1');
  });

  it('returns empty rather than throwing on a token without the claim', () => {
    expect(chatgptAccountId(jwt({ sub: 'x' }))).toBe('');
    expect(chatgptAccountId('not-a-jwt')).toBe('');
  });

  it('reads the signed-in email', () => {
    expect(claimEmail(jwt({ email: 'a@b.c' }))).toBe('a@b.c');
  });
});

describe('device code transport', () => {
  it('accepts either spelling of the user code key', async () => {
    stubFetch([{ json: { device_auth_id: 'd1', usercode: 'ABCD', interval: '7' } }]);
    const device = await chatgptDeviceStart();
    expect(device.userCode).toBe('ABCD');
    expect(device.intervalMs).toBe(7000);
  });

  it('falls back to a polite interval when none is named', async () => {
    stubFetch([{ json: { device_auth_id: 'd1', user_code: 'ABCD' } }]);
    expect((await chatgptDeviceStart()).intervalMs).toBe(5000);
  });

  it('reads a pending approval as "not yet", not as a failure', async () => {
    stubFetch([{ status: 403 }]);
    const pending = await chatgptDevicePoll({
      deviceAuthId: 'd1',
      userCode: 'ABCD',
      intervalMs: 5000,
      verificationUrl: '',
    });
    expect(pending).toBeNull();
  });

  it('returns the code and the verifier the service generated', async () => {
    stubFetch([{ json: { authorization_code: 'c1', code_verifier: 'v1' } }]);
    const approved = await chatgptDevicePoll({
      deviceAuthId: 'd1',
      userCode: 'ABCD',
      intervalMs: 5000,
      verificationUrl: '',
    });
    expect(approved).toEqual({ code: 'c1', verifier: 'v1' });
  });
});

describe('refreshedOAuth', () => {
  it('leaves a token that is not close to expiry alone', async () => {
    const fetchSpy = stubFetch([{ json: {} }]);
    const still = oauth({
      provider: 'chatgpt',
      refreshToken: 'r1',
      expiresAt: Date.now() + REFRESH_WINDOW_MS * 4,
    });
    expect(await refreshedOAuth(still)).toBeNull();
    expect(fetchSpy).toHaveLength(0);
  });

  it('refreshes inside the window and keeps the identifiers', async () => {
    stubFetch([{ json: { access_token: 'new', expires_in: 3600 } }]);
    const stale = oauth({
      provider: 'chatgpt',
      accessToken: 'old',
      refreshToken: 'r1',
      accountId: 'acc_1',
      expiresAt: Date.now() + 60_000,
    });
    const next = await refreshedOAuth(stale);
    expect(next?.accessToken).toBe('new');
    expect(next?.accountId).toBe('acc_1');
  });

  it('keeps the stored refresh token when Google does not reissue one', async () => {
    stubFetch([{ json: { access_token: 'new', expires_in: 3600 } }]);
    const stale = oauth({
      provider: 'google-codeassist',
      refreshToken: 'r1',
      expiresAt: Date.now() + 60_000,
    });
    expect((await refreshedOAuth(stale))?.refreshToken).toBe('r1');
  });

  it('does nothing for an account that never signed in', async () => {
    expect(await refreshedOAuth(DEFAULT_OAUTH)).toBeNull();
  });

  it('needsRefresh only fires for a token with a known expiry', () => {
    expect(needsRefresh(0)).toBe(false);
    expect(needsRefresh(Date.now() + 60_000)).toBe(true);
    expect(needsRefresh(Date.now() + REFRESH_WINDOW_MS * 3)).toBe(false);
  });
});

describe('resolveCodeAssistAccount', () => {
  it('uses the project the account already has', async () => {
    const calls = stubFetch([{ json: { cloudaicompanionProject: 'proj-1' } }]);
    const account = await resolveCodeAssistAccount('tok');
    expect(account.projectId).toBe('proj-1');
    expect(calls).toHaveLength(1); // no onboarding call
  });

  it('reads the project when it arrives as an object rather than a string', async () => {
    stubFetch([{ json: { cloudaicompanionProject: { id: 'proj-2' } } }]);
    expect((await resolveCodeAssistAccount('tok')).projectId).toBe('proj-2');
  });

  it('onboards an account with no project and waits for the operation to settle', async () => {
    const calls = stubFetch([
      { json: { allowedTiers: [{ id: 'free-tier', isDefault: true }] } },
      { json: { done: false } },
      { json: { done: true, response: { cloudaicompanionProject: 'proj-3' } } },
    ]);
    vi.useFakeTimers();
    const pending = resolveCodeAssistAccount('tok');
    await vi.advanceTimersByTimeAsync(10_000);
    const account = await pending;
    vi.useRealTimers();

    expect(account).toEqual({ projectId: 'proj-3', tierId: 'free-tier' });
    // The default tier from loadCodeAssist drives onboarding, not a guess.
    expect(calls[1].body.tierId).toBe('free-tier');
  });

  it('reports the tier the account is already on rather than guessing one', async () => {
    const calls = stubFetch([
      {
        json: {
          currentTier: { id: 'standard-tier' },
          allowedTiers: [{ id: 'free-tier', isDefault: true }],
          cloudaicompanionProject: 'proj-4',
        },
      },
    ]);
    expect(await resolveCodeAssistAccount('tok')).toEqual({
      projectId: 'proj-4',
      tierId: 'standard-tier',
    });
    expect(calls).toHaveLength(1); // already provisioned, nothing to onboard
  });

  it('reads a project the operation reports at the top level', async () => {
    stubFetch([
      { json: { allowedTiers: [{ id: 'free-tier', isDefault: true }] } },
      { json: { done: true, cloudaicompanionProject: { id: 'proj-5' } } },
    ]);
    expect((await resolveCodeAssistAccount('tok')).projectId).toBe('proj-5');
  });

  it('says what to do when the tier wants a project the user must bring', async () => {
    const calls = stubFetch([
      {
        json: {
          allowedTiers: [
            { id: 'legacy-tier', isDefault: true, userDefinedCloudaicompanionProject: true },
          ],
        },
      },
    ]);
    await expect(resolveCodeAssistAccount('tok')).rejects.toThrow(/Project ID/);
    expect(calls).toHaveLength(1); // onboarding that cannot succeed is not attempted
  });

  it('still onboards a project the user supplied, rather than trusting it blind', async () => {
    const calls = stubFetch([
      {
        json: {
          allowedTiers: [
            { id: 'legacy-tier', isDefault: true, userDefinedCloudaicompanionProject: true },
          ],
        },
      },
      { json: { done: true, response: { cloudaicompanionProject: 'my-proj' } } },
    ]);
    expect(await resolveCodeAssistAccount('tok', ' my-proj ')).toEqual({
      projectId: 'my-proj',
      tierId: 'legacy-tier',
    });
    // a project Code Assist was never told about would fail at the first
    // completion, so it goes to both calls
    expect(calls).toHaveLength(2);
    expect(calls[0].body.cloudaicompanionProject).toBe('my-proj');
    expect(calls[1].body.cloudaicompanionProject).toBe('my-proj');
  });

  it('names the tier when onboarding settles without a project', async () => {
    stubFetch([
      { json: { allowedTiers: [{ id: 'free-tier', isDefault: true }] } },
      { json: { done: true, response: {} } },
    ]);
    await expect(resolveCodeAssistAccount('tok')).rejects.toThrow(/free-tier/);
  });
});
