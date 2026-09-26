import type { LangPref } from '@meetcc/shared/i18n'
import type { ThemePref } from './theme'

export const SETTINGS_ACTION_EVENT = 'companion-settings-action'
export const SETTINGS_PREFERENCES_EVENT = 'companion-settings-preferences'
export const SETTINGS_VAULT_CHANGED_EVENT = 'companion-settings-vault-changed'

export type SettingsAction = 'move-vault' | 'reset-vault'

export interface SettingsPreferences {
  themePref?: ThemePref
  langPref?: LangPref
}
