<!--
Title: conventional-commits style, ≤ 70 chars, no trailing period.
release-please reads these — feat: and fix: become CHANGELOG entries and decide
the next version, so pick the type deliberately.
e.g. feat(installer): offer firefox in the browser picker
e.g. fix(meeting): keep concurrent transcripts apart
Keep the PR focused — one logical change is easier to review and revert.
-->

## Summary

<!-- 1–3 bullets on the WHY: the problem this solves or the need it fills. -->

-

## Changes

<!-- What actually changed, grouped by area (extension / packages / scripts / ci / docs). -->

-

## Test plan

<!-- Check what you ran; leave unchecked what still needs doing. -->

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Reloaded at `chrome://extensions`, refreshed the meeting tab, and checked
      the change in a real meeting
- [ ] Manual verification steps (describe them):

## Screenshots

<!--
Touching apps/extension/src? Attach a before/after image or a short clip — drag
it straight into this box. Nothing else in a pull request shows a visual
change: the diff and the test output both stay silent about it.

No UI change (packages/, scripts/, ci, docs)? Delete this section.
-->

## Capture changes

<!--
Touching public/content.js or the KNOWN selector table? Say which platform and
which build of Meet or Teams you verified against — those selectors rot on
their own schedule and a green test suite proves nothing about them.

Otherwise delete this section.
-->

## Notes for reviewers

<!-- Optional: trade-offs, follow-ups, anything risky. -->
