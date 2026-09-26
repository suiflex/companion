// Registering the browser bridge without a terminal.
//
// `companion install` already does this, which is exactly the problem: it is a
// command, and the person who needs the bridge most is the one who will not
// run one. This registers the app's own binary as the native-messaging host,
// so there is no Node and no separate host script to have installed first.
//
// What it does not do is install the extension. That means downloading a
// release, unzipping it and launching a browser in a dedicated profile — and a
// browser someone is signed into is not ours to restart. The extension is a
// link and two sentences instead.
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t } from '@meetcc/shared/i18n'
import { Button, useToast } from '@meetcc/ui'
import chromeBadge from '../../../assets/badges/chrome-web-store.svg'
import firefoxBadge from '../../../assets/badges/firefox-addon.svg'

interface Browser {
  name: string
  manifestDir: string
  registered: boolean
}

/** Rust sends snake_case; the rest of this app does not speak it. */
interface RawBrowser {
  name: string
  manifest_dir: string
  registered: boolean
}

// The same listings the extension's own Version panel links to.
const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/meet-companion/neeapigpheabagekbdfjdekgdicfckpn'
const FIREFOX_ADDON_URL = 'https://addons.mozilla.org/en-US/firefox/addon/meet-companion/'
const EXTENSION_ZIP_URL =
  'https://github.com/suiflex/companion/releases/latest/download/meetcc-extension.zip'

/** Links leave through Rust: an anchor would navigate the WebView itself. */
const openExternal = (url: string): void => void invoke('open_external', { url })

export function InstallView() {
  const toast = useToast()
  const [browsers, setBrowsers] = useState<Browser[] | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async (): Promise<void> => {
    const raw = await invoke<RawBrowser[]>('list_browsers').catch(() => [] as RawBrowser[])
    setBrowsers(raw.map((b) => ({ name: b.name, manifestDir: b.manifest_dir, registered: b.registered })))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (b: Browser): Promise<void> => {
    setBusy(b.name)
    try {
      await invoke(b.registered ? 'unregister_bridge' : 'register_bridge', { browser: b.name })
      await load()
      toast('success', b.registered ? t('desktop.install.removed', { browser: b.name })
                                    : t('desktop.install.registered', { browser: b.name }))
    } catch (e) {
      toast('error', String(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="install-settings-section">
      <h2>{t('desktop.install.title')}</h2>
      <p className="hint">{t('desktop.install.intro')}</p>

      {browsers === null && <p className="hint">{t('desktop.install.looking')}</p>}
      {browsers?.length === 0 && <p className="hint">{t('desktop.install.noBrowsers')}</p>}

      {browsers?.map((b) => (
        <section className="setting-row" key={b.name}>
          <div>
            <h2>{b.name}</h2>
            <p className="hint">
              {b.registered ? t('desktop.install.isRegistered') : t('desktop.install.notRegistered')}
            </p>
          </div>
          <Button
            type="button"
            variant={b.registered ? 'default' : 'primary'}
            disabled={busy !== ''}
            onClick={() => void toggle(b)}
          >
            {b.registered ? t('desktop.install.remove') : t('desktop.install.register')}
          </Button>
        </section>
      ))}

      <section className="setting-row">
        <div>
          <h2>{t('desktop.install.extension')}</h2>
          {/* Registration is only half the bridge, and the half that fails
              silently: with no extension there is nothing to connect. */}
          <p className="hint">{t('desktop.install.extensionHint')}</p>
        </div>
      </section>
      <div className="store-badges">
        <button type="button" className="store-badge" onClick={() => openExternal(CHROME_STORE_URL)}>
          <img src={chromeBadge} alt="Chrome Web Store" />
        </button>
        <button type="button" className="store-badge" onClick={() => openExternal(FIREFOX_ADDON_URL)}>
          <img src={firefoxBadge} alt="Firefox Browser Add-on" />
        </button>
        <Button type="button" onClick={() => openExternal(EXTENSION_ZIP_URL)}>
          {t('desktop.install.downloadZip')}
        </Button>
      </div>
    </section>
  )
}
