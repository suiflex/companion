import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { LangPref } from '@meetcc/shared/i18n'
import { useToast } from '@meetcc/ui'
import { SettingsPage } from './SettingsPage'
import {
  SETTINGS_ACTION_EVENT,
  SETTINGS_PREFERENCES_EVENT,
  SETTINGS_VAULT_CHANGED_EVENT,
  type SettingsAction,
  type SettingsPreferences,
} from './settingsEvents'
import { loadLangPref } from './lang'
import { loadThemePref, type ThemePref } from './theme'
import { useDesktopPreferences } from './useDesktopPreferences'

export function SettingsWindow() {
  const toast = useToast()
  const [root, setRoot] = useState<string | null>(null)
  const [defaultRoot, setDefaultRoot] = useState<string | null>(null)
  const [noteCount, setNoteCount] = useState(0)
  const [themePref, setThemePref] = useState<ThemePref>(loadThemePref)
  const [langPref, setLangPref] = useState<LangPref>(loadLangPref)
  useDesktopPreferences(themePref, langPref)

  const reloadVault = useCallback(async () => {
    const [path, markdown, defaultPath] = await Promise.all([
      invoke<string>('vault_root'),
      invoke<string[]>('list_vault'),
      invoke<string>('default_vault_root'),
    ])
    setRoot(path)
    setNoteCount(markdown.length)
    setDefaultRoot(defaultPath)
  }, [])

  useEffect(() => {
    const refresh = () => void reloadVault().catch((error) => toast('error', String(error)))
    refresh()
    window.addEventListener('focus', refresh)
    let alive = true
    let stop: UnlistenFn | undefined
    void listen(SETTINGS_VAULT_CHANGED_EVENT, refresh)
      .then((unlisten) => {
        if (alive) stop = unlisten
        else unlisten()
      })
      .catch((error) => toast('error', String(error)))
    return () => {
      window.removeEventListener('focus', refresh)
      alive = false
      stop?.()
    }
  }, [reloadVault, toast])

  useEffect(() => {
    let alive = true
    let stop: UnlistenFn | undefined
    void listen<SettingsPreferences>(SETTINGS_PREFERENCES_EVENT, ({ payload }) => {
      if (payload.themePref) setThemePref(payload.themePref)
      if (payload.langPref) setLangPref(payload.langPref)
    })
      .then((unlisten) => {
        if (alive) stop = unlisten
        else unlisten()
      })
      .catch((error) => toast('error', String(error)))
    return () => {
      alive = false
      stop?.()
    }
  }, [toast])

  const sendPreferences = (preferences: SettingsPreferences): void => {
    void emitTo('main', SETTINGS_PREFERENCES_EVENT, preferences).catch((error) => {
      toast('error', String(error))
    })
  }

  const sendAction = (action: SettingsAction): void => {
    void emitTo('main', SETTINGS_ACTION_EVENT, action).catch((error) => {
      toast('error', String(error))
    })
  }

  return (
    <main className="settings-window">
      <SettingsPage
        root={root ?? '…'}
        noteCount={noteCount}
        onMove={() => sendAction('move-vault')}
        onReset={() => sendAction('reset-vault')}
        isDefaultRoot={!defaultRoot || root === defaultRoot}
        themePref={themePref}
        onThemeChange={(pref) => {
          setThemePref(pref)
          sendPreferences({ themePref: pref })
        }}
        langPref={langPref}
        onLangChange={(pref) => {
          setLangPref(pref)
          sendPreferences({ langPref: pref })
        }}
      />
    </main>
  )
}
