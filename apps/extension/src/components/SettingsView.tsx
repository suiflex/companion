import { useEffect, useRef, useState } from 'react';
import {
  createClient,
  listModels,
  PROVIDER_PRESETS,
  requiredOrigins,
  resolveConfig,
  validateSettings,
} from '@meetcc/ai';
import {
  RETENTION_OPTIONS,
  loadSettings,
  saveSettings,
  switchProvider,
  type OAuthSettings,
  type ProviderId,
  type Settings,
} from '@meetcc/shared';
import { useToast } from '../toast';
import { DataPanel, IntegrationsPanel, TemplatesPanel } from './SettingsPanels';
import { SignInPanel } from './SignInPanel';
import { t, LANGS, type LangPref } from '@meetcc/shared/i18n';
import { applyLang, loadLangPref, saveLangPref } from '../lib/lang';

type Panel = 'provider' | 'integrations' | 'templates' | 'data';

// Looked up per render rather than frozen at module load, so switching the
// language relabels the tabs without a reload.
const PANEL_LABEL: Record<Panel, Parameters<typeof t>[0]> = {
  provider: 'ext.settings.tab.provider',
  integrations: 'ext.settings.tab.integrations',
  templates: 'ext.settings.tab.templates',
  data: 'ext.settings.tab.data',
};

const langLabel = (p: LangPref): string =>
  p === 'system' ? t('pref.system') : p === 'en' ? t('lang.en') : t('lang.id');

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
  const [langPref, setLangPref] = useState<LangPref>('system');
  useEffect(() => {
    void loadLangPref().then(setLangPref);
  }, []);
  const [testing, setTesting] = useState(false);
  const [panel, setPanel] = useState<Panel>('provider');
  const [models, setModels] = useState<string[]>([]);
  const [modelsNote, setModelsNote] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const toast = useToast();

  /** The sign-in flow persists across an await, and the user can keep typing in
   *  the form meanwhile — writing back a render-old copy would drop that edit. */
  const latest = useRef<Settings | null>(null);
  useEffect(() => {
    latest.current = settings;
  });

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const stillOn = (next: Settings) => (latest.current ?? next).provider === next.provider;

  /** Ask the provider what it serves. Falls back to the preset's hand-kept list
   *  rather than leaving the field with no suggestions at all. */
  const loadModels = async (next: Settings) => {
    setLoadingModels(true);
    setModels([]);
    setModelsNote('');
    try {
      const found = await listModels(next);
      // switching twice in a row leaves two requests in flight; the slower one
      // must not answer for a provider that is no longer selected
      if (stillOn(next)) setModels(found);
    } catch (e) {
      if (!stillOn(next)) return;
      setModels(PROVIDER_PRESETS[next.provider]?.models ?? []);
      setModelsNote(`Daftar model tidak bisa diambil (${(e as Error).message}) — ketik manual.`);
    } finally {
      // a stale request must not clear the spinner the newer one owns
      if (stillOn(next)) setLoadingModels(false);
    }
  };

  // Only automatic once the origin is already granted: chrome.permissions
  // .request needs a user gesture, and changing a <select> is not one Chrome
  // accepts. Without the grant the user presses "Muat model", which is.
  useEffect(() => {
    const current = settings;
    if (!current) return;
    void (async () => {
      const origins = requiredOrigins(current);
      if (origins.length && !(await chrome.permissions.contains({ origins }))) {
        setModels(PROVIDER_PRESETS[current.provider]?.models ?? []);
        setModelsNote('');
        return;
      }
      await loadModels(current);
    })();
    // provider and sign-in are what change the catalogue; a key edit waits for
    // the button, so a half-typed key does not fire a request per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.provider, settings?.oauth.provider]);

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

  /** The click is the gesture Chrome wants before it will grant the origin. */
  const refreshModels = async () => {
    await grantOrigins(settings);
    await loadModels(settings);
  };

  /** Sign-in persists its own tokens; it reads the newest form state so an edit
   *  made while the browser was on the consent page is not written back stale. */
  const persistOAuth = async (oauth: OAuthSettings) => {
    const next = { ...(latest.current ?? settings), oauth };
    setSettings(next);
    await saveSettings(next);
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
    // identity for the provider, but it folds the current model/baseUrl into
    // `byProvider` so coming back to this provider later restores them
    await saveSettings(switchProvider(settings, settings.provider));
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
          <h1>{t('ext.settings.title')}</h1>
        </div>
        <nav className="tabs" role="tablist" aria-label={t('ext.settings.sections')}>
          {(Object.keys(PANEL_LABEL) as Panel[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={panel === p}
              className={`tab ${panel === p ? 'active' : ''}`}
              onClick={() => setPanel(p)}
            >
              {t(PANEL_LABEL[p])}
            </button>
          ))}
        </nav>
        <button onClick={onClose} aria-label={t('ext.settings.close')}>
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
          <span>{t('ext.settings.language')}</span>
          {/* Persisted on change, not on Save: the language is stored beside
              the theme rather than inside the encrypted settings blob, because
              it has to be readable before the first paint. */}
          <select
            value={langPref}
            onChange={(e) => {
              const next = e.target.value as LangPref;
              setLangPref(next);
              applyLang(next);
              saveLangPref(next);
            }}
          >
            {(['system', ...LANGS] as LangPref[]).map((l) => (
              <option key={l} value={l}>
                {langLabel(l)}
              </option>
            ))}
          </select>
          <span className="hint">{t('ext.settings.languageHint')}</span>
        </label>

        <label className="field">
          <span>{t('ext.provider.label')}</span>
          <select
            value={settings.provider}
            onChange={(e) => setSettings(switchProvider(settings, e.target.value as ProviderId))}
          >
            {PROVIDERS.map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {settings.provider === 'builtin' && (
          <p className="hint">{t('ext.provider.builtinHint')}</p>
        )}

        {preset.needsSignIn && (
          <SignInPanel
            provider={settings.provider as 'chatgpt' | 'google-codeassist'}
            settings={settings}
            onPersist={persistOAuth}
          />
        )}

        {settings.provider !== 'builtin' && !preset.needsSignIn && (
          <label className="field">
            <span>{preset.needsKey ? t('ext.provider.apiKey') : t('ext.provider.apiKeyOptional')}</span>
            <input
              type="password"
              value={settings.apiKey}
              autoComplete="off"
              placeholder={preset.needsKey ? 'sk-…' : t('ext.provider.apiKeyPlaceholder')}
              onChange={(e) => set({ apiKey: e.target.value })}
            />
            <span className="hint">
              {(preset.needsKey
                ? t('ext.provider.apiKeyHintRequired', { header: '\u0000' })
                : t('ext.provider.apiKeyHintOptional', { header: '\u0000' })
              )
                .split('\u0000')
                .flatMap((part, i) =>
                  // The header name is code, not prose: it is spliced back in as
                  // an element so the sentence around it stays translatable.
                  i === 0
                    ? [part]
                    : [<code key={i}>Authorization: Bearer</code>, part],
                )}
            </span>
          </label>
        )}

        {(preset.needsBaseUrl || settings.baseUrl) && (
          <label className="field">
            <span>{t('ext.provider.baseUrl')}</span>
            <input
              type="url"
              value={settings.baseUrl}
              placeholder={preset.baseUrl || 'https://your-endpoint/v1'}
              onChange={(e) => set({ baseUrl: e.target.value })}
            />
            {settings.provider === 'azure' && (
              <span className="hint">{t('ext.provider.azureHint')}</span>
            )}
          </label>
        )}

        {settings.provider !== 'builtin' && (
          <label className="field">
            <span>{t('ext.provider.model')}</span>
            <div className="field-row">
              <input
                type="text"
                list="model-options"
                value={settings.model}
                placeholder={preset.model || t('ext.provider.modelPlaceholder')}
                onChange={(e) => set({ model: e.target.value })}
              />
              <button onClick={refreshModels} disabled={loadingModels}>
                {loadingModels ? t('ext.provider.loadingModels') : t('ext.provider.loadModels')}
              </button>
            </div>
            <datalist id="model-options">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <span className="hint">
              {modelsNote ||
                (models.length
                  ? t('ext.provider.modelsAvailable', { count: models.length })
                  : t('ext.provider.modelsPrompt'))}
            </span>
          </label>
        )}

        <label className="field">
          <span>{t('ext.provider.retention')}</span>
          <select
            value={settings.retentionDays}
            onChange={(e) => set({ retentionDays: Number(e.target.value) })}
          >
            {RETENTION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 0
                  ? t('ext.provider.retentionForever')
                  : t('ext.provider.retentionDays', { days: d })}
              </option>
            ))}
          </select>
          <span className="hint">
            {settings.retentionDays === 0
              ? t('ext.provider.retentionHintForever')
              : t('ext.provider.retentionHintDays', { days: settings.retentionDays })}
          </span>
        </label>
        </>
        )}

        {panel !== 'templates' && panel !== 'data' && (
          <div className="subbar">
            {panel === 'provider' && (
              <button onClick={test} disabled={testing}>
                {testing ? t('ext.settings.testing') : t('ext.settings.testConnection')}
              </button>
            )}
            <span className="spacer" />
            <button className="primary" onClick={save}>
              {t('ext.settings.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
