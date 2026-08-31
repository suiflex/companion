# AMO listing — what to fill in, in order

Everything needed to take the add-on from `incomplete` to a published listing.
Kept in the repo so the copy is reviewed like anything else and does not drift
from what the add-on actually does.

Two pages you will use:

| | |
| --- | --- |
| Edit listing | <https://addons.mozilla.org/en-US/developers/addon/f24270123c6340a8a023/edit> |
| Manage authors, slug, versions | same page, tabs down the left |

## Current state (checked via the AMO API)

| Field | State |
| --- | --- |
| `name` | filled — "Meet Companion", taken from the manifest |
| `summary` | filled — the manifest description; replace with the copy below |
| `homepage` | filled — `https://suiflex.dev` |
| `contributions_url` | filled — GitHub Sponsors |
| `icon_url` | **placeholder** — resolves once a listed version is published |
| `description` | **empty** |
| `categories` | **empty** |
| `support_url` | **empty** |
| `privacy_policy` | **empty** |
| `tags`, `previews` | empty, both optional |

`status` is `incomplete`, which is what an unlisted-only add-on reads as. It
flips once a listed version is submitted with the listing filled in.

---

## Step 0 — rename the slug (do this first)

The slug is `f24270123c6340a8a023`, auto-generated because the add-on has only
ever been unlisted. It is in the public URL and in every signed filename.

Edit page → **Add-on Details** → *Edit* → **URL slug** → `meet-companion`.

Nothing in this repo breaks when you change it: the installer addresses the
add-on by id (`companion@suiflex.dev`), and AMO redirects id → slug. Verified
against a live add-on: both forms return 200.

## Step 1 — Summary

Replace what is there. AMO limit is 250 characters; this is 196.

## Step 2 — Description

Paste the block below. AMO renders a limited Markdown — plain paragraphs and
bullet characters survive, headings do not, which is why the block uses
capitals for section labels.

## Step 3 — Categories

Pick **one** primary. Firefox extension categories on AMO are a fixed list;
the one that fits is **Productivity & Time Management**. Add **Other** as a
second if the form lets you.

## Step 4 — Support and homepage

| Field | Value |
| --- | --- |
| Homepage | already `https://suiflex.dev` — leave, or change to the repo |
| Support site | `https://github.com/suiflex/companion/issues` |
| Support email | leave blank; issues are the channel |

## Step 5 — License

**This is the one decision that is not drafted for you.** The repo currently
has no LICENSE file, no `license` field in `package.json`, and GitHub reports
no license — so there is nothing to copy from. AMO requires a choice for a
listed add-on.

Whatever you pick, add a matching `LICENSE` file to the repo in the same pass,
so the two do not disagree.

## Step 6 — Privacy policy

The form has a **Privacy Policy** field. Paste the rendered text of
`PRIVACY.md` into it — AMO wants the text in the field, a link alone is not
accepted.

Tick the "This add-on has a privacy policy" box first, or the field stays
hidden.

## Step 7 — Notes for the reviewer

A separate box on the version submission screen, not the listing page. Text is
at the bottom of this file.

## Step 8 — Submit the version

Do **not** upload by hand. Tag a release and CI does it:

```
release-please prepares the PR  ->  merge it  ->  tag v1.6.0 pushed
  ->  build.yml packs the source archive
  ->  web-ext sign --channel=listed --upload-source-code
  ->  the version enters Mozilla's review queue
```

1.5.1 is already spent on the unlisted channel, so the listed submission is
1.6.0 — which is also the first build with a working toolbar icon.

## Step 9 — After submitting

Watch the versions page. A listed submission is queued for human review; the
duration is not something anyone can promise. If it is rejected, the reply says
why, and the fix ships as the next version — a rejected version number cannot
be reused.

---

# Paste buffer

The exact text each step above refers to.

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
