# Contributing to Meet Companion

Thanks for your interest in Meet Companion — a browser extension that captures
meeting captions from the page and turns them into AI notes, and a desktop app
that keeps those notes in a local vault of plain Markdown files.

This guide covers how to build, test, and submit changes.

## Quick links

- **Architecture and features** — [README.md](README.md)
- **Setup, building, loading the extension** — [INSTALL.md](INSTALL.md)
- **Where the product is headed** — [docs/06-roadmap.md](docs/06-roadmap.md)
- **Security policy** — [SECURITY.md](SECURITY.md)
- **Bugs & feature requests** — [Issues](https://github.com/suiflex/companion/issues/new/choose)

## How to contribute

Start here, before opening anything:

1. **Bug or small fix** → open a pull request directly.
2. **A new AI provider, a new capture platform, or anything that changes a
   stored format** → open an
   [issue](https://github.com/suiflex/companion/issues/new/choose) first. These
   reach further than they look — a stored format in particular is a promise to
   every vault already on disk — and it is cheaper to disagree before the code
   exists.
3. **Security vulnerability** → **do not** open a public issue. Follow
   [SECURITY.md](SECURITY.md).

## The two products

This repository ships two things, and knowing which one you are touching
decides how your change is released.

| | Extension | Companion Desktop |
|---|---|---|
| Lives in | `apps/extension` | `apps/desktop` |
| Released on tag | `v1.2.3` | `v1.2.3` — the same one |
| Published to | Chrome Web Store, Mozilla Add-ons | GitHub Release installers |
| Built by | `.github/workflows/release.yml` | `.github/workflows/release-desktop.yml` |

They share one version, one tag and one `CHANGELOG.md`: a release ships both,
and a `fix(desktop):` commit bumps the number the extension carries too. What
the scope buys you is the changelog — it is the only thing that says which
product a line belongs to, so scope every user-facing commit.

**Neither product needs the other.** The extension is complete on its own. The
desktop app is complete on its own. The native-messaging bridge between them is
opt-in from both directions: off by default in the extension's settings, and a
missing host resolves to a failed send rather than a broken capture. Keep it
that way — a change that makes one require the other is a change to the product,
not to the code, and belongs in an issue first.

## Getting started

```bash
git clone https://github.com/suiflex/companion
cd companion
make install
```

**For the extension:**

```bash
make dev            # dev server
make build          # bundle -> apps/extension/dist/
```

Then load it: `chrome://extensions` → Developer mode → **Load unpacked** →
`apps/extension/dist/`. After every build, reload the extension and refresh the
meeting tab.

**For the desktop app:**

```bash
make tauri-dev      # run it with a window, hot reload
make tauri          # release binary
make tauri-bundle   # release binary + installers (.app/.dmg, .msi, .AppImage)
```

The vault lands at `~/Companion`, created the first time the app runs. It is a
plain folder of `.md` files: open it in any editor, copy it, back it up like any
other folder.

Full setup, including the sync server, the MCP server and the native-messaging
host, is in [INSTALL.md](INSTALL.md).

## Build, lint, test

Everything goes through the Makefile. It is the interface; `package.json` and
cargo are the implementation, and documentation that names them instead is
documentation that will quietly rot. Run `make help` for the full list.

```bash
make test            # vitest, whole monorepo
make test-vault      # just the vault package
make typecheck       # tsc --noEmit — the authority on types, not eslint
make lint            # eslint
make rust-fmt        # cargo fmt --check   (rust-fmt-fix applies it)
make rust-lint       # clippy, warnings are errors
make rust-check      # cargo check, with and without the wdio feature
make build           # bundle extension, MCP, sync-server
make smoke           # native host: framing + dedupe over stdio
make check-all       # every linter and typechecker, no tests
make ci              # all of the above — the gate
```

**Run `make ci` before opening a pull request.** CI runs the same target, so a
green local run means a green pipeline.

### What CI covers

`ci.yml` runs two jobs. `verify` runs `make ci-js` — typecheck, lint, tests, the
extension bundle and all three smokes. `desktop` runs `make ci-rust` — format,
clippy, and `cargo check` twice, the second pass with the test-only `wdio`
feature that a release build compiles out.

The desktop job always reports but only does the work when the diff touches
`apps/desktop`, `packages/vault` or the build configuration. `packages/vault` is
on that list because the desktop depends on it.

Not covered by CI, and worth running yourself when you touch them: the AMO
submission (`make sign-firefox`, needs credentials), a full `make tauri-bundle`
on each platform, and the desktop regression suite, which needs a binary built
with `--features wdio`.

### Things worth knowing before you lose an afternoon to them

- **`KNOWN` in `apps/extension/public/content.js` rots on its own schedule.**
  Google Meet rotates its obfuscated class names every few months and capture
  stops. Filter the console for `MeetCC`; [INSTALL.md](INSTALL.md) has the
  procedure. There is a class-independent avatar heuristic as a fallback, which
  is why capture usually degrades rather than dies.
- **`--features wdio` must never reach a release build.** It runs a WebDriver
  server inside the app. It is a cargo feature rather than a `debug_assertions`
  check precisely so an ordinary `make tauri-dev` does not open a port on your
  machine. `make rust-check` builds both ways so the feature cannot rot, but
  nothing else should ever pass it.
- **The desktop test suite drives the real window**, not a mock, so it needs
  that `wdio` build and it will happily talk to whatever is already listening on
  port 4445. If results look impossible, check for a stale app process first.
- **`packages/vault` is shared.** The extension's bridge, the native host and
  the desktop app all read it. A change there that looks local is not.

## Commit conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/); the
`release-please` workflow parses them to drive the changelogs and version bumps.

- Types: `feat`, `fix`, `perf`, `chore`, `refactor`, `docs`, `test`, `build`, `ci`.
- Scope the change to the area it touches — `feat(desktop):`, `fix(vault):`,
  `fix(capture):`. The scope is what tells a reader which product moved.
- Subject line ≤ 72 chars, imperative mood, no trailing period.
- Wrap the body at 72 chars and explain **why** the change exists — the diff
  already shows the what.
- One logical change per commit. Each commit should leave the tree in a
  buildable, testable state so `git revert` stays safe.
- Do **not** hand-edit the `release-please`-managed sections of either
  changelog: [CHANGELOG.md](CHANGELOG.md) for the extension,
  [apps/desktop/CHANGELOG.md](apps/desktop/CHANGELOG.md) for the desktop.

## Branching & pull requests

- Branch off `develop` using a name that matches the leading commit type:
  `feat/…`, `fix/…`, `refactor/…`, `chore/…`, `docs/…`.
- Fill out the pull request template (Summary / Changes / Test plan).
- Keep PRs focused on one logical change — smaller PRs are easier to review and
  easier to revert.
- Fill the test plan honestly: tick what you actually ran, leave the rest
  unchecked. An unchecked box is information; a wrongly ticked one wastes a
  review cycle.
- Make sure `make ci` passes locally first.

A bot labels each PR with the areas it touches, from the path map in
[`.github/labeler.yml`](.github/labeler.yml). If you add a workspace, add it
there too — nothing checks that the two stayed in sync.

### AI-assisted pull requests

AI-assisted PRs are welcome — plenty of good contributions start that way. We
don't ask you to label them. We do ask for two things:

- **Evidence.** Say which commands you ran and what they produced. "`make ci`
  passes" is enough for most changes; if you touched capture, say which meeting
  platform you tried it against, because no test in this repository can.
- **Understand what you're submitting.** If a reviewer asks why a line is there,
  you should be able to answer. PRs whose author cannot are the ones that stall.

## Testing the desktop app end to end

Our sibling project [`suiflex/suitest`](https://github.com/suiflex/suitest) can
drive Companion Desktop through the WebDriver server the app embeds under
`--features wdio`, which is how the regression suite in `tests/desktop/` runs.

Entirely optional — it is not required to contribute, nothing in CI depends on
it, and no PR is held up for lacking it.

## Reporting bugs & requesting features

Use the issue forms under **Issues → New issue**. Security vulnerabilities must
**not** be filed as public issues — see [SECURITY.md](SECURITY.md).

## License

The project is licensed under the [Apache License 2.0](LICENSE). By
contributing, you agree that your contributions are licensed under the same
terms.
