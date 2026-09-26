// Building the payload the desktop vault expects out of a stored meeting.
//
// Pure on purpose: no chrome.*, no storage. What to send and when is the
// service worker's business (see `deliverToDesktop` in background.ts); this
// only decides what one delivery looks like.
import { toMarkdown } from '@meetcc/exporters/markdown';
import { participants, roomIdOf, startedAt, type Analysis, type Meeting } from '@meetcc/shared';
import type { BridgeBatch } from '@meetcc/vault';

/**
 * One delivery for `meeting`, carrying only the captions after `sent`.
 *
 * `operationId` is derived from the slice rather than random so a redelivery
 * of the same slice is recognisably the same operation: if the sent-counter
 * fails to persist, the host's own dedupe still catches the repeat instead of
 * appending those captions to the transcript a second time.
 */
export function toBridgeBatch(
  meeting: Meeting,
  sent: number,
  analysis?: Analysis | null,
  /** A manual export: carry the current summary even after the first delivery. */
  resend = false,
): BridgeBatch {
  const roomId = roomIdOf(meeting.id);
  const from = Math.max(0, sent);
  return {
    operationId: `${meeting.id}:${sent}-${meeting.entries.length}`,
    roomId,
    // same rule the meeting store uses to label a room
    platform: roomId.startsWith('tms-') ? 'teams' : 'google-meet',
    startedAt: startedAt(meeting) ?? '',
    participants: participants(meeting),
    entries: meeting.entries
      .slice(from)
      .map((e) => ({ speaker: e.speaker, text: e.text, time: e.time })),
    // Only the first delivery carries a body on its own; a sweep must not
    // overwrite the note. A manual export asks for the body to be replaced.
    ...((from === 0 || resend) && analysis ? { markdown: toMarkdown(meeting, analysis) } : {}),
    ...(resend && analysis ? { replaceBody: true } : {}),
    ...(resend && from === 0 ? { snapshot: true } : {}),
    ...(meeting.tags?.length ? { tags: meeting.tags } : {}),
  };
}
