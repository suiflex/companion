import { useRef, useState } from 'react';
import {
  chatgptAccountId,
  chatgptDevicePoll,
  chatgptDeviceStart,
  chatgptExchangeCode,
  claimEmail,
  generatePkce,
  googleAuthorizeUrl,
  googleExchangeCode,
  parseCallbackUrl,
  randomState,
  resolveCodeAssistAccount,
  type DeviceCode,
} from '@meetcc/ai';
import { DEFAULT_OAUTH, saveSettings, type OAuthSettings, type Settings } from '@meetcc/shared';
import { useToast } from '../toast';

/** A device code stops being approvable after 15 minutes. */
const DEVICE_TTL_MS = 15 * 60_000;

/** Requested at the click, which is the gesture Chrome wants for an origin. */
const ORIGINS: Record<'chatgpt' | 'google-codeassist', string[]> = {
  chatgpt: ['https://auth.openai.com/*', 'https://chatgpt.com/*'],
  'google-codeassist': [
    'https://oauth2.googleapis.com/*',
    'https://cloudcode-pa.googleapis.com/*',
  ],
};

/**
 * Sign in with ChatGPT / with Google — the alternative to pasting an API key.
 *
 * The flow runs here rather than in the service worker because both halves need
 * the page: a click Chrome accepts as the gesture for `permissions.request`,
 * and, for Google, a field the user pastes the callback URL into.
 */
export function SignInPanel({
  provider,
  settings,
  onChange,
}: {
  provider: 'chatgpt' | 'google-codeassist';
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const [busy, setBusy] = useState('');
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [pasted, setPasted] = useState('');
  const pending = useRef<{ verifier: string; state: string } | null>(null);
  const toast = useToast();

  const connected = settings.oauth.provider === provider ? settings.oauth : null;

  /** Persist immediately: a token the user has to fetch again is worse than a
   *  setting they forgot to save. */
  const store = async (oauth: OAuthSettings) => {
    onChange({ oauth });
    await saveSettings({ ...settings, oauth });
  };

  const grant = async (): Promise<boolean> => {
    const origins = ORIGINS[provider];
    if (await chrome.permissions.contains({ origins })) return true;
    return chrome.permissions.request({ origins });
  };

  const fail = (e: unknown) => toast('error', (e as Error).message);

  // -- ChatGPT: device code, no redirect anywhere ----------------------------

  const startChatGpt = async () => {
    if (!(await grant())) return toast('error', 'Izin akses ditolak — sign-in tidak bisa jalan.');
    setBusy('Meminta kode…');
    try {
      const started = await chatgptDeviceStart();
      setDevice(started);
      window.open(started.verificationUrl, '_blank', 'noopener');
      await pollChatGpt(started);
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
      setDevice(null);
    }
  };

  const pollChatGpt = async (started: DeviceCode) => {
    const deadline = Date.now() + DEVICE_TTL_MS;
    setBusy('Menunggu persetujuan di browser…');
    while (Date.now() < deadline) {
      const approved = await chatgptDevicePoll(started);
      if (approved) {
        setBusy('Menukar kode…');
        const tokens = await chatgptExchangeCode(approved.code, approved.verifier);
        await store({
          ...DEFAULT_OAUTH,
          provider: 'chatgpt',
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          accountId: chatgptAccountId(tokens.idToken),
          email: claimEmail(tokens.idToken),
        });
        toast('success', 'ChatGPT tersambung.');
        return;
      }
      await new Promise((r) => setTimeout(r, started.intervalMs));
    }
    throw new Error('Kode kedaluwarsa sebelum disetujui. Coba lagi.');
  };

  // -- Google: consent in a tab, callback URL pasted back --------------------

  const startGoogle = async () => {
    if (!(await grant())) return toast('error', 'Izin akses ditolak — sign-in tidak bisa jalan.');
    try {
      const { verifier, challenge } = await generatePkce();
      const state = randomState();
      pending.current = { verifier, state };
      setPasted('');
      window.open(googleAuthorizeUrl(challenge, state), '_blank', 'noopener');
    } catch (e) {
      fail(e);
    }
  };

  const finishGoogle = async () => {
    const started = pending.current;
    if (!started) return toast('error', 'Mulai dari tombol "Masuk dengan Google" dulu.');
    setBusy('Menukar kode…');
    try {
      const code = parseCallbackUrl(pasted, started.state);
      const tokens = await googleExchangeCode(code, started.verifier);
      setBusy('Menyiapkan project Code Assist…');
      const account = await resolveCodeAssistAccount(tokens.accessToken);
      await store({
        ...DEFAULT_OAUTH,
        provider: 'google-codeassist',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        projectId: account.projectId,
        email: claimEmail(tokens.idToken),
      });
      pending.current = null;
      setPasted('');
      toast('success', 'Google tersambung.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  // -- rendering -------------------------------------------------------------

  if (connected) {
    return (
      <div className="field">
        <span>Akun</span>
        <p className="hint">
          Tersambung{connected.email ? ` sebagai ${connected.email}` : ''}
          {connected.projectId ? ` · project ${connected.projectId}` : ''}. Analisis memakai
          langganan akun ini, bukan tagihan API.
        </p>
        <button
          onClick={() => {
            void store(DEFAULT_OAUTH);
            toast('success', 'Akun diputus.');
          }}
        >
          Keluar
        </button>
      </div>
    );
  }

  return (
    <div className="field">
      <span>Akun</span>
      <p className="hint">
        Pakai langganan yang sudah kamu bayar, tanpa API key. Jalur ini memakai backend yang
        dipakai klien resmi vendor (Codex CLI / Gemini CLI) dan bukan API publik yang
        didokumentasikan — bisa berubah sewaktu-waktu. Butuh yang stabil? Pilih provider API key
        di atas.
      </p>

      {provider === 'chatgpt' ? (
        <>
          <button onClick={() => void startChatGpt()} disabled={!!busy}>
            {busy || 'Masuk dengan ChatGPT'}
          </button>
          {device && (
            <p className="hint">
              Masukkan kode <code>{device.userCode}</code> di tab yang terbuka
              (<code>{device.verificationUrl}</code>), lalu setujui.
            </p>
          )}
        </>
      ) : (
        <>
          <button onClick={() => void startGoogle()} disabled={!!busy}>
            Masuk dengan Google
          </button>
          <p className="hint">
            Setelah menyetujui, browser mendarat di alamat <code>127.0.0.1</code> yang tidak
            memuat apa pun — itu normal. Salin seluruh isi address bar ke sini.
          </p>
          <input
            type="url"
            value={pasted}
            placeholder="http://127.0.0.1:45789/?code=…"
            autoComplete="off"
            onChange={(e) => setPasted(e.target.value)}
          />
          <button className="primary" onClick={() => void finishGoogle()} disabled={!!busy || !pasted}>
            {busy || 'Selesaikan sign-in'}
          </button>
        </>
      )}
    </div>
  );
}
