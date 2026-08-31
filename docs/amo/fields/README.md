# Paste buffers

One file per AMO form field, so filling the listing is a copy command rather
than a hand-selection out of a Markdown document.

```bash
pbcopy < docs/amo/fields/summary.txt          # macOS
xclip -sel c < docs/amo/fields/summary.txt    # Linux
```

Generated from `../listing.md` and `../../PRIVACY.md` — edit those, not these.

Reviewer notes are not here: they go to AMO with the submission itself, via
`../amo-metadata.json`, which CI passes to `web-ext sign --amo-metadata`.
