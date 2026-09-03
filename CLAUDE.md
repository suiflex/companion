# Meet Companion

Two products in one repository: an MV3 browser extension that captures meeting
captions from the DOM and turns them into AI notes, and a Tauri 2 desktop app
that owns a local Markdown vault. A native-messaging host joins them.

Architecture and features live in `README.md`, setup and build steps in
`INSTALL.md` — this file only carries what neither says. Where README describes
what a module *is*, this file says where to go to *change* something and which
edits have a trap in them.

## Commands

Every command in this repository goes through `make`. The Makefile is the
interface; `package.json` and cargo are the implementation. Documentation that
names an npm script instead is documentation that will quietly rot.

```bash
make ci             # the gate — everything CI runs. Run it before a PR.

make test           # vitest, whole monorepo
make typecheck      # tsc --noEmit — the authority on types, not eslint
make lint           # eslint
make build          # bundle extension, MCP, sync-server
make smoke          # native host: framing + dedupe over stdio
make smoke-mcp      # built MCP bin answers over stdio
make smoke-sync     # built sync bin answers over HTTP

make rust-check     # cargo check, with and without the wdio feature
make tauri-dev      # run the desktop app with a window
```

`make help` lists the rest.

After every build: reload the extension at `chrome://extensions`, then refresh
the meeting tab. Load unpacked from `apps/extension/dist/`.

The brand mark is `assets/brand/logo-mark.svg`; `scripts/gen-icons.mjs`
re-renders it into the extension's PNGs (16/32/48/96/128) and has to be re-run
when it changes. 32 and 96 exist for Firefox, which uses them for the toolbar
button and the add-ons list; Chromium ignores them.

## Layout

npm workspaces are `apps/*` and `packages/*`:

```
apps/extension/public/content.js   capture, plain JS, no build step
apps/extension/src/background.ts   MV3 service worker: sweep, analyze, bridge
apps/extension/src/                React dashboard (App, components/, lib/)
apps/desktop/src/                  React shell: notes / inbox / settings views
apps/desktop/src-tauri/src/        Rust: file I/O and IPC only, never AI
apps/desktop/native-host.ts        the native-messaging host, bundled to .mjs
packages/shared/                   domain types, storage, crypto, audit log
packages/ai/                       provider adapters, prompts, rate limit
packages/meeting/                  pipeline, Ask, continuity, import, trackers
packages/store/                    SQLite + FTS5 for meetings (wasm or native)
packages/vault/                    .md vault: note format, bridge, vault FTS
packages/mcp/  packages/sync-server/  packages/exporters/
scripts/                           the installer CLI and its helpers
```

Four entry points, not one: the content script, the service worker, the Tauri
binary, and the native host. A change to the bridge usually touches three of
them at once.

React lives only in the `apps/*` frontends. Capture, orchestration and every
`packages/*` module stay framework-free — do not pull React or DOM libraries
into them. Rust owns file I/O and IPC (`vault.rs`); vault logic itself is
TypeScript in `packages/vault` so the host and the app share it.

Where to go:

| Change | Start at |
| --- | --- |
| capture broke on Meet/Teams | `apps/extension/public/content.js`, table `KNOWN` |
| meeting → note delivery | `apps/extension/src/background.ts` `deliverToDesktop`, then `packages/vault/src/bridge.ts` |
| host registration / installer | `scripts/nativeHost.mjs`, called from `scripts/companion.mjs` |
| note file format | `packages/vault/src/note.ts` (see Conventions) |
| desktop UI | `apps/desktop/src/App.tsx`, editor in `NoteEditor.tsx` |
| extension settings UI | `apps/extension/src/components/SettingsPanels.tsx` |
| an AI provider | `packages/ai/src/providers.ts` + `PROVIDER_PRESETS` in `client.ts` |

## Capture

Live capture runs in `apps/extension/public/content.js` (plain JS, no build
step, shipped as-is). Two platforms:

- **Google Meet** — the implicit branch; selector table `KNOWN` near the top,
  plus a class-independent avatar heuristic as fallback.
- **Microsoft Teams** — `teams.microsoft.com`, `teams.live.com`,
  `teams.cloud.microsoft`; gated by the `TEAMS` boolean at the top of the file.

**Zoom is import-only** (transcript file or audio), no live capture — see
`packages/meeting/src/import.ts`.

Meet rotates obfuscated class names every few months, so `KNOWN` rots. When
capture breaks, filter the console for `MeetCC` and update it; INSTALL.md has
the procedure. Both `manifest.json` and `content.js` must agree on hosts.

## The bridge (extension → desktop)

The chain, end to end: `background.ts` sweep → `sendNativeMessage` to host
`dev.suiflex.companion` → the host bundled from `apps/desktop/native-host.ts` →
`applyBatch` in `packages/vault/src/bridge.ts` → a `.md` note plus an
append-only `.transcript/<id>.jsonl` sidecar under `~/Companion`.

Three things about it that are easy to get wrong:

- **The manifest is per profile.** Chromium resolves native-messaging manifests
  against the *effective* `--user-data-dir`, and `companion install` launches
  browsers in a dedicated profile, so the manifest goes inside that profile —
  not the browser's default location. Firefox is the opposite: global path,
  profile ignored. Both live in `scripts/nativeHost.mjs`; Windows is a registry
  write and still belongs to `install-native-host.ps1`.
- **What gets registered is a wrapper, not the `.mjs`.** A browser started from
  Finder or a desktop launcher inherits no shell PATH, so `#!/usr/bin/env node`
  finds nothing. The wrapper execs an absolute node resolved at install time.
- **Delivery failure must stay non-fatal.** It can never block capture. It is
  no longer silent either: one `bridge.error` audit line per worker, and a
  "Tes koneksi" button in the Integrasi tab that pings the host — the ping is
  answered before `applyBatch`, so testing reachability never writes to the
  vault.

`make smoke` pipes frames straight into the host binary. It proves framing and
dedupe and nothing else — host name, manifest location, `allowed_origins` and
the installed path are all invisible to it, so every registration bug passes it
green. Only a real browser closes that gap.

The desktop app polls the vault every 5s via `listMarkdown` (one IPC call) and
refreshes when the file list changes, skipping the tick while edits are
unsaved. Deliberately not `listNotes`, which stats every note — one round trip
per note, forever. The cost of that choice: only *new* files are noticed.

## Conventions

- Tests are colocated: `foo.ts` next to `foo.test.ts`. No separate test tree.
- `platform` is a free-form TEXT column in `packages/store/src/schema.ts` —
  adding a platform needs no migration, but it is derived from the meeting-id
  prefix in `store.ts`, not from a URL.
- Prefer the existing dependency set. New deps need a reason.
- An AI provider is one adapter in `packages/ai/src/providers.ts` plus one row
  in `PROVIDER_PRESETS`, which lives in `packages/ai/src/client.ts` — two files,
  not one. `packages/ai/src/oauth.ts` is pure protocol and must stay free of
  `chrome.*` and storage calls.
- **A vault frontmatter key lives in four places** in
  `packages/vault/src/note.ts`: the `VaultNote` interface, `QUOTED` (or
  `LISTS`), `ORDER`, and the return literal of `noteFromMarkdown`. Miss any one
  and the value is dropped silently on the next save, with nothing failing —
  add a round-trip case to `note.test.ts` whenever you touch it. The parser is
  deliberately hand-rolled and understands only flat scalars and string lists;
  no YAML dependency, no nested maps, no block scalars.
- Notes are the canonical data; the SQLite/FTS index over them is derived,
  in-memory and rebuilt per session, so its schema can change freely.
- The desktop note body is edited with Milkdown, which is markdown-native — the
  document round-trips through remark, so the vault keeps storing plain `.md`.
  It normalizes as it serializes, so the first save of an old note can rewrite
  list markers and escaping.
- Notes written in the app carry `platform: 'manual'`; delivered ones carry the
  meeting platform. That is the only thing separating the notes view from the
  incoming-meetings view — no extra field.

## Releases

The extension and the desktop app share one version, one tag (`vX.Y.Z`) and one
`CHANGELOG.md`; release-please bumps `apps/extension` and `apps/desktop`
together from the root package. Which product a change belongs to comes from the
commit scope — `feat(desktop):`, `fix(extension):` — which is what separates
them in the changelog, so scope every user-facing commit.

CI renames the desktop bundles to `companion-desktop-<target-triple>.<ext>`
before upload. `.github/scripts/updater_manifest.py` matches those names
exactly, so a change to either side needs the other; its `--selftest` says so.

The release also carries `companion-native-host-v*.mjs`, which a standalone
`companion install` downloads to register the bridge. `make build` does not
build it — `make build-host` does, and the release workflow calls that
separately. Asset names are matched by regex in `scripts/companion.mjs`, so
renaming one breaks installs already in the wild.

# ForgeGuard

For code changes, use `/forgeguard-engineering`.
