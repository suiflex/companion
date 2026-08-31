# Spike rig: native-messaging-installer (throwaway)

Preparatory execution for `docs/spike-native-messaging-installer.md` (D3).
Validates the Chrome Native Messaging protocol, manifest registration, extension-ID
allowlisting and operation_id dedupe on a real machine — so the 5-day spike can
spend its timebox purely on installers, signing and clean-VM runs.

## Layout

- `host/host.cjs` — native host: 4-byte LE length + JSON over stdio, dedupes by
  `operation_id` (state in `/tmp/meetcc-spike-host-state.json`), logs to
  `/tmp/meetcc-spike-host.log`.
- `host/run-host.sh` — wrapper referenced by the host manifest; node path is
  baked by the installer step (hardcoding it is a real-world failure mode, see findings).
- `extension/` — MV3 fixture (unpacked). `manifest.json` embeds a `key` so the
  extension ID is deterministic across loads (§36.2 pinned-ID scenario).
- `receiver.cjs` — local HTTP sink; the service worker POSTs its results there
  (SW console is not observable from the shell).
- `run.sh` — end-to-end runner: register manifest → start receiver → launch
  Chrome for Testing → collect report.

## Re-run

```sh
spikes/native-messaging-installer/run.sh
# then read /tmp/meetcc-spike-receiver.json and /tmp/meetcc-spike-host.log
```

## Verdict: VALIDATED (protocol layer — macOS dev machine + clean Linux container, not a full clean-VM matrix)

Linux leg: executed 2026-08-27T17:52Z in a fresh Debian 12 container
(`linux-run.sh`, Chromium 151) — same result set as macOS below, including
dedupe and the identical derived extension ID. Details and two rig-defect
lessons in `docs/spike-native-messaging-installer.md` ("Linux leg" section).
Windows leg and installer/signing remain [UNVERIFIED] — see the spike doc's
final go/no-go verdict (GO with conditions, 2026-08-27).

### What worked (dated evidence, 2026-08-27)

- Round-trip extension → host → extension: `{status:'ok', applied:true}`.
- Deliberate duplicate delivery with the same `operation_id`:
  `{status:'duplicate', applied:false}` — exactly the ADR-008 §14.3 contract.
- Chrome passes the caller origin as `argv[1]`
  (`chrome-extension://<id>/`) — host-side allowlist verification is possible.
- Wrong-origin host manifest → `Access to the specified native messaging host
  is forbidden.` and Chrome never launches the host (guard is in Chrome, not the host).
- Unregistered host name → `Specified native messaging host not found.`
  (observable degradation signal for the extension-queue fallback).

### What didn't / failure modes captured (all hit for real)

1. **Branded Chrome stable (151) silently ignores `--load-extension`** — no
   error, no registration, only internal component extensions present. Use
   Chrome for Testing / Chromium / Canary for fixture runs.
2. **Extension-ID formula**: ID = first 16 bytes of SHA-256 over the DER
   public key, each nibble mapped `0..f → a..p` (32 chars). An incorrect
   formula produces a plausible-looking wrong ID — the mismatch is silent
   until the host manifest allowlists the wrong origin (`forbidden`).
3. **Repo `"type": "module"` breaks CommonJS `.js` hosts** — a real installer
   must ship a bundled executable, not bare CommonJS source files.
4. **macOS TCC: a host binary under `~/Documents` is blocked from executing
   by Chrome** (`/bin/sh: ... Operation not permitted`, surfaced only in
   Chrome's stderr). The installed host must live in `/Applications` or
   `~/Library` — a user-writable Downloads/Documents install location is a
   dead end on macOS.

### Recommendation for the real build

- Ship the host as a bundled, self-contained binary inside the Tauri .app
  (macOS) — never bare scripts, never user-writable locations.
- The installer's last step must verify: manifest present, `path` exists and
  is executable, allowlisted origin equals the shipped extension ID.
- The extension must treat `not found` / `forbidden` as distinct signals
  (`not found` → not installed; `forbidden` → version/ID mismatch).
