// Language preference for the desktop app.
//
// Mirrors `theme.ts` deliberately, for the same reason stated there: the two
// apps share no runtime, so each owns its own persistence. The resolution and
// the catalogues themselves are shared — only the storage differs.
import { asLangPref, resolveLang, setLang, type Lang, type LangPref } from '@meetcc/shared/i18n'

export type { Lang, LangPref }

const KEY = 'companion:lang'

/** The stored preference. Storage can be unavailable; that is not an error. */
export function loadLangPref(): LangPref {
  try {
    return asLangPref(localStorage.getItem(KEY))
  } catch {
    /* private mode, or storage disabled — fall through to the default */
    return 'system'
  }
}

export function saveLangPref(pref: LangPref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* the choice still applies for this session */
  }
}

/** Resolve, apply, and tell the document so `lang=` matches what is rendered. */
export function applyLang(pref: LangPref): Lang {
  const lang = resolveLang(pref, navigator.languages ?? [navigator.language])
  setLang(lang)
  document.documentElement.lang = lang
  return lang
}
