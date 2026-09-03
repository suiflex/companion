# Meet Companion

MV3 Chrome extension that captures meeting captions from the DOM and turns them
into AI notes. Architecture and features live in `README.md`, setup and build
steps in `INSTALL.md` — this file only carries what neither says.

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

npm workspaces: `apps/{extension,desktop}` and
`packages/{shared,ai,meeting,store,vault,mcp,sync-server,exporters}`.

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

## Releases

The extension and the desktop app share one version, one tag (`vX.Y.Z`) and one
`CHANGELOG.md`; release-please bumps `apps/extension` and `apps/desktop`
together from the root package. Which product a change belongs to comes from the
commit scope — `feat(desktop):`, `fix(extension):` — which is what separates
them in the changelog, so scope every user-facing commit.

CI renames the desktop bundles to `companion-desktop-<target-triple>.<ext>`
before upload. `.github/scripts/updater_manifest.py` matches those names
exactly, so a change to either side needs the other; its `--selftest` says so.

# ForgeGuard

For code changes, use `/forgeguard-engineering`.
