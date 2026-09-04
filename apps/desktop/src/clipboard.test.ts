// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

describe('copyText', () => {
  it('resolves without waiting on the async Clipboard API', async () => {
    // The bug this exists for: in the app's WebView `writeText` returned a
    // promise that never settled — the permission prompt behind it is never
    // shown — so awaiting it first meant the copy never finished and nothing
    // was ever reported to the user. A never-settling promise stands in for
    // it here; the test can only pass if it is not awaited.
    const writeText = vi.fn(() => new Promise<void>(() => {}))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    document.execCommand = vi.fn(() => true)

    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('falls back to the async API when the selection path fails', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    document.execCommand = vi.fn(() => false)

    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
    vi.unstubAllGlobals()
  })

  it('reports failure when neither path works', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => false)
    await expect(copyText('hello')).resolves.toBe(false)
    vi.unstubAllGlobals()
  })

  it('leaves no textarea behind', async () => {
    document.execCommand = vi.fn(() => true)
    await copyText('hello')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
