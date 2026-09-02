# Meet Companion

MV3 Chrome extension that captures meeting captions from the DOM and turns them
into AI notes. Architecture and features live in `README.md`, setup and build
steps in `INSTALL.md` — this file only carries what neither says.

## Commands

```bash
npm test                # vitest, whole monorepo
npm run typecheck       # tsc --noEmit — the authority on types, not eslint
npm run lint            # eslint
npm run build           # typecheck + bundle extension, MCP, sync-server
npm run smoke -w @meetcc/mcp          # built MCP bin answers over stdio
npm run smoke -w @meetcc/sync-server  # built sync bin answers over HTTP
```

After every build: reload the extension at `chrome://extensions`, then refresh
the meeting tab. Load unpacked from `apps/extension/dist/`.

The brand mark is `assets/brand/logo-mark.svg`; `scripts/gen-icons.mjs`
re-renders it into the extension's PNGs (16/32/48/96/128) and has to be re-run
when it changes. 32 and 96 exist for Firefox, which uses them for the toolbar
button and the add-ons list; Chromium ignores them.

## Layout

npm workspaces: `apps/{extension,desktop}` and `packages/{shared,ai,meeting,store,mcp,sync-server,exporters}`.

React lives only in the `apps/*` frontends — `apps/extension/src` (MV3 UI) and
`apps/desktop/src` (Tauri desktop shell). Capture, orchestration and every
`packages/*` module stay framework-free — do not pull React or DOM libraries
into them.

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

## Conventions

- Tests are colocated: `foo.ts` next to `foo.test.ts`. No separate test tree.
- `platform` is a free-form TEXT column in `packages/store/src/schema.ts` —
  adding a platform needs no migration, but it is derived from the meeting-id
  prefix in `store.ts`, not from a URL.
- Prefer the existing dependency set. New deps need a reason.
- An AI provider is one adapter in `packages/ai/src/providers.ts` plus one row in
  `PROVIDER_PRESETS`; `packages/ai/src/oauth.ts` is pure protocol and must stay
  free of `chrome.*` and storage calls.

# ForgeGuard

For code changes, use `/forgeguard-engineering`.
