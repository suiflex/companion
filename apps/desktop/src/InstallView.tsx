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
import { useToast } from './toast'

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

const EXTENSION_URL = 'https://github.com/suiflex/companion/releases/latest'

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
    <div className="settings">
      <h1>{t('desktop.install.title')}</h1>
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
          <button
            type="button"
            className={b.registered ? 'btn' : 'btn primary'}
            disabled={busy !== ''}
            onClick={() => void toggle(b)}
          >
            {b.registered ? t('desktop.install.remove') : t('desktop.install.register')}
          </button>
        </section>
      ))}

      <section className="setting-row">
        <div>
          <h2>{t('desktop.install.extension')}</h2>
          {/* Registration is only half the bridge, and the half that fails
              silently: with no extension there is nothing to connect. */}
          <p className="hint">{t('desktop.install.extensionHint')}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void invoke('open_external', { url: EXTENSION_URL })}
        >
          {t('desktop.install.getExtension')}
        </button>
      </section>

      <section className="setting-row">
        <div>
          <h2>{t('desktop.install.firefox')}</h2>
          {/* Not automated, and not a gap to be filled later by this screen: a
              signed add-on cannot be side-loaded, so there is nothing to
              register until the listing exists. */}
          <p className="hint">{t('desktop.install.firefoxHint')}</p>
        </div>
      </section>
    </div>
  )
}
