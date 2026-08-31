# Build instructions for AMO reviewers

The reviewed files in `apps/extension/dist-firefox/` are produced by Vite and
are minified. This document reproduces them from the accompanying source
archive.

## Environment

| | |
| --- | --- |
| OS | any (built and verified on macOS 15 and Ubuntu 24.04) |
| Node.js | 22.x — the version CI uses |
| npm | 10.x, ships with Node 22 |

No other toolchain, compiler, or system package is required. The build runs
offline once `npm ci` has populated `node_modules`.

## Steps

```bash
npm ci                        # exact versions from package-lock.json
npm run build -w apps/extension
npm run pack -- firefox
```

The reviewable extension is then at `apps/extension/dist-firefox/`, and
`meetcc-extension-firefox-v<version>.zip` next to it is the same tree zipped.

## What `npm run pack -- firefox` does

`scripts/pack.mjs` copies `apps/extension/dist/` and rewrites one file,
`manifest.json`, in two ways:

- `background` becomes `{ "scripts": ["background.js"], "type": "module" }`,
  because Gecko MV3 uses an event page rather than a service worker;
- the `key` property is removed — it pins the extension id on Chromium only,
  and Firefox takes its identity from `browser_specific_settings.gecko.id`.

Nothing else differs between the Chromium and Firefox builds. No code is
generated, rewritten, or stripped for Firefox specifically.

## Where the source of each shipped file is

| Shipped file | Source |
| --- | --- |
| `background.js` | `apps/extension/src/background.ts` plus the `packages/*` it imports |
| `index.html`, `assets/*.js`, `assets/*.css` | `apps/extension/index.html`, `apps/extension/src/**` |
| `content.js` | `apps/extension/public/content.js` — plain JavaScript, shipped **verbatim**, no build step |
| `manifest.json` | `apps/extension/public/manifest.json`, patched as described above |
| `icons/*.png` | generated from `assets/brand/logo-mark.svg` by `scripts/gen-icons.mjs` |
| `icons/suiflex.svg` | `apps/extension/public/icons/suiflex.svg`, verbatim |

Third-party libraries are ordinary npm dependencies, pinned in
`package-lock.json` and bundled unmodified. The two that dominate the bundle
size are `mermaid` (diagram rendering) and `@sqlite.org/sqlite-wasm` (the local
search index); the validator warnings for `innerHTML` and the `Function`
constructor originate in those two, not in our code.

## Verifying the build yourself

```bash
npm test          # 392 unit tests
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run lint:firefox  # web-ext lint — expected: 0 errors
```

## Network behaviour

The add-on contacts no server of ours; there is none. It reaches only:

- the AI provider the user selects in Settings, and only when they request a
  summary, document or answer;
- optional endpoints the user configures (issue tracker, self-hosted sync,
  speech-to-text, Google Calendar), each behind an optional origin permission;
- `api.github.com`, once a day, to read the latest release number — no data
  about the user is sent.

There is no analytics, telemetry, or crash reporting of any kind. See
`PRIVACY.md`.

## Contact

<https://github.com/suiflex/companion/issues>
