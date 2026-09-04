// The desktop's AI provider settings.
//
// The same providers as the extension, from the same adapters — `packages/ai`
// is `fetch`-only and carries no `chrome.*`, so all of it is portable. What is
// not portable is the storage underneath, which is why `aiSettings.ts` exists.
//
// Sign-in providers (ChatGPT, Google) are offered but not wired here: the flow
// needs a browser round trip and a paste-back field, and shipping half of it
// would be worse than saying so.
import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { PROVIDER_PRESETS, createClient, listModels, resolveConfig, validateSettings } from '@meetcc/ai'
import { switchProvider } from '@meetcc/shared/provider'
import type { ProviderId, Settings } from '@meetcc/shared/types'
import { t } from '@meetcc/shared/i18n'
import { Select } from './Select'
import { loadAiSettings, saveAiSettings } from './aiSettings'
import { useToast } from './toast'

const PROVIDERS = Object.entries(PROVIDER_PRESETS) as [ProviderId, (typeof PROVIDER_PRESETS)[ProviderId]][]

export function AIProviderPanel() {
  const toast = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState<'' | 'models' | 'test' | 'save'>('')

  useEffect(() => {
    void loadAiSettings().then(setSettings)
  }, [])

  const preset = useMemo(
    () => (settings ? PROVIDER_PRESETS[settings.provider] : null),
    [settings],
  )

  if (!settings || !preset) return <p className="hint">{t('desktop.ai.loading')}</p>

  const set = (patch: Partial<Settings>): void => setSettings({ ...settings, ...patch })

  const save = async (): Promise<void> => {
    const problem = validateSettings(settings)
    if (problem) return toast('error', problem)
    setBusy('save')
    try {
      await saveAiSettings(settings)
      toast('success', t('desktop.ai.saved'))
    } catch (e) {
      toast('error', String(e))
    } finally {
      setBusy('')
    }
  }

  const test = async (): Promise<void> => {
    setBusy('test')
    try {
      // The real client against the real endpoint: anything less proves the
      // form is filled in, not that the provider answers.
      const client = createClient(resolveConfig(settings))
      const out = await client.complete({
        // Not translated: this is sent to a model, not shown to anyone.
        system: 'You are a terse assistant.',
        user: 'Reply with one word: OK',
      })
      toast('success', t('desktop.ai.reachableWith', { reply: out.slice(0, 40) }))
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const loadModelList = async (): Promise<void> => {
    setBusy('models')
    try {
      setModels(await listModels(resolveConfig(settings)))
    } catch (e) {
      // A provider that publishes no catalogue is normal, not broken — the
      // preset's hand-kept list stands in and the field stays free text.
      setModels(preset.models ?? [])
      toast('info', (e as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <section className="setting-row">
        <div>
          <h2>{t('desktop.ai.title')}</h2>
          <p className="hint">{t('desktop.ai.intro')}</p>
        </div>
        <Select
          label={t('desktop.ai.provider')}
          value={settings.provider}
          options={PROVIDERS.map(([id, p]) => ({ value: id, label: p.label }))}
          onChange={(v) => setSettings(switchProvider(settings, v as ProviderId))}
        />
      </section>

      {preset.needsSignIn && (
        <section className="setting-row">
          <div>
            <h2>{t('desktop.ai.signIn')}</h2>
            {/* Said plainly rather than shipped half-done: the flow opens a
                browser and needs the redirect pasted back, and that belongs in
                one piece of work with its own testing. */}
            <p className="hint">{t('desktop.ai.signInUnavailable')}</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => void invoke('open_external', { url: 'https://github.com/suiflex/companion' })}
          >
            {t('desktop.ai.readMore')}
          </button>
        </section>
      )}

      {settings.provider !== 'builtin' && !preset.needsSignIn && (
        <section className="setting-row">
          <div>
            <h2>{preset.needsKey ? t('desktop.ai.apiKey') : t('desktop.ai.apiKeyOptional')}</h2>
            <p className="hint">{t('desktop.ai.keychainHint')}</p>
          </div>
          <input
            className="text-input"
            type="password"
            autoComplete="off"
            value={settings.apiKey}
            placeholder={preset.needsKey ? 'sk-…' : ''}
            onChange={(e) => set({ apiKey: e.target.value })}
          />
        </section>
      )}

      {(preset.needsBaseUrl || settings.baseUrl) && (
        <section className="setting-row">
          <div>
            <h2>{t('desktop.ai.baseUrl')}</h2>
            <p className="hint">{preset.baseUrl || 'https://your-endpoint/v1'}</p>
          </div>
          <input
            className="text-input"
            type="url"
            value={settings.baseUrl}
            placeholder={preset.baseUrl}
            onChange={(e) => set({ baseUrl: e.target.value })}
          />
        </section>
      )}

      {settings.provider !== 'builtin' && (
        <section className="setting-row">
          <div>
            <h2>{t('desktop.ai.model')}</h2>
            <p className="hint">
              {models.length
                ? t('desktop.ai.modelsAvailable', { count: models.length })
                : t('desktop.ai.modelsPrompt')}
            </p>
          </div>
          <div className="setting-actions">
            <input
              className="text-input"
              list="desktop-model-options"
              value={settings.model}
              placeholder={preset.model}
              onChange={(e) => set({ model: e.target.value })}
            />
            <datalist id="desktop-model-options">
              {(models.length ? models : (preset.models ?? [])).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <button type="button" className="btn" disabled={busy !== ''} onClick={() => void loadModelList()}>
              {busy === 'models' ? t('desktop.ai.loadingModels') : t('desktop.ai.loadModels')}
            </button>
          </div>
        </section>
      )}

      <section className="setting-row">
        <div>
          <h2>{t('desktop.ai.check')}</h2>
          <p className="hint">{t('desktop.ai.checkHint')}</p>
        </div>
        <div className="setting-actions">
          <button type="button" className="btn" disabled={busy !== ''} onClick={() => void test()}>
            {busy === 'test' ? t('desktop.ai.testing') : t('desktop.ai.test')}
          </button>
          <button type="button" className="btn primary" disabled={busy !== ''} onClick={() => void save()}>
            {t('desktop.ai.save')}
          </button>
        </div>
      </section>
    </>
  )
}
