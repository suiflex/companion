import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { t } from "@meetcc/shared/i18n";

/** Tells you a newer build exists and installs it on request.
 *
 *  Checked once, at start. Being offline, or behind a proxy that eats the
 *  request, is the normal case for a local-first app — so a failed check is
 *  silent and the app carries on. Nothing here polls: the app is not a place
 *  people leave open for weeks, and the next launch checks again.
 *
 *  ponytail: no changelog rendering, no "skip this version", no settings
 *  toggle. Add them when someone asks, not before. */
export default function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void check()
      .then((u) => alive && u && setUpdate(u))
      .catch(() => {
        /* offline, or no manifest published yet — not worth a dialog */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!update) return null;

  async function install() {
    if (!update) return;
    setBusy(true);
    setFailed(false);
    try {
      // Downloaded and signature-checked in Rust against the pubkey baked into
      // the build; an unsigned or tampered bundle throws here rather than
      // installing.
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <div className="update-banner" role="status">
      <span>
        {failed
          ? "Gagal memasang pembaruan. Coba lagi, atau unduh manual dari halaman rilis."
          : t('desktop.update.available', { version: update.version })}
      </span>
      <button
        type="button"
        className="btn primary"
        onClick={() => void install()}
        disabled={busy}
      >
        {busy ? "Memasang…" : failed ? "Coba lagi" : "Restart & pasang"}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => setUpdate(null)}
        disabled={busy}
      >
        Nanti
      </button>
    </div>
  );
}
