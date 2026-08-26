# Meet Companion

MV3 Chrome extension that captures meeting captions from the DOM and turns them
into AI notes. Architecture, features and setup live in `README.md` — this file
only carries what the README does not say.

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

## Layout

npm workspaces: `apps/extension` and `packages/{shared,ai,meeting,store,mcp,sync-server,exporters}`.

React lives only in `apps/extension/src`. Capture, orchestration and every
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
capture breaks, filter the console for `MeetCC` and update it; README has the
procedure. Both `manifest.json` and `content.js` must agree on hosts.

## Conventions

- Tests are colocated: `foo.ts` next to `foo.test.ts`. No separate test tree.
- `platform` is a free-form TEXT column in `packages/store/src/schema.ts` —
  adding a platform needs no migration, but it is derived from the meeting-id
  prefix in `store.ts`, not from a URL.
- Prefer the existing dependency set. New deps need a reason.

# ForgeGuard

For code changes, use `/forgeguard-engineering`.
