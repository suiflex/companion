import { useEffect, useState } from 'react';
import {
  createClient,
  PROVIDER_PRESETS,
  requiredOrigins,
  resolveConfig,
  validateSettings,
} from '@meetcc/ai';
import {
  RETENTION_OPTIONS,
  loadSettings,
  saveSettings,
  type ProviderId,
  type Settings,
} from '@meetcc/shared';
import { useToast } from '../toast';
import { DataPanel, IntegrationsPanel, TemplatesPanel } from './SettingsPanels';

type Panel = 'provider' | 'integrations' | 'templates' | 'data';

const PANEL_LABEL: Record<Panel, string> = {
  provider: 'AI Provider',
  integrations: 'Integrasi',
  templates: 'Template',
  data: 'Data & MCP',
};

const PROVIDERS = Object.entries(PROVIDER_PRESETS) as [
  ProviderId,
  (typeof PROVIDER_PRESETS)[ProviderId],
][];

export function SettingsView({
  onClose,
  selectedMeeting = null,
}: {
  onClose: () => void;
  selectedMeeting?: string | null;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [testing, setTesting] = useState(false);
  const [panel, setPanel] = useState<Panel>('provider');
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

  /** §8.3 — the extension ships without blanket host access; the endpoints the
   *  user just configured are requested here, where the click is the gesture
   *  Chrome requires. Declining only means those calls will fail, so it is a
   *  warning, not a blocked save. */
  const grantOrigins = async (next: Settings): Promise<void> => {
    const origins = requiredOrigins(next);
    if (!origins.length) return;
    try {
      if (await chrome.permissions.contains({ origins })) return;
      const granted = await chrome.permissions.request({ origins });
      if (!granted) {
        toast('error', 'Izin akses endpoint ditolak — panggilan ke layanan itu akan gagal.');
      }
    } catch (e) {
      toast('error', `Gagal meminta izin: ${(e as Error).message}`);
    }
  };

  const save = async () => {
    const problem = validateSettings(settings);
    if (problem) return toast('error', problem);
    // turning retention on starts deleting meetings on the next sweep
    if (settings.retentionDays > 0) {
      const ok = window.confirm(
        `Meeting yang tidak aktif lebih dari ${settings.retentionDays} hari akan dihapus permanen, ` +
          'termasuk transcript, notulen, chat dan dokumennya. Lanjutkan?',
      );
      if (!ok) return;
    }
    await grantOrigins(settings);
    await saveSettings(settings);
    toast('success', 'Settings tersimpan.');
    onClose();
  };

  const test = async () => {
    const problem = validateSettings(settings);
    if (problem) return toast('error', problem);
    await grantOrigins(settings);
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
          <h1>Settings</h1>
        </div>
        <nav className="tabs" role="tablist" aria-label="Bagian settings">
          {(Object.keys(PANEL_LABEL) as Panel[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={panel === p}
              className={`tab ${panel === p ? 'active' : ''}`}
              onClick={() => setPanel(p)}
            >
              {PANEL_LABEL[p]}
            </button>
          ))}
        </nav>
        <button onClick={onClose} aria-label="Tutup settings">
          ✕
        </button>
      </header>

      <div className="settings-body">
        {panel === 'templates' && <TemplatesPanel />}
        {panel === 'data' && <DataPanel selectedMeeting={selectedMeeting} />}
        {panel === 'integrations' && <IntegrationsPanel settings={settings} onChange={set} />}

        {panel === 'provider' && (
        <>
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

        <label className="field">
          <span>Simpan riwayat</span>
          <select
            value={settings.retentionDays}
            onChange={(e) => set({ retentionDays: Number(e.target.value) })}
          >
            {RETENTION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? 'Selamanya (default)' : `Hapus otomatis setelah ${d} hari`}
              </option>
            ))}
          </select>
          <span className="hint">
            {settings.retentionDays === 0
              ? 'Tidak ada yang dihapus otomatis.'
              : `Meeting yang tidak aktif lebih dari ${settings.retentionDays} hari dihapus permanen (transcript, notulen, chat, dokumen) — tidak bisa dibatalkan.`}
          </span>
        </label>
        </>
        )}

        {panel !== 'templates' && panel !== 'data' && (
          <div className="subbar">
            {panel === 'provider' && (
              <button onClick={test} disabled={testing}>
                {testing ? 'Menguji…' : 'Test koneksi'}
              </button>
            )}
            <span className="spacer" />
            <button className="primary" onClick={save}>
              Simpan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
