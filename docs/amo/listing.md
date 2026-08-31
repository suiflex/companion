# AMO listing copy

Paste-ready text for the listed submission at
<https://addons.mozilla.org/en-US/developers/addon/f24270123c6340a8a023/edit>.
Kept in the repo so it is reviewed like anything else and does not drift from
what the add-on actually does.

## Name

```
Meet Companion
```

## Summary

*AMO limit: 250 characters. This is 196.*

```
Turns the captions Google Meet and Microsoft Teams already show into AI meeting
notes: summary, decisions, action items, risks. Everything stays local except
what you send to your own AI provider.
```

## Description

```
Meet Companion reads the captions your meeting already displays and turns them
into notes you can actually use.

WHAT YOU GET
• Executive summary and a timeline of what was discussed
• Decisions, with the moment each one was made
• Action items, detected while the meeting is still running
• Risks and open questions
• A weekly digest across meetings
• Ask questions of one meeting, or of your whole archive
• Export as Markdown or PDF

WHERE IT WORKS
• Google Meet — live capture
• Microsoft Teams — live capture
• Zoom — import an exported transcript or an audio file

YOUR AI PROVIDER, YOUR CHOICE
Bring your own: OpenAI, Anthropic, Google Gemini, OpenRouter, Azure OpenAI, or
sign in with a ChatGPT or Google account. Prefer nothing to leave the machine?
Point it at Ollama, LM Studio, or any OpenAI-compatible endpoint you run
yourself.

PRIVACY
There is no account, no server of ours, and no telemetry — none, of any kind.
Captures, the searchable archive and the notes all stay in local browser
storage. The only thing that leaves is the transcript you send to the provider
you picked, when you ask for a summary. Choose a local provider and nothing
leaves at all.

The add-on requests no blanket host access. It reads Meet and Teams and nothing
else. Integrations you enable — an issue tracker, your own sync server, Google
Calendar — each ask for their own origin at the moment you configure them.

Nothing is deleted behind your back either: retention is off by default, and
you opt in to a 30, 90 or 365 day window if you want one.

OPEN SOURCE
https://github.com/suiflex/companion
```

## Categories

Primary: **Productivity & Time Management** — the notes are the product.
Secondary: **Other**.

## Tags

`meetings`, `transcript`, `ai`, `notes`, `google-meet`, `microsoft-teams`,
`productivity`

## Support

| Field | Value |
| --- | --- |
| Support site | `https://github.com/suiflex/companion` |
| Support email | leave blank — issues are the channel |

## Privacy policy

Paste the rendered text of `PRIVACY.md` into the privacy policy field. AMO
requires the text in the field itself; a link alone is not accepted.

## Data collection disclosure

Declared in the manifest as `data_collection_permissions.required:
["personalCommunications"]`, so the form should already reflect it. Meeting
captions are other people's speech — that is the honest answer, and it is what
Firefox shows the user at install time.

## Notes for the reviewer

```
Build instructions are in REVIEWERS.md in the source archive. Node 22 + npm ci,
then `npm run build -w apps/extension && npm run pack -- firefox`. The result is
byte-identical to the submitted package.

The submitted files are a Vite bundle, hence the source archive. The two large
third-party libraries are mermaid (diagram rendering) and @sqlite.org/sqlite-wasm
(the local search index); the innerHTML and Function-constructor warnings the
validator reports originate in those, not in our code.

There is no server operated by us and no account system. The extension talks
only to the AI endpoint the user configures, plus api.github.com once a day for
a version number.
```

## Screenshots

**Optional, not a blocker.** Sampling the 50 most recently created listed
extensions on AMO, 40 shipped with none. They are a listing-quality item: the
public page just shows the icon and description without them.

Worth adding later, at 1280x800 from the dedicated profile:

1. Dashboard with a finished meeting — summary tab
2. Transcript tab with speakers attributed
3. Action items / decision log
4. Settings showing the provider picker, with a local provider selected

## What actually blocks the submission

| Item | Status |
| --- | --- |
| Name, summary, description, category, license | drafted above — needs pasting into the form |
| Privacy policy text | `PRIVACY.md`, paste the rendered text into the field |
| Source archive | `npm run pack:source`, uploaded by CI |
| Build instructions | `REVIEWERS.md`, inside the archive |
| Screenshots | not required |
