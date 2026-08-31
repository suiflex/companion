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

Everything the API can write has been written. Verified by reading it back:

| Field | State |
| --- | --- |
| `slug` | `meet-companion` |
| `summary` | set, 196 chars |
| `description` | set, 1791 chars as stored |
| `categories` | `["social-communication"]` |
| `tags` | `["google"]` |
| `privacy_policy` | set, 5805 chars |
| `previews` | 2 screenshots, one caption still missing |
| `support_url` | **empty — the one thing left to do by hand** |
| licence | set by CI at submission — the form does not exist yet |
| `status` | `incomplete`, until a listed version is submitted |

Two gotchas the API taught us, both 400s on the first try:

- `other` cannot be combined with another category. It is an only-child.
- Tags come from a fixed vocabulary of 42 words. `meetings`, `transcript` and
  `productivity` are not among them; `google` is the only accurate fit.

Preview uploads and caption edits are aggressively rate-limited — expect to
wait between calls, and a repeat offender gets a multi-minute cooldown.

## Step 0 — rename the slug (done via API)

The slug is `f24270123c6340a8a023`, auto-generated because the add-on has only
ever been unlisted. It is in the public URL and in every signed filename.

Developer Hub → **Edit Product Page** → **Describe Add-on** → *Edit* →
**Add-on URL** → `meet-companion`.

Nothing in this repo breaks when you change it: the installer addresses the
add-on by id (`companion@suiflex.dev`), and AMO redirects id → slug. Verified
against a live add-on: both forms return 200.

## Step 1 — Summary (done via API)

Replace what is there. AMO limit is 250 characters; this is 196.

## Step 2 — Description (done via API)

Paste the block below. AMO renders a limited Markdown — plain paragraphs and
bullet characters survive, headings do not, which is why the block uses
capitals for section labels.

## Step 3 — Categories (done via API)

In the same **Describe Add-on** form. AMO has exactly 15 extension categories,
and none of them is a "Productivity" one — that is a Chrome Web Store category,
not a Mozilla one. The full list, from the AMO API:

```
feeds-news-blogging   web-development      download-management  privacy-security
search-tools          appearance           bookmarks            language-support
photos-music-videos   social-communication alerts-updates       other
tabs                  shopping             games-entertainment
```

Pick **Social & Communication** (`social-communication`) as primary — a meeting
tool is communication tooling — and **Other** (`other`) as secondary.

## Step 4 — Support and homepage

In **Additional Details** → *Edit*.

| Field | Value |
| --- | --- |
| Homepage | already `https://suiflex.dev` — leave, or change to the repo |
| Support site | `https://github.com/suiflex/companion/issues` |
| Support email | leave blank; issues are the channel |
| Tags | `meetings`, `transcript`, `productivity` |

## Step 5 — License — cannot be done yet, and CI does it

This is the one that looks missing on the Developer Hub. It is not hidden and
it is not under a differently-named menu: the form does not exist yet.

From `devhub/views.py`:

```python
license_form = forms.LicenseForm(post_data, version=addon.current_version)
if ctx['license_form']:  # if addon has a version
```

`current_version` means the current *listed* version. This add-on has only an
unlisted 1.5.1, so `current_version` is null and the licence form never
renders. The page at `/developers/addon/meet-companion/ownership` shows authors
and the privacy policy, and nothing else.

The licence belongs to a version, not to the add-on, and it is set when a
listed version is submitted. CI does that: `docs/amo/amo-metadata.json` carries

```json
{ "version": { "license": "Apache-2.0", "approval_notes": "…" } }
```

and `web-ext sign --amo-metadata` merges it into the version being submitted —
verified in `web-ext/src/util/submit-addon.js`, where the JSON is spread into
the PUT body and `.version` is merged into the version object. The slug
`Apache-2.0` is from addons-server's `constants/licenses.py`.

So there is nothing to click. Once v1.6.0 is submitted, the licence is set and
the form appears on the ownership page for later edits.

## Step 7 — Notes for the reviewer — also automatic

Same file, `version.approval_notes`. Only Mozilla reviewers see it.

## Which fields the API can write, and which it cannot

The AMO `PATCH /api/v5/addons/addon/{guid}/` endpoint accepts `slug`, `summary`,
`description`, `categories`, `tags`, `homepage`, `support_email`,
`developer_comments`. It does **not** accept `support_url` — that is the only field left that has to
be typed into the web form. `privacy_policy` has its own endpoint
(`PATCH .../eula_policy/`) and is already set; the licence rides along with the
version submission.

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
Apache 2.0 — https://github.com/suiflex/companion
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
