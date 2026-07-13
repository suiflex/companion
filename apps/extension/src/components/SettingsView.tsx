import { useEffect, useState } from 'react';
import {
  createClient,
  PROVIDER_PRESETS,
  resolveConfig,
  validateSettings,
} from '@meetcc/ai';
import {
  loadSettings,
  saveSettings,
  type ProviderId,
  type Settings,
} from '@meetcc/shared';
import { useToast } from '../toast';

const PROVIDERS = Object.entries(PROVIDER_PRESETS) as [
  ProviderId,
  (typeof PROVIDER_PRESETS)[ProviderId],
][];

export function SettingsView({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <div className="summary-body">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton skeleton-block" />
        ))}
      </div>
    );
  }

  const preset = PROVIDER_PRESETS[settings.provider];
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  const save = async () => {
    const problem = validateSettings(settings);
    if (problem) return toast('error', problem);
    await saveSettings(settings);
    toast('success', 'Settings tersimpan.');
    onClose();
  };

  const test = async () => {
    const problem = validateSettings(settings);
    if (problem) return toast('error', problem);
    setTesting(true);
    try {
      const client = createClient(resolveConfig(settings));
      const out = await client.complete({
        system: 'Kamu asisten singkat.',
        user: 'Balas satu kata: OK',
      });
      toast('success', `Provider merespons: ${out.slice(0, 40)}`);
    } catch (e) {
      toast('error', `Koneksi gagal: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settings">
      <header className="toolbar">
        <div className="toolbar-title">
          <h1>Settings — AI Provider</h1>
        </div>
        <button onClick={onClose} aria-label="Tutup settings">
          ✕
        </button>
      </header>

      <div className="settings-body">
        <label className="field">
          <span>Provider</span>
          <select
            value={settings.provider}
            onChange={(e) => set({ provider: e.target.value as ProviderId, model: '', baseUrl: '' })}
          >
            {PROVIDERS.map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {settings.provider === 'builtin' && (
          <p className="hint">
            Tanpa konfigurasi — pakai AI bawaan browser (Gemini Nano) bila tersedia.
            Untuk hasil terbaik pilih provider cloud/lokal di atas.
          </p>
        )}

        {settings.provider !== 'builtin' && (
          <label className="field">
            <span>API Key{preset.needsKey ? '' : ' (opsional)'}</span>
            <input
              type="password"
              value={settings.apiKey}
              autoComplete="off"
              placeholder={preset.needsKey ? 'sk-…' : 'kosongkan jika endpoint tanpa auth'}
              onChange={(e) => set({ apiKey: e.target.value })}
            />
            <span className="hint">
              Dikirim sebagai <code>Authorization: Bearer</code>
              {preset.needsKey ? '' : ' bila diisi'} · disimpan terenkripsi (AES-GCM).
            </span>
          </label>
        )}

        {(preset.needsBaseUrl || settings.baseUrl) && (
          <label className="field">
            <span>Base URL</span>
            <input
              type="url"
              value={settings.baseUrl}
              placeholder={preset.baseUrl || 'https://your-endpoint/v1'}
              onChange={(e) => set({ baseUrl: e.target.value })}
            />
            {settings.provider === 'azure' && (
              <span className="hint">Endpoint resource Azure, model = nama deployment.</span>
            )}
          </label>
        )}

        {settings.provider !== 'builtin' && (
          <label className="field">
            <span>Model</span>
            <input
              type="text"
              value={settings.model}
              placeholder={preset.model || 'nama model / deployment'}
              onChange={(e) => set({ model: e.target.value })}
            />
          </label>
        )}

        <div className="subbar">
          <button onClick={test} disabled={testing}>
            {testing ? 'Menguji…' : 'Test koneksi'}
          </button>
          <span className="spacer" />
          <button className="primary" onClick={save}>
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
