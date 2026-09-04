// Copying text, in a window where the async Clipboard API may not be available.
//
// `navigator.clipboard` needs a secure context and a permission the embedded
// WebView does not always grant, and when it is missing the optional chain
// simply resolves to nothing — a copy that silently did not happen. The
// fallback is the old `execCommand` path: deprecated, but it needs no
// permission and works wherever a selection does.
// The selection path goes first, and not for style: in this WebView
// `writeText` can neither resolve nor reject — the permission prompt it is
// waiting on is never shown — so awaiting it first means the copy silently
// never finishes and nothing is ever reported. `execCommand` is synchronous
// and cannot hang, so it decides the outcome and the async API is only the
// fallback.
export async function copyText(text: string): Promise<boolean> {
  if (copyBySelection(text)) return true
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* denied or unavailable — nothing left to try */
  }
  return false
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
