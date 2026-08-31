# Privacy Policy — Meet Companion

Last updated: 2026-08-31

Meet Companion captures the captions your meeting platform already displays and
turns them into notes. This document describes exactly what it stores, what
leaves your machine, and what you control.

## What it collects

**Meeting captions.** On `meet.google.com` and Microsoft Teams, the extension
reads the caption text the page is already showing, along with the speaker name
the platform attaches to it and the time it appeared. It never records audio or
video and never opens your microphone or camera — it has no permission to, and
calls no API that could.

**A transcript or audio file you import yourself.** For a platform with no live
capture (Zoom), you can hand it an exported transcript, or an audio file. Audio
cannot be transcribed on the machine, so it is sent to the speech-to-text
endpoint you configured — there is no default endpoint, and with none set the
audio simply stays where it is.

Captions are other people's speech. That is why the add-on declares
`personalCommunications` as a required data collection permission: Firefox
shows you that at install time rather than burying it here.

**What you type.** Meeting titles you edit, questions you ask, and decisions you
log.

**Your settings.** Which AI provider you chose, its model and base URL, and any
API key or sign-in token for it.

There is **no analytics, telemetry, crash reporting, or usage tracking** of any
kind. No identifier is assigned to you, and nothing is sent to the authors.

## Where it is stored

On your machine only, in the browser's own extension storage
(`chrome.storage.local`), with a local SQLite index for search. Nothing is
uploaded to a server operated by the authors, because there is no such server.

API keys and integration tokens are encrypted at rest before being written to
storage.

## What leaves your machine

**The transcript you send to your AI provider.** This is the one substantive
transfer, it happens only when you ask for a summary, a document, or an answer,
and it goes to the provider *you* selected in Settings:

| You chose | Where the transcript goes |
| --- | --- |
| OpenAI, ChatGPT, Google Gemini, Google Code Assist, Anthropic, OpenRouter, Azure OpenAI | that company's API |
| Ollama, LM Studio, any custom OpenAI-compatible endpoint | wherever you pointed it, including your own machine |
| Built-in (Chrome AI) | nowhere — the model runs in the browser |

Once the text reaches a third-party provider it is governed by that provider's
privacy policy, not this one. If you do not want any transcript to leave your
machine, choose a local provider.

**Optional integrations, only if you enable them.** An issue tracker (to file
action items), a sync endpoint you host yourself, a speech-to-text endpoint (for
an audio file you import), and Google Calendar. Each is requested as an optional permission for its own origin
when you save Settings — decline it and only that integration stops working.

**A version check.** Once a day the extension asks
`api.github.com` for the latest release number. The request carries no data
about you, your meetings, or your settings.

## Permissions, and why

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | keep transcripts locally without the default 10 MB cap |
| host access to Meet and Teams | read captions on those pages, and nowhere else |
| `tabs` | notice when a meeting tab opens or closes |
| `alarms` | run the periodic sweep and the daily version check |
| `notifications` | tell you when notes are ready |
| `identity` | sign in to a provider that uses an account instead of an API key |
| optional host access | only the provider, tracker, sync or calendar endpoint you configure |

Two notes on the optional host access, because it is written broadly in the
manifest as `https://*/*`. It is *optional*: nothing is granted until you save a
setting that needs it, and Firefox asks you at that moment. It is written
broadly because the endpoint is yours to name — a self-hosted model, your
company's Azure deployment, your own sync server — and the add-on cannot know
those hosts in advance. It is used only to reach the endpoint you entered.

Granted or not, sites other than your meeting platform are never read, and no
content script runs anywhere but Meet and Teams.

## Retention and deletion

Nothing is deleted automatically unless you ask for it. Settings → **Simpan
riwayat** turns on a retention window of 30, 90 or 365 days, after which
meetings past that age are removed along with their transcript, notes, chat and
documents. You can also delete any single meeting. Deletion is immediate and
cannot be undone, so both actions ask for confirmation.

Uninstalling the add-on removes its local storage, and with it everything above.

## Children

Meet Companion is a workplace tool and is not directed at children.

## Changes

Material changes to this policy will be noted in `CHANGELOG.md` and in the
release notes for the version that carries them.

## License

Meet Companion is open source under the Apache License 2.0. The full source of
every released version is at <https://github.com/suiflex/companion>, so any
claim in this document can be checked against the code.

## Contact

Questions, or a request about your data:
<https://github.com/suiflex/companion/issues>
