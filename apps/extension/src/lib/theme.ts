// Theme preference and the effective theme it resolves to.
//
// Three preferences, not two: `system` is the default, so a fresh profile
// matches the browser the user already set up rather than forcing dark on
// them. `light` and `dark` pin it regardless of the OS.
//
// Only the *resolved* value is written to the DOM — styles.css matches
// `body[data-theme='light']` and nothing else, so it never has to know a
// preference existed. The desktop app keeps its own copy of this
// (`apps/desktop/src/theme.ts`): same three states, but it persists through
// localStorage rather than chrome.storage, and the two apps share no runtime.

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const media = (): MediaQueryList | null =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

/** What the browser is asking for. Dark when it cannot be determined. */
export function systemTheme(): Theme {
  return media()?.matches ? 'light' : 'dark';
}

export function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

/**
 * Follow the OS while the preference is `system`.
 *
 * Returns an unsubscribe. Without this the dashboard would only pick up a
 * system switch when it is next opened.
 */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  const m = media();
  if (!m) return () => {};
  const handler = (): void => onChange(m.matches ? 'light' : 'dark');
  m.addEventListener('change', handler);
  return () => m.removeEventListener('change', handler);
}
