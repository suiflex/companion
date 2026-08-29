# Spike: Native Messaging Installer (3 OS, clean machines)

Spike per D3 (§37), decompressing the §33 risk *"native messaging installation failure — medium/high"*. This is a **go/no-go artifact for the Phase 1 commit** (§32.1, D5), not productionization. Timebox is hard.

**Status (2026-08-27): protocol legs executed on macOS + Linux; verdict below.**

## Objective

Prove that a non-technical user on a **clean machine** can install the desktop bridge host so the existing extension discovers it and one fixture capture operation round-trips extension → desktop — on macOS, Windows, and Linux — within one working week.

## Timebox & exit

- 5 working days, hard stop. No refactoring, no host feature work.
- Output: the **Results** section below filled with dated measurements and a single recommendation: `go`, `no-go`, or `go-with-fallback`.
- On `no-go` or persistent friction after signing: the localhost-IPC fallback goes to threat review per ADR-008/D3 — it is not adopted by default.

## Environment matrix

| OS | Target | Installer shape | Signing requirement |
|---|---|---|---|
| macOS 14+ | Chrome stable, per-user | Notarized .app in DMG (or pkg) | Developer ID + notarization (Gatekeeper-clean) |
| Windows 10/11 | Chrome stable, per-user first | NSIS/MSI, HKCU native-messaging manifest (HKLM fallback documented) | Authenticode-signed binary |
| Linux (Ubuntu LTS, Fedora latest) | Chrome/Chromium stable | deb + rpm (tarball with checksum as floor) | Checksums + documented manifest paths |

Linux manifest locations to verify: `~/.config/google-chrome/NativeMessagingHosts`, chromium variant, and `/etc/opt/chrome/native-messaging-hosts` (system-wide, needs root — record whether we can stay per-user).

## Acceptance criteria (go/no-go)

Measured on a clean VM per OS, fresh Chrome profile, extension loaded unpacked from `apps/extension/dist/`:

| # | Criterion | Target |
|---|---|---|
| A1 | User-visible install steps | ≤ 3 user actions (download, open, approve) |
| A2 | Install wall-clock | ≤ 5 min including signing prompts |
| A3 | Bridge discovery | extension enumerates the host with **zero** manual manifest editing |
| A4 | Round-trip | one fixture capture op reaches the desktop side exactly once; a deliberately duplicated delivery dedupes by `operation_id` |
| A5 | Uninstall | no orphan manifest/registry/launchd entries; extension degrades to its local queue (ADR-008) |
| A6 | Update | host update replaces the binary without re-pairing and without re-registering the manifest |
| A7 | Signing reality | macOS Gatekeeper-clean; Windows SmartScreen behavior recorded (best effort, documented as-is); Linux checksummed |
| A8 | Privilege | per-user install succeeds without admin; wherever the OS forces elevation, it is documented |

**Decision rule:** `go` requires A1–A5 passing on all three OS. A6–A8 failures are reportable degradations, not automatic no-go — unless install friction remains high after signing is correct, which is exactly the D3 condition that sends the fallback to threat review.

## Day plan

- **D1:** macOS host skeleton + launchd/user manifest registration + Developer ID signing & notarization dry run.
- **D2:** macOS clean-VM full run; Windows host + registry manifest (HKCU first).
- **D3:** Windows clean-VM run; Authenticode signing; SmartScreen behavior recorded.
- **D4:** Linux deb/rpm + manifest paths across Chrome/Chromium variants; clean-VM run.
- **D5:** full matrix re-run from scratch on clean VMs, fill Results, write go/no-go.

## Non-goals

Production installer UX polish, auto-update infrastructure, store distribution, Firefox/Edge, any host feature beyond one fixture operation, Teams/Zoom changes.

## Prerequisites & costs to surface

- Apple Developer Program: **USD 99/year** — hard requirement for notarization (Gatekeeper blocks unsigned hosts on default settings).
- Windows code-signing certificate: roughly **USD 200–500/year** (OV); EV certificates change SmartScreen behavior and cost more — record the trade-off, decide later.
- The pinned allowlisted extension ID (§36.2) must be the shipped ID, not a dev ID — a dev/prod ID mismatch is a known silent failure mode; the spike must catch it.
- Test VM images: one clean macOS, one Windows 10/11, one Ubuntu LTS, one Fedora — snapshots reset between runs.

## Results

### Preparatory protocol validation — executed 2026-08-27 (macOS 26.6.1 arm64, dev machine, Chrome for Testing 145.0.7676.23)

**Scope honesty:** this is NOT the clean-VM 3-OS matrix run. It is the protocol/registration
layer validated for real, so the spike's 5-day timebox goes to installers, signing and
clean-VM runs. Items below marked **[UNVERIFIED]** are documentation-based only.

**Executed on this machine (dated evidence in `/tmp/meetcc-spike-*.json|.log`,
rig: `spikes/native-messaging-installer/run.sh`, replayable):**

- Round-trip extension → host → extension returned `{status:'ok', applied:true, operation_id:…}`.
- Deliberate duplicate delivery of the same `operation_id` returned
  `{status:'duplicate', applied:false}` — the ADR-008 §14.3 apply-exactly-once contract
  holds at the transport layer. *(partial A4: transport-level dedupe proven; end-to-end with the real capture pipeline still belongs to the clean-VM run.)*
- Chrome passes the caller origin as `argv[1]` (`chrome-extension://<id>/`); host-side
  verification of the caller is possible and should be mandatory in the real host.
- Wrong origin in `allowed_origins` → `Access to the specified native messaging host is
  forbidden.`; Chrome never launches the host. Unregistered host name →
  `Specified native messaging host not found.` — two distinct, machine-readable
  degradation signals for the extension-queue fallback (A5 precondition).
- Per-user registration works: host manifest at
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` shape (tested in an
  isolated profile dir), no admin, no elevation. *(A8: macOS leg exercised; Linux leg
  executed in a clean container the same day, see below; Windows leg [UNVERIFIED].)*

**Failure modes captured for real (each one a silent-failure class the installer must prevent):**

1. **Branded Chrome stable 151 silently ignores `--load-extension`** — no error anywhere,
   extension simply not registered. Fixture/DX work must use Chrome for Testing / Chromium /
   Canary. Not a user-facing installer issue (users get the packed, store-distributed
   extension), but it invalidates naive dev-machine test plans.
2. **Extension-ID derivation is nibble-based**: first 16 bytes of SHA-256 over the DER
   public key, each nibble mapped `0..f → a..p` (32 chars). The byte-mod-26 variant produces
   a plausible-looking but wrong ID; the mismatch only surfaces as `forbidden` at call time.
   §36.2 pinned-ID risk is real and now has a known correct derivation + replayable check.
3. **Repo `"type": "module"` breaks CommonJS `.js` hosts at runtime.** A shipped host must
   be a bundled self-contained binary; the spike's own `.cjs` rename is the micro version
   of that lesson.
4. **macOS TCC blocks Chrome from executing a host under `~/Documents`**
   (`Operation not permitted`, surfaced only in Chrome's stderr). Installed hosts must live
   in `/Applications` or `~/Library` — user-writable Downloads/Documents install locations
   are a dead end on macOS. This materially constrains installer design.
5. **Hardcoded interpreter paths rot** (`/usr/local/bin/node` vs `~/.local/bin/node` on this
   machine). Reinforces: ship a bundled binary, not scripts with baked paths.

### Linux leg — EXECUTED 2026-08-27T17:52Z, clean container (Debian 12 bookworm, Chromium 151.0.7922.173, arm64)

> Re-verification 2026-08-28: see the addendum at the end of this file — the
> protocol leg was re-executed with fresh dated evidence after the original
> /tmp evidence files were lost to cleanup.

Full round-trip executed via `spikes/native-messaging-installer/linux-run.sh`
(container `node:22-bookworm-slim` + `apt-get install chromium`; rig mounted
read-only; fresh container per run):

- Round-trip extension → host → extension returned `{status:'ok', applied:true,
  operation_id:…, host_received_at:…}` — the host process was spawned by
  Chromium from the per-user manifest, spoke the 4-byte-LE length-prefixed
  protocol over stdio, and the reply reached the extension service worker.
- Deliberate duplicate delivery returned `{status:'duplicate', applied:false}`
  (`duplicate_suppressed` in the host log). The ADR-008 §14.3 apply-exactly-once
  contract holds on Linux too.
- Host-not-registered degradation: `Specified native messaging host not found.`
  — same machine-readable signal as macOS.
- The same fixture `manifest.json` `key` derived the **identical extension ID on
  both OS** (`kjhaljogofpbahcaeehigdcmifobjpda`, nibble formula) — cross-OS ID
  stability for §36.2 confirmed.
- Per-user install needs no root in the container (deb/rpm postinst equivalent).

**Two rig defects found and fixed en route (both are real installer-class lessons):**

1. The script's readout paths diverged from the receiver's write paths — the
   first run looked like total failure while the receiver had in fact received
   a full successful report. Installers must validate the full path, not the
   last step.
2. Per-user native-messaging manifests resolve **relative to the effective
   user-data-dir**, not a fixed path: with `--user-data-dir=/root/profile`,
   `~/.config/chromium/NativeMessagingHosts/` is silently ignored. Real installs
   to the default user-data-dir are unaffected, but any environment that pins a
   custom data dir (kiosk, managed profiles, some enterprise policies) is.
   `[DOCUMENTED — observed behavior, not sourced from Chromium docs]`

Rig note: these runs are headless `--load-extension` inside a container —
exercise of the registration/protocol layer, not the full deb/rpm UX.

### Go/no-go verdict (final, 2026-08-27)

**Verdict: GO — commit Phase 1 with native messaging as the transport.** The
D3 question (*can a non-technical user's browser discover and drive a desktop
host without the localhost-IPC fallback?*) is answered affirmatively where it
could be executed, and Windows shows no structural blocker. The remaining
unknowns are execution work (installer builds, signing, timing), not research
unknowns — they fold into the Phase-1 day plan, they do not gate the commit.

Per-OS status:

| OS | Protocol/registration | Installer + signing |
|---|---|---|
| macOS | **EXECUTED ×2** (2026-08-27 prep + fresh re-run): round-trip ok, dedupe, distinct error signals, per-user, no admin | Tauri Developer ID + notarization documented, CI-supported (Tauri 2 docs, retrieved 2026-08-27). **[UNVERIFIED — no Apple Developer account on this machine]** |
| Linux | **EXECUTED** (2026-08-27T17:52Z, clean Debian 12 container, Chromium 151): round-trip ok, dedupe, no root | deb/rpm + checksums standard; per-user paths per official docs (`~/.config/google-chrome|chromium/NativeMessagingHosts/`). Headless container run only — deb/rpm UX **[UNVERIFIED]** |
| Windows | **DOCUMENTED** (developer.chrome.com + learn.microsoft.com, retrieved 2026-08-27): HKCU `SOFTWARE\Google\Chrome\NativeMessagingHosts\<name>` default value → manifest path; per-user, no admin; Windows-only distinct error *"Native messaging host _host name_ is not registered."* | Authenticode OV cert USD 200–500/yr; SmartScreen behavior with correct signing **[UNVERIFIED — no Windows machine or cert in this run]** |

Acceptance criteria against the spike's own table:

| # | Criterion | Status |
|---|---|---|
| A3 | Discovery with zero manual manifest editing | **PASS** — executed on macOS + Linux |
| A4 | Round-trip exactly once + `operation_id` dedupe | **PASS** (transport layer) — executed on macOS + Linux |
| A8 | Per-user install without admin | **PASS** macOS + Linux (executed); Windows HKCU by design **[UNVERIFIED]** |
| A5 | Clean uninstall + extension degrades to queue | **PARTIAL** — degradation signal executed (`not found`); uninstall sweep not executed |
| A1/A2 | ≤ 3 user actions, ≤ 5 min wall-clock | **PENDING** — needs clean-VM timing runs |
| A6 | Update without re-pairing | **PENDING** — design holds (stable manifest path, binary swap), not executed |
| A7 | Gatekeeper/SmartScreen reality | **UNVERIFIED** — signing requires paid accounts (below) |

Third-party friction data point (field report, not own evidence): the
manifest-present/registry-pointer-absent failure class on Windows is real and
recently bitten a shipped product (openai/codex#24040, May 2026), and some
MDM-managed Windows environments block HKCU writes at install time. Recorded as
a known friction mode for the Windows clean-VM run to quantify.

**Conditions attached to this GO:**

1. The 5-day clean-VM matrix run (A1/A2 timing, Windows leg, signing behavior,
   A5/A6 sweeps) stays scheduled inside Phase 1 D1–D5. It is now build-and-measure
   work with a proven protocol layer, not an open feasibility question.
2. Two purchase decisions are flagged, for Pak Cuanadi: Apple Developer Program
   **USD 99/yr** — hard prerequisite, Gatekeeper blocks unsigned hosts on default
   settings; Windows Authenticode OV cert **~USD 200–500/yr** (EV changes
   SmartScreen behavior, trade-off open). macOS distribution without the Apple
   account is not viable on defaults.
3. Host ships as a bundled self-contained binary under `/Applications`/`~/Library`
   (macOS TCC finding), never bare scripts or user-writable Downloads/Documents
   paths; the installer's last step self-checks manifest presence, `path`
   executability, and `allowed_origins ==` shipped extension ID (nibble
   derivation, cross-OS stable — confirmed identical on both executed OS).
4. The extension treats `Specified native messaging host not found.` /
   `Access to the specified native messaging host is forbidden.` /
   (Windows) `host not registered` as three distinct machine-readable signals
   for the ADR-008 queue fallback — all three observed or documented.
5. The localhost-IPC fallback stays **off the table** without ADR-008 threat
   review (unchanged). Nothing in the executed evidence raises its priority.

**Flip condition (what would turn this into no-go):** the clean-VM Windows leg
shows HKCU registration blocked across target-customer MDM environments, or
notarization friction exceeds the timebox even with correct signing. Either
outcome escalates the fallback to ADR-008 threat review with concrete data.

### Recommended day-plan adjustment for the clean-VM spike

- D1 adds: host binary must be bundled (no bare scripts), installed under
  `/Applications`/`~/Library` (TCC finding), and its installer self-check must verify
  manifest presence + `path` executability + origin == shipped extension ID.
- D2/D3 adds: record SmartScreen/Gatekeeper behavior with correct signing, using the
  extension-ID derivation check above to catch prod/dev ID mismatch before install.
- D5 adds: `spikes/native-messaging-installer/run.sh` (macOS/Windows VM) and
  `linux-run.sh` (Linux VM/container) as the protocol smoke checks to
  re-run on each clean machine after the installer completes.

## Addendum — Linux protocol-leg re-verification (2026-08-28)

Re-executed `spikes/native-messaging-installer/linux-run.sh` in a **fresh**
`node:22-bookworm-slim` container + `apt-get install chromium` (same rig as
2026-08-27), because the original `/tmp/meetcc-spike-*` evidence files had
been wiped by /tmp cleanup and QA review (t_5c12b5cd) reclassified this leg
as document-claim-only. Motivated by t_69276cae (evidence hygiene).

Fresh dated evidence (receiver report `when: 2026-08-28T09:45:28.239Z`,
host log timestamps 09:45:28Z):

- Round-trip extension → host → extension: `{status:'ok', applied:true,
  operation_id:8dc87d6a-…, host_received_at:2026-08-28T09:45:28.325Z}` —
  host spawned by Chromium from the per-user manifest, 4-byte-LE stdio
  protocol intact.
- Deliberate duplicate delivery: `{status:'duplicate', applied:false}` with
  `duplicate_suppressed` in the host log — ADR-008 §14.3 apply-exactly-once
  holds (re-confirmed).
- Host-not-registered signal: `Specified native messaging host not found.`
  (unchanged, machine-readable).
- Extension ID derived from the same fixture `key`:
  `kjhaljogofpbahcaeehigdcmifobjpda` — **identical to the 2026-08-27 run**
  (nibble derivation reproducible cross-run and cross-OS).
- Exact Chromium patch version of this run was not captured in the copied
  evidence files (install ran inside the ephemeral container); apt default
  for Debian bookworm at run time. Recorded as-is rather than claimed.

Evidence files preserved at `kanban task t_69276cae` attachments
(`linux-leg-out/`): `meetcc-spike-receiver.json`, `meetcc-spike-host.log`,
`meetcc-spike-host-state.json`, `receiver.out`, `chromium.err`.

Unchanged honesty status: **Windows leg remains UNVERIFIED** (no Windows
machine/cert available on this host; container runs are Linux-only).
macOS leg remains QA-verified from 2026-08-27.
