// Theme preference and the effective theme it resolves to.
//
// Three preferences, not two: `system` is the default, so a fresh install
// matches the desktop the user already set up rather than forcing dark on
// them. `light` and `dark` pin it regardless of the OS.
//
// Only the *resolved* value is ever written to the DOM — styles.css matches
// `body[data-theme='light']` and nothing else, so it never has to know a
// preference existed.

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'companion:theme'

const media = (): MediaQueryList | null =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

/** What the OS is asking for. Dark when it cannot be determined. */
export function systemTheme(): Theme {
  return media()?.matches ? 'light' : 'dark'
}

export function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref
}

/** The stored preference. Storage can be unavailable; that is not an error. */
export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* private mode, or storage disabled — fall through to the default */
  }
  return 'system'
}

export function saveThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* the theme still applies for this session */
  }
}

export function applyTheme(pref: ThemePref): Theme {
  const theme = resolveTheme(pref)
  document.body.dataset.theme = theme
  return theme
}

/**
 * Follow the OS while the preference is `system`.
 *
 * Returns an unsubscribe. Without this the app would only pick up a system
 * switch on restart, which is exactly when the user is watching for it.
 */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  const m = media()
  if (!m) return () => {}
  const handler = (): void => onChange(m.matches ? 'light' : 'dark')
  m.addEventListener('change', handler)
  return () => m.removeEventListener('change', handler)
}
