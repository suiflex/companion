# Security Policy

## Supported versions

Meet Companion ships as a single versioned extension. Security fixes land on
the latest release only; there are no long-term support branches.

| Version                 | Supported          |
| ----------------------- | ------------------ |
| Latest `1.x` release    | :white_check_mark: |
| Any older release       | :x:                |

The current release is on the
[Releases page](https://github.com/suiflex/companion/releases). Chromium does
not auto-update an extension loaded unpacked, so please run `companion update`
and confirm the version at `chrome://extensions` before reporting. Firefox
users are updated by addons.mozilla.org automatically.

## Reporting a vulnerability

**Do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/suiflex/companion/security/advisories/new).
2. Click **Report a vulnerability** and fill out the advisory form.

If you cannot use private reporting, contact the maintainers (**@suiflex**) and
ask for a private channel before sharing any details.

Please include, where you can:

- The affected component (`apps/extension`, `content.js`, or a specific
  `packages/*` module) and the version.
- The browser and how the extension was installed (terminal installer, unpacked
  from a checkout, or the Firefox add-on).
- A description of the vulnerability and its impact.
- Steps to reproduce, a proof of concept, or the relevant configuration.
- Any suggested remediation.

Please do not include a real meeting transcript in a report. A redacted excerpt
that reproduces the problem is enough, and it keeps other people's speech out
of the advisory.

## What to expect

- **Acknowledgement** within 5 business days.
- An initial assessment and severity triage shortly after.
- Progress updates as we work on a fix, and coordination on a disclosure
  timeline. We aim to release a fix before any public disclosure.
- Credit for the reporter in the advisory, unless you prefer to remain
  anonymous.

## Scope

Meet Companion handles other people's speech and the credentials used to
process it. Reports touching these paths are especially valued:

- **Credential handling** — the AI provider API key, OAuth tokens from the
  account sign-in flows, and integration tokens for the issue tracker, sync
  endpoint or calendar.
- **Anything that widens host access** beyond the meeting platforms, or that
  causes the content script to run somewhere it should not. The extension ships
  with host access to Meet and Teams only; the broad `https://*/*` entry is
  *optional* and must be granted per endpoint by the user.
- **Transcript exfiltration** — any path that sends captured text somewhere the
  user did not configure.
- **Prompt injection from captions.** Caption text is attacker-influenceable:
  anyone in a meeting can say anything. A report showing that spoken content can
  make the extension take an action — file a tracker issue, call an endpoint,
  alter stored data — rather than merely appear in a summary, is in scope.
- **The sync server** (`packages/sync-server`): bearer token handling and
  workspace isolation between tokens.
- **Extension identity.** The manifest pins the extension id so storage survives
  a reinstall; anything that lets a different extension or page read that
  storage is in scope.

## Known limitations, by design

These are documented rather than fixed, so please do not report them as
vulnerabilities unless you can show impact beyond what is described.

- **At-rest encryption of API keys is obfuscation, not protection.** Keys are
  encrypted with AES-GCM, but the key lives in `chrome.storage.local` beside the
  data (see the note at the top of `packages/shared/src/crypto.ts`). It defends
  against a casual look at storage or an accidental export leak — not against
  anyone with full access to the browser profile. No extension can do better
  without asking the user for a passphrase.
- **Anyone with the browser profile has the transcripts.** Everything is stored
  locally and unencrypted at the profile level. That is the trade for having no
  server and no account.
- **The sync server binds `127.0.0.1` by default.** Exposing it on a LAN address
  without TLS puts the bearer token on the wire; the binary warns about this.
  Doing it anyway is a deployment choice, not a bug.
- **Your AI provider sees what you send it.** Once a transcript reaches OpenAI,
  Anthropic, Google or any endpoint you configured, it is governed by their
  terms. Choose a local provider if that matters. See
  [PRIVACY.md](PRIVACY.md).

## Out of scope

- Vulnerabilities in a third-party AI provider, issue tracker, or meeting
  platform — report those to them.
- Reports produced solely by an automated scanner, with no demonstrated impact.
- Missing hardening headers on a page the extension does not serve.

Thank you for helping keep Meet Companion and its users safe.
