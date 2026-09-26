import { useEffect, useState } from 'react'
import { onLangChange, type LangPref } from '@meetcc/shared/i18n'
import { applyLang, saveLangPref } from './lang'
import { applyTheme, saveThemePref, watchSystemTheme, type ThemePref } from './theme'

/** Each window follows the same persisted preferences and OS theme changes. */
export function useDesktopPreferences(themePref: ThemePref, langPref: LangPref): void {
  const [, setLanguageVersion] = useState(0)
  useEffect(() => onLangChange(() => setLanguageVersion((version) => version + 1)), [])

  useEffect(() => {
    applyLang(langPref)
    saveLangPref(langPref)
  }, [langPref])

  useEffect(() => {
    applyTheme(themePref)
    saveThemePref(themePref)
    if (themePref !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [themePref])
}
