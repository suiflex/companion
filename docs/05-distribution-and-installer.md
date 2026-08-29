# Distribution and installer

Status: spike verdict **GO** for native messaging (2026-08-27). Evidence: [spike-native-messaging-installer.md](spike-native-messaging-installer.md); architecture context: [COMPANION_UNIFIED_ARCHITECTURE.md](COMPANION_UNIFIED_ARCHITECTURE.md) §32.1, §36, §37 D3/D5/D9, ADR-008.

## What ships

| Surface | Distribution | Gate |
|---|---|---|
| Extension | Chrome Web Store, packed, pinned shipped extension ID (§36.2) | ships now |
| Desktop bridge + vault | Tauri 2 per-OS installers, per-user, no admin | Phase 1, gated by §32.1 demand evidence (D5) |
| Sync server | self-host single binary, deploy-optional | Phase 3 |

## Native messaging path

Extension → desktop runs over native messaging only (ADR-008, §36.2): per-user manifest registration, allowlisted extension ID, stable `operation_id` batches acked exactly once — transport-level dedupe executed on macOS and Linux. On any bridge failure the extension queues locally and stays fully functional.

Constraints learned in the spike, now installer requirements:

- Host ships as a **bundled self-contained binary** — `type: module` repos break CommonJS hosts and hardcoded interpreter paths rot; bare scripts are a dead end.
- macOS TCC blocks Chrome from executing hosts under `~/Documents`/Downloads — install targets are `/Applications` or `~/Library` only.
- Installer's last step self-checks: manifest present, `path` executable, `allowed_origins` == shipped extension ID (nibble derivation, confirmed cross-OS stable; byte-mod-26 variants produce plausible but wrong IDs).
- Three machine-readable degradation signals feed the queue fallback: `Specified native messaging host not found.` (unregistered), `Access to the specified native messaging host is forbidden.` (origin mismatch), Windows `host not registered`.

## Per-OS installer status (spike, 2026-08-27)

| OS | Protocol/registration layer | Installer + signing layer |
|---|---|---|
| macOS | **VERIFIED** — executed twice on dev machine + isolated profile: round-trip, dedupe, per-user, no admin | Tauri Developer ID + notarization documented and CI-supported; **signing UNVERIFIED** — no Apple Developer account available |
| Linux | **VERIFIED** — clean Debian 12 container, Chromium 151: full round-trip, dedupe, no root | deb/rpm + checksums standard, per-user manifest paths per official docs; package UX UNVERIFIED (headless container run only) |
| Windows | **UNVERIFIED** — documented only (HKCU `SOFTWARE\Google\Chrome\NativeMessagingHosts\<name>`, per-user, no admin) | Authenticode OV; SmartScreen behavior with correct signing UNVERIFIED — no Windows machine or cert in the run |

**Windows flip condition:** the clean-VM run shows HKCU registration blocked across target-customer MDM environments (manifest-present/registry-absent failures are real — cf. openai/codex#24040), or notarization/signing friction exceeds the timebox. Either outcome escalates the localhost-IPC fallback to ADR-008 threat review with concrete data; until then the fallback stays off the table.

## Signing cost — open decision (owner: Pak Cuanadi)

| Item | Cost | Status |
|---|---|---|
| Apple Developer Program (notarization) | USD 99/yr | hard prerequisite — Gatekeeper blocks unsigned hosts on default settings; macOS distribution is not viable without it |
| Windows Authenticode certificate | USD 200–500/yr (OV) | **open decision** — EV costs more and changes SmartScreen behavior; trade-off recorded, choice deferred |

## Phase 1 gate implications

- The GO removes native messaging as an open feasibility question (D3): remaining work is build-and-measure (installer builds, signing, clean-VM A1/A2/A5/A6 timing), folded into the Phase 1 day plan, not a gate.
- Phase 1 itself still starts only on §32.1 demand evidence (G1 or G3) — installer readiness is engineering readiness, not a launch reason (D5).
- If the gate fails after 6 weeks, Phase 1 shrinks to meeting-knowledge reader + light annotation, and the installer plan shrinks with it to that scope.
