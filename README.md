# Meet Companion — AI Meeting Assistant

Chrome extension (Manifest V3) that captures Google Meet captions from the DOM, then automatically generates AI meeting notes: executive summary, timeline, decisions, action items, risks, open questions — exportable as Markdown and PDF.

## Monorepo

```
apps/
  extension/            # MV3 extension: React UI, service worker, content script
packages/
  shared/               # domain types, storage layer, crypto (AES-GCM), audit log
  ai/                   # provider adapters (strategy), prompt + parsing, rate limit
  meeting/              # pipeline, global Ask, continuity, import, sync, trackers
  store/                # SQLite WASM + OPFS + FTS5 index, structured meeting memory
  mcp/                  # read-only MCP server over an exported snapshot
  exporters/            # markdown + pdf generators (pure)
scripts/gen-icons.mjs   # icon generation
```

One repository, one build — no microservices. UI is React 18 + TypeScript + Vite; capture and orchestration stay framework-free.

## Develop

```bash
npm install
npm test                # vitest — 274 tests
npm run test:coverage   # v8 coverage (packages ~93% lines)
npm run lint            # eslint (tsc --noEmit stays the authority on types)
npm run build           # typecheck + bundle -> apps/extension/dist/ and packages/mcp/dist/
npm run smoke -w @meetcc/mcp   # the built MCP bin answers over stdio
```

Load: `chrome://extensions` → Developer mode → **Load unpacked** → **`apps/extension/dist/`**.
After every build: reload the extension, then refresh the Meet tab.

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

The database lives in the service worker only (OPFS is single-writer); the
dashboard reaches it through runtime messages.

## Permissions

The extension does **not** ship with blanket host access. `host_permissions`
covers only the meeting hosts it captures from (Meet, Teams). The AI provider,
issue tracker, sync endpoint, speech-to-text endpoint and Google Calendar are
`optional_host_permissions`, requested per origin when you save Settings —
decline and only that integration stops working (roadmap §8.3).

## Optional integrations

All off by default and configured with **your own** credentials — this extension
ships no keys, no endpoints and no backend.

| Integration | What it needs | Notes |
|---|---|---|
| Issue tracker | Jira / Linear / Notion token + project/team/database id | pushes an action item as an issue, stores the reference |
| Sync & team workspace | your endpoint + token + passphrase | payload is AES-GCM encrypted with a PBKDF2 key before it leaves the machine |
| Sharing | a passphrase | exports one meeting as an encrypted file; summary-only is an option |
| Speech-to-text | OpenAI-compatible endpoint (incl. local Whisper) | for imported audio/video, max 25 MB |
| Google Calendar | your own OAuth client id | or match agendas offline from an `.ics` file |
| Import | — | `.vtt`, `.srt`, Zoom transcript, or plain text becomes a normal meeting |

## Transcript cleanup provenance

"Rapikan" never overwrites the raw capture. In the **Rapi** view every line the
AI rewrote shows what was actually said, with a one-click **Pakai versi asli**.
That decision is what downstream AI reads — a wrong correction cannot quietly
travel cleanup → summary → decisions → Ask → PRD (roadmap §26).

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

## AI providers

Settings (⚙) — adapter per provider, add new ones in `packages/ai/src/providers.ts`:

| Provider                                          | Notes                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Built-in (default)                                | Chrome Gemini Nano Prompt API, zero config, if the browser ships it |
| OpenAI / OpenRouter / Ollama / LM Studio / Custom | one OpenAI-compatible adapter                                       |
| Azure OpenAI                                      | endpoint + deployment name, `api-key` header                        |
| Claude (Anthropic)                                | direct browser access header                                        |
| Google Gemini                                     | `generateContent` REST                                              |

API keys are AES-GCM encrypted at rest (key material lives in the same profile — this guards against casual storage dumps, not full-profile compromise).

## Data retention

Everything stays in `chrome.storage.local` under the `unlimitedStorage` permission, so transcripts are not capped at the default 10 MB quota.

Nothing is deleted automatically by default. Settings → **Simpan riwayat** opts into a retention window (30 / 90 / 365 days); the minute sweep then removes meetings whose last activity is older than that, including their transcript, notulen, chat and documents. There is no undo — enabling it asks for confirmation, as does deleting a single meeting.

## When capture breaks

Meet rotates obfuscated class names every few months. Console (filter `MeetCC`) dumps the caption container when nothing matches. Update `KNOWN` at the top of `apps/extension/public/content.js` (2026-07: block `.nMcdL`, speaker `.KcIKyf`, text `.ygicle`). The avatar-anchored heuristic usually keeps capture alive meanwhile.
