// Language preference for the extension.
//
// Mirrors `theme.ts` beside it, and the desktop app's `lang.ts`, for the
// reason stated in both: the two apps share no runtime, so each owns its own
// persistence. Only the resolution and the catalogues are shared.
//
// Stored as a flat `chrome.storage.local` key rather than inside `Settings`,
// which is an encrypted blob loaded asynchronously — the language has to be
// known before the first paint, and it holds no secret.
import { asLangPref, resolveLang, setLang, type Lang, type LangPref } from '@meetcc/shared/i18n';

export type { Lang, LangPref };

export const LANG_KEY = 'lang';

export async function loadLangPref(): Promise<LangPref> {
  try {
    const { [LANG_KEY]: raw } = await chrome.storage.local.get(LANG_KEY);
    return asLangPref(raw);
  } catch {
    /* storage unavailable — the default still applies for this session */
    return 'system';
  }
}

export function saveLangPref(pref: LangPref): void {
  try {
    void chrome.storage.local.set({ [LANG_KEY]: pref });
  } catch {
    /* the choice still applies for this session */
  }
}

/** Resolve and apply. Also stamps `<html lang>` so the document is honest. */
export function applyLang(pref: LangPref): Lang {
  const langs = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  const lang = resolveLang(pref, langs);
  setLang(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  return lang;
}
