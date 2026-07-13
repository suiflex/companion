// Self-healing dynamic import. The dashboard runs in a detached popup window
// that survives an extension reload as an ORPHANED page: its module graph
// still points at the previous build's hashed chunks, so `import()` of a
// heavy chunk (jsPDF, mermaid, docpdf) fails with "Failed to fetch
// dynamically imported module". Reloading the window once fetches the fresh
// index.html + current chunk hashes and fixes it. Guarded via sessionStorage
// so a genuinely-broken chunk can't loop.

const GUARD = 'mcc-chunk-reloaded'

export async function lazyImport<T>(load: () => Promise<T>): Promise<T> {
  try {
    const mod = await load()
    sessionStorage.removeItem(GUARD) // success -> allow a future self-heal
    return mod
  } catch (e) {
    const msg = (e as Error).message || ''
    const staleChunk = /dynamically imported module|Failed to fetch|Importing a module/i.test(msg)
    if (staleChunk && !sessionStorage.getItem(GUARD)) {
      sessionStorage.setItem(GUARD, '1')
      location.reload()
      return new Promise<T>(() => {}) // navigating away; never resolves
    }
    throw e
  }
}
