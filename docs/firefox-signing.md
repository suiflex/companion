# Signing the Firefox build

Firefox has no `--load-extension`. A Firefox install that survives a restart
has to be a `.xpi` signed by Mozilla, and signing is also the only way
`update_url` auto-update works. This is the walkthrough for doing it by hand;
once it has worked once, the same two commands move into CI.

We sign **unlisted** (self-distribution): no review queue, not listed on
addons.mozilla.org, but installable in stock release Firefox. Only the
signature is Mozilla's — distribution stays on our GitHub Releases.

## One-time setup

1. Create an account on <https://addons.mozilla.org>.
2. Generate API credentials at
   <https://addons.mozilla.org/en-US/developers/addon/api/key/>. You get a
   **JWT issuer** (`user:12345:67`) and a **JWT secret**. The secret is shown
   once.
3. Copy `.env.example` to `.env` (gitignored) and fill both values in:

   ```bash
   cp .env.example .env && chmod 600 .env
   ```

   Then load it for the signing command only:

   ```bash
   set -a; . ./.env; set +a
   make sign-firefox
   ```

   `web-ext` reads both from the environment; nothing is passed on the command
   line, so the secret never lands in shell history or in `ps` output.

   A version number is signable **once per add-on, forever**. Treat every
   upload as spending that number.

The add-on id is `companion@suiflex.dev`, set in
`apps/extension/public/manifest.json` under `browser_specific_settings.gecko`.
The first signed upload registers that id to your AMO account — after that
only that account can sign it, so use the project account, not a personal one.

## Checking the package before you upload

```bash
make build
make lint-firefox
```

Mozilla's validator has to report **0 errors**. The warnings it does report all
come from bundled vendor code (mermaid's `innerHTML`, sqlite-wasm's `Function`
constructor) and do not block an unlisted signature, which is automated and
skips human review.

The manifest declares `data_collection_permissions.required:
["personalCommunications"]` — captions are other people's speech, and Firefox
shows that to the user at install time. `strict_min_version` is `142.0`, the
first release supporting that key on both desktop and Android.

## Signing

```bash
make sign-firefox
```

That packs `apps/extension/dist-firefox` (the Gecko-patched manifest, see
`scripts/pack.mjs`) and uploads it. The signed file lands in
`web-ext-artifacts/`. First run takes a few minutes while Mozilla's validator
runs; later runs are quicker.

A version number can only be signed **once**. Re-signing the same version
fails with `Version already exists` — bump the version and try again.

## Verifying

1. Start a clean profile: `firefox -profile /tmp/ff-check -no-remote`
2. Open the `.xpi` from that window (`file:///…/web-ext-artifacts/…xpi`) and
   click **Add**.
3. `about:debugging#/runtime/this-firefox` → the extension id reads
   `companion@suiflex.dev`.
4. Quit Firefox, start it again with the same `-profile`, and confirm the
   extension is still there. This is the step that distinguishes a signed
   install from a temporary one.
5. Join a `meet.google.com` call and confirm captions reach the transcript.

## Moving it to CI

`.github/workflows/build.yml` does this on a tag push, using the repository
secrets `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` — the same names `web-ext`
reads from the environment, so nothing has to be renamed:

```yaml
- name: Submit the Firefox build to AMO
  if: startsWith(github.ref, 'refs/tags/v') && env.WEB_EXT_API_KEY != ''
  env:
    WEB_EXT_API_KEY: ${{ secrets.WEB_EXT_API_KEY }}
    WEB_EXT_API_SECRET: ${{ secrets.WEB_EXT_API_SECRET }}
  run: npx web-ext sign --channel=listed ... --amo-metadata ... --upload-source-code ...
```

The `env.WEB_EXT_API_KEY != ''` guard means a fork, where the secret is absent,
still gets its artifacts from a tag build instead of a failed run.

`--upload-source-code` takes the archive from `npm run pack:source`. AMO
requires it because the reviewed files are a Vite bundle; `REVIEWERS.md`
rebuilds the exact tree from it.

`--amo-metadata docs/amo/amo-metadata.json` carries the licence
(`Apache-2.0`) and the reviewer notes on the version itself. That is the only
way to set the licence before a listed version exists: the Developer Hub's
licence form only renders once the add-on has a listed `current_version`, so
until the first submission there is no box to fill in.

## Listed versus unlisted

The first signature, 1.5.1, went to the **unlisted** channel: no review queue,
signed in seconds, but invisible on addons.mozilla.org and self-distributed.

From 1.6.0 the submission is **listed**: it appears in AMO search, users install
with one click, and AMO handles updates. That is why `companion install` opens
the add-on's AMO page for Firefox rather than downloading anything, and why
there is no `updates.json` to host.

A listed submission enters Mozilla's review queue, so a release is not
immediately installable from AMO the way the Chromium zip is immediately
downloadable.

## Auto-update

Handled by AMO for a listed add-on — there is no `update_url` to set and no
`updates.json` to host. Chromium users get the in-app banner and
`companion update` instead, because Chromium cannot auto-update an unpacked
extension at all.
