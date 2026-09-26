import { t, LANGS, type LangPref } from '@meetcc/shared/i18n'
import { Button, SegmentedControl } from '@meetcc/ui'
import { AIProviderPanel } from './AIProviderPanel'
import { InstallView } from './InstallView'
import { langLabel, themeLabel } from './preferenceLabels'
import type { ThemePref } from './theme'

export interface SettingsPageProps {
  root: string
  noteCount: number
  onMove: () => void
  onReset: () => void
  isDefaultRoot: boolean
  themePref: ThemePref
  onThemeChange: (pref: ThemePref) => void
  langPref: LangPref
  onLangChange: (pref: LangPref) => void
}

export function SettingsPage({
  root,
  noteCount,
  onMove,
  onReset,
  isDefaultRoot,
  themePref,
  onThemeChange,
  langPref,
  onLangChange,
}: SettingsPageProps) {
  return (
    <div className="settings">
      <h1>{t('desktop.settings.title')}</h1>
      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.language')}</h2>
          <p className="hint">{t('desktop.settings.languageHint')}</p>
        </div>
        <SegmentedControl
          role="group"
          ariaLabel={t('desktop.settings.language')}
          options={(['system', ...LANGS] as LangPref[]).map((pref) => ({
            value: pref,
            label: langLabel(pref),
          }))}
          value={langPref}
          onChange={(value) => onLangChange(value as LangPref)}
        />
      </section>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.theme')}</h2>
          <p className="hint">{t('desktop.settings.themeHint')}</p>
        </div>
        <SegmentedControl
          role="group"
          ariaLabel={t('desktop.settings.theme')}
          options={(['system', 'light', 'dark'] as ThemePref[]).map((pref) => ({
            value: pref,
            label: themeLabel(pref),
          }))}
          value={themePref}
          onChange={(value) => onThemeChange(value as ThemePref)}
        />
      </section>
      <h2 className="settings-section-title">{t('desktop.settings.vaultBridge')}</h2>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.vaultLocation')}</h2>
          <p className="setting-path">{root}</p>
          <p className="hint">{t('desktop.settings.vaultHint', { count: noteCount })}</p>
        </div>
        <div className="setting-actions">
          <Button type="button" onClick={onMove}>
            {t('desktop.settings.moveVault')}
          </Button>
          {!isDefaultRoot && (
            <Button type="button" onClick={onReset}>
              {t('desktop.settings.resetVault')}
            </Button>
          )}
        </div>
      </section>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.bridge')}</h2>
          <p className="hint">{t('desktop.settings.bridgeHint')}</p>
        </div>
      </section>

      <InstallView />

      <section className="setting-row">
        <div>
          <h2>{t('desktop.settings.index')}</h2>
          <p className="hint">{t('desktop.settings.indexHint')}</p>
        </div>
      </section>

      <AIProviderPanel />
    </div>
  )
}
