# Operations runbook

Daily operational loops: build and load, capture, import, export, and reading the
§32.1 product-gate probe. One-time setup: [INSTALL.md](../INSTALL.md); what the
product is, in [README.md](../README.md).

## Build and load

`npm install && npm run build` (typecheck + bundle extension, MCP, sync-server);
`npm test` runs the monorepo. Load `apps/extension/dist/` via `chrome://extensions`
→ Developer mode → **Load unpacked**. After every rebuild: reload the extension
and refresh the meeting tab — the content script injects only at page load.

## Capture

Google Meet is captured by the `KNOWN` selector table plus a class-independent
avatar heuristic; Microsoft Teams by its own readers behind the `TEAMS` flag at
the top of `apps/extension/public/content.js` (plain JS, no build step). A
meeting is finished when its heartbeat is silent ≥ 15 s with ≥ 5 caption entries
and no analysis yet; the minute sweep then analyzes and files it.

## Import Zoom (and files)

Zoom is import-only — no live capture. A `.vtt`, `.srt`, Zoom transcript, or plain-text
file becomes a normal meeting (`packages/meeting/src/import.ts`); imported audio/video
needs an OpenAI-compatible speech-to-text endpoint in Settings, max 25 MB per file.

## Export to Obsidian

The Obsidian-friendly export (`packages/exporters/src/obsidian.ts`) writes Markdown
with `[[wiki-links]]`, tags, and a folder layout — the demand probe behind decision
D2; each export appends an `export.obsidian` audit event, the input to the gate below.

## Reading the §32.1 gate probe (`packages/exporters/src/gate.ts`)

G1 — export adoption: ≥ 1 Obsidian export in the 14-day window (fleet ≥ 30% of
active users). G2 — export retention: exported in week 1 and again in week 2, or
twice within week 2 (fleet ≥ 50% of G1 exporters). G3 — cross-meeting Ask:
evidence citing ≥ 2 distinct meetings, rising over 4 weeks (separate signal from
`AskResult.evidence_refs`).

No telemetry: the audit ring keeps the last 200 events in `chrome.storage`, never
uploaded — this module yields the per-device input; fleet aggregation is the desktop
gate review's job. Device numbers: `gateSummary(events, now)` + `describeGate(summary)`
from `@meetcc/exporters`; the anchor is the oldest surviving audit event, sliding
forward as ring rows are evicted (re-check week-2 slices). If neither G1 nor G3
passes in six weeks, Phase 1 scope shrinks per §32.1.

## Top 5 troubleshooting

- **Meet captions stop appearing** — Meet rotates obfuscated class names: console filter `MeetCC`, update `KNOWN` at the top of `content.js` (INSTALL.md → *When capture breaks*).
- **Google sign-in lands on a blank `127.0.0.1` page** — expected; copy the whole address bar back into the field.
- **Search / Ask misses recent meetings** — rebuild the derived index: Settings → Data & MCP → **Bangun ulang indeks**.
- **Sync server unreachable from another machine** — plain `http://` is loopback-only by design; use a TLS proxy and `https://`.
- **MCP server fails to start** — the bin is bundled, not run from source: `npm run build` first, then `node packages/mcp/dist/server.js` (smoke: `npm run smoke -w @meetcc/mcp`).
