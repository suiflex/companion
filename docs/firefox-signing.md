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
3. Put them in the repo's `.env` (gitignored) or your shell profile:

   ```bash
   export WEB_EXT_API_KEY="user:12345:67"
   export WEB_EXT_API_SECRET="…"
   ```

   `web-ext` reads both from the environment; nothing is passed on the command
   line, so the secret never lands in shell history.

The add-on id is `companion@suiflex.dev`, set in
`apps/extension/public/manifest.json` under `browser_specific_settings.gecko`.
The first signed upload registers that id to your AMO account — after that
only that account can sign it, so use the project account, not a personal one.

## Signing

```bash
npm run build
npm run sign:firefox
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

Once the manual run works, add `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` to the
repository secrets and a step to `.github/workflows/build.yml` that runs only
on a tag push and only when the secret is present, so forks and pull requests
are unaffected:

```yaml
- name: Sign the Firefox build
  if: startsWith(github.ref, 'refs/tags/v') && env.WEB_EXT_API_KEY != ''
  env:
    WEB_EXT_API_KEY: ${{ secrets.AMO_JWT_ISSUER }}
    WEB_EXT_API_SECRET: ${{ secrets.AMO_JWT_SECRET }}
  run: npm run sign:firefox
```

then add `web-ext-artifacts/*.xpi` to the `files:` list of the release step.

## Auto-update, once signing is in CI

Signed and self-hosted means Firefox can update itself, which Chromium cannot
do for this install shape. Add to the manifest's `gecko` block:

```json
"update_url": "https://suiflex.github.io/companion/updates.json"
```

and publish an `updates.json` listing each version and the `.xpi` URL from its
release:

```json
{
  "addons": {
    "companion@suiflex.dev": {
      "updates": [
        { "version": "1.6.0", "update_link": "https://github.com/suiflex/companion/releases/download/v1.6.0/companion-1.6.0.xpi" }
      ]
    }
  }
}
```

Firefox polls it on its own schedule. Chromium users keep the in-app banner
and `companion update` instead.
