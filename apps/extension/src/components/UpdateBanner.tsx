import { useCallback, useEffect, useState } from 'react';
import {
  UPDATE_DISMISSED_KEY,
  UPDATE_KEY,
  updateAvailable,
  watchStorage,
  type UpdateState,
} from '@meetcc/shared';
import { useToast } from '../toast';

const COMMAND = 'companion update';

/**
 * Tells the user a newer release exists. Chromium never auto-updates an
 * extension loaded unpacked, so without this the only way to find out is to
 * go looking — which is how people ended up reinstalling from scratch and
 * losing the meetings that lived under the old install path.
 *
 * The background service worker does the checking (see background.ts); this
 * only reads what it wrote.
 */
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>();
  const [dismissed, setDismissed] = useState<string>();
  const toast = useToast();
  const current = chrome.runtime.getManifest().version;

  const load = useCallback(async () => {
    const stored = await chrome.storage.local.get([UPDATE_KEY, UPDATE_DISMISSED_KEY]);
    setState(stored[UPDATE_KEY] as UpdateState | undefined);
    setDismissed(stored[UPDATE_DISMISSED_KEY] as string | undefined);
  }, []);

  useEffect(() => {
    void load();
    return watchStorage(() => void load(), [UPDATE_KEY, UPDATE_DISMISSED_KEY]);
  }, [load]);

  if (!updateAvailable(current, state, dismissed)) return null;

  return (
    <div className="update-banner">
      <span className="update-pill">v{state?.latest}</span>
      <span className="update-text">
        Versi baru tersedia. Jalankan <code>{COMMAND}</code> di terminal, lalu restart
        browser Companion.
      </span>
      <button
        className="update-copy"
        onClick={async () => {
          await navigator.clipboard.writeText(COMMAND);
          toast('success', 'Perintah update disalin.');
        }}
      >
        Salin perintah
      </button>
      <a className="update-link" href={state?.url} target="_blank" rel="noreferrer">
        Catatan rilis
      </a>
      <button
        className="update-dismiss"
        aria-label="Tutup pemberitahuan update"
        title="Sembunyikan sampai rilis berikutnya"
        onClick={() => {
          // Per version, so the next release speaks up again.
          void chrome.storage.local.set({ [UPDATE_DISMISSED_KEY]: state?.latest });
        }}
      >
        ×
      </button>
    </div>
  );
}
