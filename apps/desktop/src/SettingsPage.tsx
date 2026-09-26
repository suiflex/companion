import { useState, type KeyboardEvent } from 'react'
import { t, LANGS, type LangPref, type MessageKey } from '@meetcc/shared/i18n'
import { Button, SegmentedControl } from '@meetcc/ui'
import { AIProviderPanel } from './AIProviderPanel'
import { InstallView } from './InstallView'
import { VersionPanel } from './VersionPanel'
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
  autosave: boolean
  onAutosaveChange: (on: boolean) => void
}

// Keys, not labels: resolved at render so a language switch relabels the nav.
const SECTIONS = {
  general: 'desktop.settings.section.general',
  editor: 'desktop.settings.section.editor',
  vault: 'desktop.settings.section.vault',
  browsers: 'desktop.settings.section.browsers',
  ai: 'desktop.settings.section.ai',
  version: 'desktop.settings.section.version',
} satisfies Record<string, MessageKey>

type Section = keyof typeof SECTIONS
const ORDER = Object.keys(SECTIONS) as Section[]

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
  autosave,
  onAutosaveChange,
}: SettingsPageProps) {
  const [section, setSection] = useState<Section>('general')

  // Arrow keys move between sections, the way a vertical tab list reads.
  const onNavKey = (e: KeyboardEvent<HTMLElement>): void => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = ORDER[(ORDER.indexOf(section) + step + ORDER.length) % ORDER.length]
    setSection(next)
    document.getElementById(`settings-tab-${next}`)?.focus()
  }

  return (
    <div className="settings-layout">
      <nav
        className="settings-nav"
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('desktop.settings.title')}
        onKeyDown={onNavKey}
      >
        {ORDER.map((key) => (
          <button
            key={key}
            id={`settings-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={section === key}
            aria-controls="settings-panel"
            tabIndex={section === key ? 0 : -1}
            className={section === key ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setSection(key)}
          >
            {t(SECTIONS[key])}
          </button>
        ))}
      </nav>

      <div
        className="settings"
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${section}`}
      >
        <h1>{t(SECTIONS[section])}</h1>

        {section === 'general' && (
          <>
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
          </>
        )}

        {section === 'editor' && (
          <section className="setting-row">
            <div>
              <h2>{t('desktop.settings.autosave')}</h2>
              <p className="hint">{t('desktop.settings.autosaveHint')}</p>
            </div>
            <SegmentedControl
              role="group"
              ariaLabel={t('desktop.settings.autosave')}
              options={[
                { value: 'on', label: t('pref.on') },
                { value: 'off', label: t('pref.off') },
              ]}
              value={autosave ? 'on' : 'off'}
              onChange={(value) => onAutosaveChange(value === 'on')}
            />
          </section>
        )}

        {section === 'vault' && (
          <>
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
                <h2>{t('desktop.settings.index')}</h2>
                <p className="hint">{t('desktop.settings.indexHint')}</p>
              </div>
            </section>
          </>
        )}

        {section === 'browsers' && (
          <>
            <section className="setting-row">
              <div>
                <h2>{t('desktop.settings.bridge')}</h2>
                <p className="hint">{t('desktop.settings.bridgeHint')}</p>
              </div>
            </section>
            <InstallView />
          </>
        )}

        {section === 'ai' && <AIProviderPanel />}

        {section === 'version' && <VersionPanel />}
      </div>
    </div>
  )
}
