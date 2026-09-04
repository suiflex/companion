// Copying text, in a window where the async Clipboard API may not be available.
//
// `navigator.clipboard` needs a secure context and a permission the embedded
// WebView does not always grant, and when it is missing the optional chain
// simply resolves to nothing — a copy that silently did not happen. The
// fallback is the old `execCommand` path: deprecated, but it needs no
// permission and works wherever a selection does.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* denied or unavailable — fall through to the selection path */
  }
  return copyBySelection(text)
}

function copyBySelection(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  // Off-screen rather than hidden: `display:none` and `visibility:hidden`
  // cannot be selected, and the whole trick depends on a live selection.
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  document.body.append(area)
  try {
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
