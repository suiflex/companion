# Installing and running Meet Companion

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <img src="assets/brand/logo-light.svg" alt="Meet Companion" width="336">
  </picture>
</p>

Everything operational lives here: building the extension, loading it, wiring an
AI provider, and running the two optional servers. What the product *is* and how
it works stays in [README.md](README.md).

## Requirements

- Node 20 or newer, and npm 10 or newer.
- A Chromium browser that takes an unpacked MV3 extension (Chrome, Edge, Brave).
- Nothing else. There is no account to create, no backend to point at, and no
  key bundled with the extension.

## Build and load

```bash
npm install
npm test                # vitest
npm run test:coverage   # v8 coverage
npm run lint            # eslint (tsc --noEmit stays the authority on types)
npm run build           # typecheck + bundle -> extension, MCP and sync-server dist/
npm run smoke -w @meetcc/mcp          # the built MCP bin answers over stdio
npm run smoke -w @meetcc/sync-server  # the built sync bin answers over HTTP
```

Load: `chrome://extensions` → Developer mode → **Load unpacked** → **`apps/extension/dist/`**.
After every build: reload the extension, then refresh the Meet tab.

The manifest carries a `key`, so the extension id is the same wherever it is
loaded from:

| browser  | id                                 |
| -------- | ---------------------------------- |
| Chromium | `pkgpllhlmhhocidmipbokpigndoeiemb` |
| Firefox  | `companion@suiflex.dev`            |

That matters because your meetings live in `chrome.storage.local`, which is
scoped to the id — without the pinned key, loading the same build from a
different folder would hand you an empty dashboard.

### Terminal installer (no npm, no manual load)

For a quicker path — especially on a machine that just wants to run the
released extension without a checkout — run the curl installer. It puts the
`companion` CLI and the latest release `dist` into `~/.companion` and a
`companion` wrapper into `~/.local/bin` (add it to your `PATH` if it isn't
there). Nothing is published to npm.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/suiflex/companion/develop/scripts/install.sh | bash
```

```powershell
# Windows (PowerShell 5.1 or 7+)
irm https://raw.githubusercontent.com/suiflex/companion/develop/scripts/install.ps1 | iex
```

```bash
# then, on either platform:
companion install              # TTY-pick one or several browsers, launch each
companion install --preview    # see the TTY flow without launching anything
companion update               # re-downloads the latest release dist
```

Node 20+ is the only prerequisite — the release zip is unpacked by the CLI
itself, so there is no `unzip` or `tar` to install first. On Windows the shim
is `%USERPROFILE%\.local\bin\companion.cmd`; the installer prints the command
that puts it on your `PATH` rather than editing the environment for you.

`companion install` launches each chosen browser in its own **dedicated
profile** (`~/.meetcc/browser-profiles/<browser>`), so it never touches your
everyday windows (`%USERPROFILE%\.meetcc\browser-profiles\<browser>` on
Windows). The picker is an interactive **select box**: arrow keys move,
**Space** toggles a browser on/off, **Enter** confirms — select several or all
detected browsers (Chrome, Edge, Brave, Arc, Vivaldi, Opera, Canary, Firefox).
Sign-ins (AI provider, trackers) persist in each profile across runs. Everyday
profile sign-ins do not carry over, by design. Inside the repo you can
equivalently run `node scripts/companion.mjs install --preview`.

For Chromium browsers the same `--load-extension` / dedicated-profile mechanism
is what the manual Developer-mode load does, minus the manual
extract-and-click steps.

### Firefox

Firefox has no `--load-extension`, and its add-ons must be signed by Mozilla to
survive a restart. So the installer opens Firefox on the add-on's page at
addons.mozilla.org in the dedicated profile, and one click on **Add to Firefox**
installs it. From then on Firefox keeps it up to date by itself — no
`companion update`, no banner.

In a repo checkout, load your own build instead: `npm run pack -- firefox`, then
`about:debugging` → **Load Temporary Add-on** → `apps/extension/dist-firefox`. A
temporary add-on is gone on the next Firefox restart, which is fine for
development and not fine for daily use.

## Upgrading from a version before 1.6.0

Your meetings live in `chrome.storage.local`, which the browser scopes to the
extension id. Before 1.6.0 that id was a hash of the folder the extension was
loaded from, so it changed whenever the install moved. 1.6.0 pins it for good —
but the pinned id is not the old one, so an archive captured before the upgrade
does not follow you across it, and the dashboard opens empty.

Once, before you remove the old install:

1. Load the **old** version, open **Settings → Cadangan → Unduh cadangan**. One
   file, every meeting.
2. Upgrade (`companion update`, or install the Firefox add-on).
3. Open the new one, **Settings → Cadangan → Pulihkan dari cadangan**, pick that
   file.

The backup carries transcripts, notes, chat and documents. It carries **no API
key, no token and no audit log**, so it is safe to keep on disk — and you will
need to set your AI provider up again afterwards.

Restoring only adds: a meeting already in the profile is never overwritten, so
restoring the same file twice does nothing and you cannot lose work by trying.

Already upgraded and staring at an empty dashboard? The old data is not gone —
it is under the old extension id. Load the previous build from its original
folder, take the backup, then restore it into the new one.

## Connecting an AI provider

Settings (⚙) → **AI Provider**. Two ways to pay for the completions, and the
choice is per install:

**Paste an API key** — OpenAI, Google Gemini, Claude, Azure OpenAI, OpenRouter,
or any OpenAI-compatible endpoint including a local Ollama / LM Studio. The key
is AES-GCM encrypted at rest.

**Sign in to a subscription you already have** — *ChatGPT (masuk dengan akun)*
or *Google (masuk dengan akun)*. No key to paste and no API billing: the
completions draw on the plan the account already carries.

| Sign-in | How it runs | What it costs |
|---|---|---|
| ChatGPT | A device code: the extension shows a short code, opens `auth.openai.com/codex/device`, and you approve there. | Your ChatGPT plan |
| Google | Consent opens in a tab and lands on a `127.0.0.1` address that loads nothing. That is expected — copy the whole address bar back into the field. | Your Google account's Code Assist tier |

Both reach the backends the vendors' own CLIs use (Codex CLI, Gemini CLI) with
those clients' public credentials. Neither is a documented public API, so either
can change without notice — pick an API-key provider when you need a stable
contract. Tokens are encrypted at rest like any other credential and renewed
before they expire; **Keluar** in the same panel disconnects the account.

Google's sign-in provisions a Code Assist project for the account when it has
none, which is why it never asks you for a GCP project.

## Optional integrations

All off by default and configured with **your own** credentials — this extension
ships no keys, no endpoints and no backend.

| Integration | What it needs | Notes |
|---|---|---|
| Issue tracker | Jira / Linear / Notion token + project/team/database id | pushes an action item as an issue, then reads its status back |
| Sync & team workspace | your endpoint + token + passphrase | payload is AES-GCM encrypted with a PBKDF2 key before it leaves the machine |
| Sharing | a passphrase | exports one meeting as an encrypted file; summary-only is an option |
| Speech-to-text | OpenAI-compatible endpoint (incl. local Whisper) | for imported audio/video, max 25 MB; diarized speakers used when the endpoint returns them |
| Google Calendar | your own OAuth client id | or match agendas offline from an `.ics` file |
| Import | — | `.vtt`, `.srt`, Zoom transcript, or plain text becomes a normal meeting |

## Sync server

There is no Companion service. `packages/sync-server` is a ~300-line endpoint
you run yourself; it only ever stores the encrypted blob the extension sends,
so it cannot read a meeting even if it wanted to.

```bash
npm run build -w @meetcc/sync-server
COMPANION_TOKEN=$(openssl rand -hex 24) npm run start -w @meetcc/sync-server
# -> http://127.0.0.1:8787 ; paste that + the token into Settings -> Sync
```

| Env | Default | Meaning |
|---|---|---|
| `COMPANION_TOKEN` | — | bearer token the extension must present |
| `COMPANION_WORKSPACE` | `` (personal) | shared namespace for a team |
| `COMPANION_TOKENS_FILE` | — | `{"<token>": "<workspace>"}` for several people |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | loopback by default, on purpose |
| `COMPANION_DATA` | `./companion-sync-data` | one JSON file per meeting |

It binds loopback because the token travels in a header: the extension accepts
`https://` anywhere, but plain `http://` only on loopback (`localhost`, `127.0.0.1`, `[::1]`). To
reach it from another machine, put it behind a TLS reverse proxy and use the
`https://` URL. A token is bound to exactly one workspace, so it can neither
read nor write another one.

## MCP server

Expose the meeting archive to a coding agent, read-only:

```bash
# Settings → Data & MCP → "Ekspor snapshot"  (no API keys or audit log included)
npm run build -w @meetcc/mcp
node packages/mcp/dist/server.js ~/Downloads/companion-snapshot.json
```

The bin is bundled rather than run from source: the workspace packages ship as
raw `src/*.ts` for the bundler, which plain `node` cannot resolve.
`npm run build` at the root builds it alongside the extension.

Tools: `list_meetings`, `search_meetings`, `get_meeting`, `get_transcript`,
`ask_meeting`, `ask_meetings`, `get_decisions`, `get_action_items`,
`get_open_questions`. The `ask_*` tools return grounded evidence windows rather
than a generated answer — the calling agent does the reasoning.


## The two deliveries: extension, and Companion Desktop

This repo now builds two independent products that share the same capture
core. Neither depends on the other at runtime.

1. **Extension (Chrome/Mozilla)** — capture + AI notes, distributed through the
   official stores (Chrome Web Store, Mozilla Add-ons). Uses the extension only
   and needs nothing else installed.
2. **Companion Desktop (Windows/Linux/macOS)** — a Tauri 2 app that owns a
   local vault of Markdown notes (the `.md` files are canonical; search is a
   rebuildable FTS index). Installing the desktop app also registers a
   **native-messaging host**, which lets the extension push caption batches
   straight into the vault.

The bridge is strictly additive: if the desktop host is not installed the
extension's `bridge-send` simply fails silently and the extension keeps working
exactly as before.

### Companion Desktop

```bash
npm install
npm run build -w @meetcc/desktop   # frontend (tsc + vite)
cd apps/desktop && npx tauri build --no-bundle   # or `make tauri` from repo root
```

`make tauri-dev` (from the repo root) runs the app in dev mode. See
[README.md](README.md) for the architecture.

### Registering the native-messaging host

The host must be installed and allowlisted with the extension id the browser
loads the build under:

```bash
# macOS / Linux (Chrome, or pass `firefox` for Firefox)
apps/desktop/scripts/install-native-host.sh pkgpllhlmhhocidmipbokpigndoeiemb chrome
apps/desktop/scripts/install-native-host.sh companion@suiflex.dev firefox

# Windows (PowerShell, from the repo root)
powershell -ExecutionPolicy Bypass -File apps/desktop/scripts/install-native-host.ps1 -ExtensionId pkgpllhlmhhocidmipbokpigndoeiemb -Channel chrome
```

The installer bundles the host, copies it to a stable user path per OS
(`~/Library/Application Support/Companion` on macOS, `~/.local/share/companion`
on Linux, `%LOCALAPPDATA%\Companion` on Windows — never the Downloads folder),
and writes the browser manifest (registry key on Windows Chrome). Re-run it any
time the extension id or build changes.

## When capture breaks

Meet rotates obfuscated class names every few months. Console (filter `MeetCC`) dumps the caption container when nothing matches. Update `KNOWN` at the top of `apps/extension/public/content.js` (2026-07: block `.nMcdL`, speaker `.KcIKyf`, text `.ygicle`). The avatar-anchored heuristic usually keeps capture alive meanwhile.
