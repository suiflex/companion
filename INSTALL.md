# Installing and running Meet Companion

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <img src="assets/brand/logo-light.svg" alt="Meet Companion" width="300">
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
npm test                # vitest — 331 tests
npm run test:coverage   # v8 coverage
npm run lint            # eslint (tsc --noEmit stays the authority on types)
npm run build           # typecheck + bundle -> extension, MCP and sync-server dist/
npm run smoke -w @meetcc/mcp          # the built MCP bin answers over stdio
npm run smoke -w @meetcc/sync-server  # the built sync bin answers over HTTP
```

Load: `chrome://extensions` → Developer mode → **Load unpacked** → **`apps/extension/dist/`**.
After every build: reload the extension, then refresh the Meet tab.

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

## When capture breaks

Meet rotates obfuscated class names every few months. Console (filter `MeetCC`) dumps the caption container when nothing matches. Update `KNOWN` at the top of `apps/extension/public/content.js` (2026-07: block `.nMcdL`, speaker `.KcIKyf`, text `.ygicle`). The avatar-anchored heuristic usually keeps capture alive meanwhile.
