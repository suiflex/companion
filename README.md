# Meet Companion — AI Meeting Assistant

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <img src="assets/brand/logo-light.svg" alt="Meet Companion" width="425">
  </picture>
</p>

<p align="center">
  Chrome extension (Manifest V3) that captures <b>Google Meet</b> and <b>Microsoft Teams</b>
  captions from the DOM, then generates AI meeting notes: executive summary, timeline,
  decisions, action items, risks, open questions — exportable as Markdown and PDF.
</p>

<p align="center">
  <a href="INSTALL.md"><b>Install and run →</b></a>
</p>

Everything stays on the machine: capture, the searchable archive, and the notes.
The only thing that leaves is the transcript you send to the AI provider you
chose — and which provider that is, is yours to pick, including a local one.

## Install from the terminal

Prefer a prompt over Developer-mode clicks? The `companion` CLI installs the
latest release and launches it in Chrome, Edge, Brave, Arc, Vivaldi, Opera or
Firefox, each in its own dedicated profile so your everyday windows are
untouched. An interactive select box lets you arrow-key through browsers, Space
to toggle, and Enter to launch — one or several at once. Chromium browsers start
ready to use; Firefox opens on the add-on's page at addons.mozilla.org, where one
click installs it and Firefox handles updates from then on.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/suiflex/companion/develop/scripts/install.sh | bash
```

```powershell
# Windows
irm https://raw.githubusercontent.com/suiflex/companion/develop/scripts/install.ps1 | iex
```

```bash
companion install          # TTY-pick browser(s), then launches
companion install --preview # see the picker without launching
companion update           # re-download the latest release dist
```

`companion` lives in `~/.local/bin` (`%USERPROFILE%\.local\bin` on Windows —
add it to your `PATH`) with the release `dist` in `~/.companion`. Node 20+ is
the only prerequisite. From a checkout, `node scripts/companion.mjs install` is
equivalent. Full steps: **[INSTALL.md](INSTALL.md)**.

## Monorepo

apps/
  extension/            # MV3 extension: React UI, service worker, content script
  desktop/              # Tauri 2 desktop app (Windows/macOS/Linux): vault + FTS editor
packages/
  shared/               # domain types, storage layer, crypto (AES-GCM), audit log
  ai/                   # provider adapters (strategy), prompt + parsing, rate limit
  meeting/              # pipeline, global Ask, continuity, import, sync, trackers
  store/                # SQLite WASM + OPFS + FTS5 index, structured meeting memory
  vault/                # file-backed desktop vault: identity, notes, bridge, FTS index
  mcp/                  # read-only MCP server over an exported snapshot
  sync-server/          # optional sync endpoint you run on your own machine
  exporters/            # markdown + pdf generators (pure)
scripts/gen-icons.mjs   # icon generation
```

One repository, one build — no microservices. UI is React 18 + TypeScript + Vite; capture and orchestration stay framework-free.

> Build, test and load instructions: **[INSTALL.md](INSTALL.md)**.

### Companion Desktop (Tauri 2)

Beyond the extension, this repo ships a **Companion Desktop** app
(Windows/macOS/Linux, Tauri 2 + React). Where the extension captures and
summarises in the browser, the desktop app owns a local **vault** — a plain
folder of Markdown `.md` files that stay the canonical source. Search and
backlinks run on a derived SQLite/FTS5 index that is rebuilt from the files, so
deleting the index never loses a note.

The two talk over a **native-messaging bridge**. With the desktop app installed,
its host registered, and the bridge switched on in Settings, the extension hands
each finished meeting to the vault through `@meetcc/vault` (`applyBatch`, deduped
by `operation_id`, merged by `session_key`), writing it as a note plus an
append-only transcript sidecar. Deliveries are incremental and only advance once
the host confirms them.

Installing the desktop is optional and purely additive: the bridge is off by
default, and with no host the extension works exactly as before. Build,
native-host setup and the Settings toggle:
**[INSTALL.md](INSTALL.md#the-two-deliveries-extension-and-companion-desktop)**.

## How it works

1. **Capture** (`content.js`): polls Meet's caption DOM (selector table + class-independent avatar heuristic), stores `transcript:<id>` entries `{speaker, avatar, text, time}`, heartbeats `meta:<id>` every 5s while in-call. Auto-enables CC; badge opens an always-on-top PiP transcript.
2. **Detect** (`background.js` + `@meetcc/meeting`): alarm sweeps every minute; a meeting whose heartbeat went silent ≥15s with ≥5 entries and no analysis is "finished".
3. **Analyze** (`@meetcc/ai`): structured-JSON completion → validated `Analysis`. Retry on transient failures, rate-limited (6 runs / 10 min). A transcript too long for one request is split into chunks, analyzed in bounded parallel and folded back together (map-reduce) — a failing chunk is skipped, not fatal.
4. **Deliver**: record saved (`analysis:<id>`), the meeting gets a name derived from its executive summary (`title:<id>`, renameable in the toolbar), UI updates via storage events, and a Chrome notification fires — clicking it opens that meeting. Markdown/PDF generated on demand (PDF code-split, lazy-loaded).

## Local knowledge base (SQLite + FTS5, no embeddings)

`chrome.storage.local` stays the capture write-path and the rollback copy. On top
of it the service worker maintains a **SQLite (WASM) database in OPFS** — the
queryable index: sessions, transcript lines, and the structured memory extracted
from each analysis (decisions, action items, open questions, risks) with
`evidence_refs` pointing back at the transcript lines they came from.

The index is derived data: it is rebuilt from storage on every sweep (skipping
meetings that already match) and can be dropped and rebuilt at any time —
**Settings → Data & MCP → Bangun ulang indeks**.

Retrieval is lexical, not vector-based: FTS5 + BM25 over the transcript and over
the structured memory, plus conversation-window expansion. There is no embedding
model, no vector database, and no external retrieval service.

- **⌘K / Ctrl-K** — search every meeting: transcript, decisions, actions, questions, documents.
- **Knowledge base (✦)** — Ask across all meetings, decision chronology, revised
  decisions, and the action-item list with mark-done and tracker push.
- Each meeting header shows date, duration, participants, platform and project,
  plus what is still open from earlier meetings in the same room or project.
- The same carry-over appears **during** the call: a dismissible strip under the
  in-page badge lists what is still open from earlier meetings in that room, so
  it can be raised while everyone is there.

The database lives in the service worker only (OPFS is single-writer); the
dashboard reaches it through runtime messages.

## Permissions

The extension does **not** ship with blanket host access. `host_permissions`
covers only the meeting hosts it captures from (Meet, Teams). The AI provider,
issue tracker, sync endpoint, speech-to-text endpoint and Google Calendar are
`optional_host_permissions`, requested per origin when you save Settings —
decline and only that integration stops working (roadmap §8.3).

## AI providers

One adapter per provider in `packages/ai/src/providers.ts`. Bring an API key
(OpenAI, Gemini, Claude, Azure, OpenRouter, Ollama, LM Studio, any
OpenAI-compatible endpoint), sign in to a **ChatGPT** or **Google** subscription
you already pay for, or use Chrome's built-in Gemini Nano and configure nothing
at all. Credentials are AES-GCM encrypted at rest (key material lives in the
same profile — this guards against casual storage dumps, not full-profile
compromise).

Setup for each is in [INSTALL.md](INSTALL.md#connecting-an-ai-provider).

## Action items and the tracker

**Kirim ke tracker** creates the issue and stores its reference, so the same
task is never pushed twice. **Tarik status tracker** then reads the status back
— an item closed in Jira, Linear or Notion is closed here too. The tracker
wins, but only when it answers clearly: an unreadable or unrecognised status
leaves the local state alone rather than guessing.

## Speakers in imported recordings

Whisper transcribes but does not diarize. Companion uses whatever the endpoint
actually gives it: a per-segment `speaker` (WhisperX, pyannote, Deepgram-style
wrappers) is used as-is, a whisper.cpp `[SPEAKER_TURN]` marker advances the
count, and a recording with neither becomes one `Speaker 1` rather than a wall
of `Unknown`. Click a name in the Transcript view of a finished meeting to
rename that speaker everywhere at once — search and participants follow.

## Transcript cleanup provenance

"Rapikan" never overwrites the raw capture. In the **Rapi** view every line the
AI rewrote shows what was actually said, with a one-click **Pakai versi asli**.
That decision is what downstream AI reads — a wrong correction cannot quietly
travel cleanup → summary → decisions → Ask → PRD (roadmap §26).

## Backup

**Settings → Cadangan** writes every meeting to one JSON file and restores it
into any profile. Secrets stay out of it — no API key, no token, no audit log —
so the file is safe to keep, and the provider has to be set up again after a
restore. Restoring is additive and never overwrites a meeting that is already
there.

This is also the upgrade path across 1.6.0, which pinned the extension id; see
[INSTALL.md](INSTALL.md).

## Data retention

Everything stays in `chrome.storage.local` under the `unlimitedStorage` permission, so transcripts are not capped at the default 10 MB quota.

Nothing is deleted automatically by default. Settings → **Simpan riwayat** opts into a retention window (30 / 90 / 365 days); the minute sweep then removes meetings whose last activity is older than that, including their transcript, notulen, chat and documents. There is no undo — enabling it asks for confirmation, as does deleting a single meeting.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Privacy: [PRIVACY.md](PRIVACY.md).
Found a vulnerability? [SECURITY.md](SECURITY.md) — please do not open a public
issue.
