import { t, type LangPref } from '@meetcc/shared/i18n'
import type { ThemePref } from './theme'

export const themeLabel = (pref: ThemePref): string =>
  pref === 'system' ? t('pref.system') : pref === 'light' ? t('pref.light') : t('pref.dark')

export const langLabel = (pref: LangPref): string =>
  pref === 'system' ? t('pref.system') : pref === 'en' ? t('lang.en') : t('lang.id')
