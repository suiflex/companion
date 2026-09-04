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
make smoke          # Node host: framing + dedupe over stdio
make smoke-host     # desktop binary in --native-host mode: framing + spool
make smoke-mcp      # built MCP bin answers over stdio
make smoke-sync     # built sync bin answers over HTTP

make rust-check     # cargo check, with and without the wdio feature
make rust-test      # cargo test for the desktop crate
make tauri-dev      # run the desktop app with a window
```

`make ci` is `ci-js` plus `ci-rust`, split along the toolchain boundary so CI
can run them on separate runners — only one half needs a Rust toolchain and
the Linux WebView libraries. `make help` lists the rest.

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
apps/desktop/src/                  React shell: notes / inbox / settings / install
apps/desktop/src-tauri/src/        Rust: file I/O, IPC, keychain, host mode
apps/desktop/native-host.ts        the Node native-messaging host, bundled to .mjs
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

Inside `apps/desktop/src-tauri/src/`, one module per concern: `vault.rs` file
I/O, `settings.rs` the settings file and the OS keychain, `host.rs` the native
-messaging mode, `install.rs` browser registration, `lib.rs` the command list.

React lives only in the `apps/*` frontends. Capture, orchestration and every
`packages/*` module stay framework-free — do not pull React or DOM libraries
into them.

**Rust owns no domain logic.** It is file I/O, IPC, the keychain and the HTTP
transport; vault logic is TypeScript in `packages/vault` so the host and the
app share one implementation, and the AI adapters stay in `packages/ai`. When
Rust needs to do something the WebView cannot — reach a provider through the
CSP, hold a secret, speak a pipe — it carries the bytes and nothing else.

Where to go:

| Change | Start at |
| --- | --- |
| capture broke on Meet/Teams | `apps/extension/public/content.js`, table `KNOWN` |
| meeting → note delivery | `apps/extension/src/background.ts` `deliverToDesktop`, then `packages/vault/src/bridge.ts` |
| host registration, from the CLI | `scripts/nativeHost.mjs`, called from `scripts/companion.mjs` |
| host registration, from the app | `apps/desktop/src-tauri/src/install.rs` + `InstallView.tsx` |
| note file format | `packages/vault/src/note.ts` (see Conventions) |
| desktop UI | `apps/desktop/src/App.tsx`, editor in `NoteEditor.tsx` |
| where a save lands | `apps/desktop/src/saveTarget.ts` — pure, and tested |
| the desktop sidebar tree | `apps/desktop/src/{NoteTree.tsx,tree.ts}` |
| desktop AI settings | `apps/desktop/src/{AIProviderPanel.tsx,aiSettings.ts}` |
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

**There are two hosts, both registered under the name `dev.suiflex.companion`,
and only one can be registered at a time — whichever wrote the manifest last
wins.** They are not interchangeable in what they do:

| | Node host | Desktop host |
| --- | --- | --- |
| Source | `apps/desktop/native-host.ts` → `.mjs` | `src-tauri/src/host.rs` |
| Registered by | `companion install` (CLI) | the app's Connect-a-browser screen |
| Needs | Node on PATH at install time | nothing |
| Writes | the note, immediately | a spool file, for the app to apply |
| App closed | delivery is lost | delivery waits on disk |
| Gate | `make smoke` | `make smoke-host` |

The chain, end to end: `background.ts` sweep → `sendNativeMessage` → the host →
`applyBatch` in `packages/vault/src/bridge.ts` → a `.md` note plus an
append-only `.transcript/<id>.jsonl` sidecar under `~/Companion`.

The desktop host stops one step short of that: it writes the batch verbatim
into a spool directory, and `apps/desktop/src/spool.ts` applies it from the
app's poll tick with the same `applyBatch`. That is deliberate and is the rule
above about Rust owning no domain logic — a second note-writer in Rust would
drift from the TypeScript one the first time either changed.

Things about it that are easy to get wrong:

- **The manifest goes in the user-data-dir, not the profile folder inside it.**
  Chromium resolves native-messaging manifests against the *effective*
  `--user-data-dir`. For Arc that is `Arc/User Data`, not `Arc/` and not
  `Arc/User Data/Default` — established by writing the manifest to seven
  candidate paths and reading back which one the browser had actually opened.
  Firefox is the opposite: global path, profile ignored. Windows is a registry
  write and still belongs to `install-native-host.ps1`.
- **The two registrars detect browsers differently.** `scripts/companion.mjs`
  looks for the *binary* in `/Applications`; `install.rs` looks for the
  *profile directory*. Both are hardcoded lists, so a browser outside them is
  invisible, and a profile moved with `--user-data-dir` is worse than invisible
  — the desktop screen will register the default location and report success.
- **What the CLI registers is a wrapper, not the `.mjs`.** A browser started
  from Finder inherits no shell PATH, so `#!/usr/bin/env node` finds nothing.
  The wrapper execs an absolute node resolved at install time. The desktop host
  has no such problem: the manifest names the app binary and passes
  `--native-host`, which `main.rs` checks *before* Tauri starts — without that
  argument the browser would open a window and never speak the protocol.
- **A ping must never write anything.** Both hosts answer `{type:'ping'}`
  before reaching `applyBatch`, which is what the "Test connection" button
  uses. A host that lacked the branch once fell through to the vault writer and
  left `Rapat/NaN-NaN-Na/undefined-TNaN.md` in a real vault; `applyBatch` now
  refuses a batch with no `roomId` or no parseable `startedAt` as well.
- **Delivery failure must stay non-fatal.** It can never block capture, and it
  is not silent either: one `bridge.error` audit line per worker.

Both smoke targets pipe frames straight into a host. They prove framing and
dedupe and nothing else — host name, manifest location, `allowed_origins` and
the installed path are all invisible to them, so every registration bug passes
them green. Only a real browser closes that gap.

The desktop app polls the vault every 5s via `listMarkdown` (one IPC call) and
refreshes when the file list changes, skipping the tick while edits are
unsaved. Deliberately not `listNotes`, which stats every note — one round trip
per note, forever. The cost of that choice: only *new* files are noticed. The
same tick drains the spool, which is why a delivery appears without a restart.

## Language

English is the default; Indonesian is a setting in both apps. The engine is
`packages/shared/src/i18n.ts` with catalogues in `messages/{en,id}.ts` —
hand-rolled, no dependency, the same shape as `theme.ts`.

`chrome.i18n` is not an option here and never will be: the desktop app is
Tauri, so `_locales` reaches neither it nor `packages/*`. One catalogue spans
all three.

Five things to know before touching it:

- **A key added to `en.ts` must be added to `id.ts`.** `MessageKey` derives
  from the English catalogue, so the typecheck catches it — and `i18n.test.ts`
  compares the two key sets and their `{placeholders}` outright, because a
  translation missing on one side renders the other language rather than
  failing.
- **Import the deep path `@meetcc/shared/i18n`, never the barrel.**
  `index.ts` re-exports modules that reach for `chrome.*`, which does not
  exist in a Tauri window. Both apps alias the deep path in their vite config.
- **Three runtimes, three mechanisms.** The React UIs import `t()`. The
  service worker is its own context and reads the `lang` storage key itself at
  startup. `public/content.js` ships unbundled and cannot import at all, so it
  carries a small inline copy of its own three strings — keep them in step.
- **`t()` reads a module-level language, which React cannot see changing.**
  Each app's root subscribes with `onLangChange` and re-renders. A label map
  frozen at module load keeps whatever language was current when the file was
  first imported; store keys in those maps and resolve at render time.
- **A string that never became a key is invisible to the catalogue tests.**
  `i18n.test.ts` compares the two catalogues, and `messages/catalogue.test.ts`
  compares the catalogue against the source tree — neither can see a literal
  that was hardcoded in JSX and never catalogued. Two sweeps were called
  complete on that basis and both were wrong. The third check in
  `catalogue.test.ts` reads the JSX instead and fails on any text node that is
  not `{t(...)}`; its `NOT_COPY` allowlist exists because TypeScript generics
  look like JSX text to a regex, and because brand names and code samples are
  not copy. Adding to that list is a decision made on purpose.

Not translated, deliberately: AI prompt text (meeting output already mirrors
the transcript's language, and the prompts say so), MCP tool descriptions and
sync-server responses (their reader is a program), the bilingual stopword and
highlight-keyword tables (translating them would break detection), and
anything already written to disk — the `Rapat/` directory, the `nota/` session
key prefix and the `rapat` tag are data, not copy.

## Conventions

- Tests are colocated: `foo.ts` next to `foo.test.ts`. No separate test tree.
- `platform` is a free-form TEXT column in `packages/store/src/schema.ts` —
  adding a platform needs no migration, but it is derived from the meeting-id
  prefix in `store.ts`, not from a URL.
- Prefer the existing dependency set. New deps need a reason.
- **The desktop WebView cannot reach the network.** Its CSP is
  `connect-src 'self' ipc:` and cannot be widened to a host list, because
  provider base URLs are typed by the user. Outbound calls leave through Rust:
  `packages/ai` exposes `setFetch`/`setOAuthFetch`, installed once in
  `apps/desktop/src/main.tsx`. The extension keeps the global `fetch`.
- **Desktop secrets go in the OS keychain, never in a file.** The extension
  encrypts its API key and then stores the key beside the ciphertext, which its
  own comment in `packages/shared/src/crypto.ts` calls obfuscation — true in a
  browser profile, and a choice rather than a constraint on a desktop.
  `src-tauri/src/settings.rs` splits them: ordinary values to a JSON file next
  to the remembered vault root, secrets to `keyring`.
- **`packages/shared`'s barrel reaches for `chrome.*`.** Import deep paths from
  the desktop — `@meetcc/shared/{i18n,types,provider}` — never `index.ts`.
- The desktop window sets `dragDropEnabled: false`. The default is `true`, and
  it makes the OS swallow drag-and-drop before the WebView sees a `drop` event,
  which is why dragging a note in the sidebar did nothing at all.
- An AI provider is one adapter in `packages/ai/src/providers.ts` plus one row
  in `PROVIDER_PRESETS`, which lives in `packages/ai/src/client.ts` — two files,
  not one. `packages/ai/src/oauth.ts` is pure protocol and must stay free of
  `chrome.*` and storage calls.
- **Four modules are hand-synced between the two apps**, not shared:
  `theme.ts`, `lang.ts`, `toast.tsx` and `sponsor.ts` each exist in both
  `apps/extension/src/` and `apps/desktop/src/`. The apps share no runtime, so
  a shared module would need a build boundary for thirty lines. The cost is
  real and has been paid twice: an icon added to one `sponsor.ts` left the
  other showing two identical hearts. Change one, change the other.
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
  meeting platform. That one field decides everything about a note: whether the
  inbox lists it, how the sidebar marks it, and — the part with teeth —
  **whether saving it overwrites or copies**.
- **A delivered meeting is an archive and is never rewritten.** Saving an edit
  of one produces a new note (new id, own session key, `manual`, `source`
  pointing back at the meeting) and leaves the delivered file untouched. The
  rule lives in `apps/desktop/src/saveTarget.ts`, which is pure and tested for
  a reason: it was three nested ternaries inside `App.tsx` and was wrong twice
  — once writing a second file for a note that already had one, once making a
  fresh copy on *every* save instead of finding the copy already there.
- **`writeNote` derives the path; `writeNoteAt` does not.** The derived path is
  right for a note arriving over the bridge, which has no location yet, and
  wrong for one that already lives somewhere — that combination is what wrote
  the second file. Anything editing an existing note wants `writeNoteAt`.
- **The index tolerates a duplicate session key**, skipping the row and naming
  the file, rather than failing the rebuild. A vault is a folder someone can
  edit outside the app and the rebuild runs on every refresh, so failing hard
  means an app that cannot start with no way out.

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

That asset stays in the release even though the desktop app is now its own
host: the CLI still registers the Node one, and an install already out there
updates through it. Dropping it is a decision about existing installs, not a
cleanup.

# ForgeGuard

For code changes, use `/forgeguard-engineering`.
