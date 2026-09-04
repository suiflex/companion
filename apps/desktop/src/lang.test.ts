import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLang, setLang } from '@meetcc/shared/i18n'

// A minimal DOM and storage, so this stays a fast node test rather than
// pulling in jsdom for four lines of behaviour.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  setLang('en')
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  vi.stubGlobal('navigator', { languages: ['en-GB'] })
  vi.stubGlobal('document', { documentElement: { lang: '' } })
})
afterEach(() => vi.unstubAllGlobals())

async function lang() {
  return await import('./lang')
}

describe('desktop language preference', () => {
  it('defaults to following the system when nothing is stored', async () => {
    expect((await lang()).loadLangPref()).toBe('system')
  })

  it('round-trips an explicit choice', async () => {
    const m = await lang()
    m.saveLangPref('id')
    expect(m.loadLangPref()).toBe('id')
  })

  it('ignores a stored value that is not a language', async () => {
    store.set('companion:lang', 'klingon')
    expect((await lang()).loadLangPref()).toBe('system')
  })

  it('applies the resolved language and stamps <html lang>', async () => {
    const m = await lang()
    expect(m.applyLang('id')).toBe('id')
    expect(getLang()).toBe('id')
    expect(document.documentElement.lang).toBe('id')
  })

  it('falls back to English when the system language is not one we have', async () => {
    vi.stubGlobal('navigator', { languages: ['ja-JP'] })
    expect((await lang()).applyLang('system')).toBe('en')
  })

  it('survives storage throwing rather than taking the app down', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const m = await lang()
    expect(m.loadLangPref()).toBe('system')
    expect(() => m.saveLangPref('id')).not.toThrow()
  })
})
