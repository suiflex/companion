// Whether the editor saves on its own. On by default, the way Notes on macOS
// behaves; a per-install preference kept beside the theme and language ones.
const KEY = 'companion:autosave'

export function loadAutosave(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    /* private mode — fall back to the default */
    return true
  }
}

export function saveAutosave(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* still applies for this session */
  }
}
