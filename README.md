# Meet Companion — AI Meeting Assistant

Chrome extension (Manifest V3) that captures Google Meet captions from the DOM, then automatically generates AI meeting notes: executive summary, timeline, decisions, action items, risks, open questions — exportable as Markdown and PDF.

## Monorepo

```
apps/
  extension/            # MV3 extension: React UI, service worker, content script
packages/
  shared/               # domain types, storage layer, crypto (AES-GCM), audit log
  ai/                   # provider adapters (strategy), prompt + parsing, rate limit
  meeting/              # pipeline (DI, pure business logic), end-of-meeting detection
  exporters/            # markdown + pdf generators (pure)
scripts/gen-icons.mjs   # icon generation
```

One repository, one build — no microservices. UI is React 18 + TypeScript + Vite; capture and orchestration stay framework-free.

## Develop

```bash
npm install
npm test                # vitest — 39 tests
npm run test:coverage   # v8 coverage (packages ~96%)
npm run build           # typecheck + bundle -> apps/extension/dist/
```

Load: `chrome://extensions` → Developer mode → **Load unpacked** → **`apps/extension/dist/`**.
After every build: reload the extension, then refresh the Meet tab.

## How it works

1. **Capture** (`content.js`): polls Meet's caption DOM (selector table + class-independent avatar heuristic), stores `transcript:<id>` entries `{speaker, avatar, text, time}`, heartbeats `meta:<id>` every 5s while in-call. Auto-enables CC; badge opens an always-on-top PiP transcript.
2. **Detect** (`background.js` + `@meetcc/meeting`): alarm sweeps every minute; a meeting whose heartbeat went silent ≥15s with ≥5 entries and no analysis is "finished".
3. **Analyze** (`@meetcc/ai`): one structured-JSON completion → validated `Analysis`. Retry on transient failures, rate-limited (6 runs / 10 min).
4. **Deliver**: record saved (`analysis:<id>`), UI updates via storage events, Chrome notification fires. Markdown/PDF generated on demand (PDF code-split, lazy-loaded).

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

## When capture breaks

Meet rotates obfuscated class names every few months. Console (filter `MeetCC`) dumps the caption container when nothing matches. Update `KNOWN` at the top of `apps/extension/public/content.js` (2026-07: block `.nMcdL`, speaker `.KcIKyf`, text `.ygicle`). The avatar-anchored heuristic usually keeps capture alive meanwhile.
