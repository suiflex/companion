import { describe, expect, it } from 'vitest';
import type { Meeting } from '@meetcc/shared';
import { toBridgeBatch } from './bridgeBatch';

const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: 'abc-defg-hij#1787918400000',
  meta: { id: 'abc-defg-hij#1787918400000', startedAt: '2026-08-28T14:00:00+07:00', lastSeenAt: '2026-08-28T15:00:00+07:00' },
  entries: [
    { speaker: 'Andi', text: 'baris satu', time: '2026-08-28T14:01:00Z' },
    { speaker: 'Rani', text: 'baris dua', time: '2026-08-28T14:02:00Z' },
  ],
  ...over,
});

describe('toBridgeBatch', () => {
  it('sends only the captions the vault has not seen', () => {
    const batch = toBridgeBatch(meeting(), 1);
    expect(batch.entries).toHaveLength(1);
    expect(batch.entries[0].text).toBe('baris dua');
  });

  it('derives the same operation id for the same slice', () => {
    expect(toBridgeBatch(meeting(), 0).operationId).toBe(toBridgeBatch(meeting(), 0).operationId);
    expect(toBridgeBatch(meeting(), 1).operationId).not.toBe(toBridgeBatch(meeting(), 0).operationId);
  });

  it('carries the room, participants and start of the meeting', () => {
    const batch = toBridgeBatch(meeting(), 0);
    expect(batch.roomId).toBe('abc-defg-hij');
    expect(batch.platform).toBe('google-meet');
    expect(batch.participants).toEqual(['Andi', 'Rani']);
    expect(batch.startedAt).toBe('2026-08-28T14:00:00+07:00');
  });

  it('labels a Teams room', () => {
    expect(toBridgeBatch(meeting({ id: 'tms-xyz#1787918400000' }), 0).platform).toBe('teams');
  });

  it('only puts a note body on the first delivery', () => {
    const analysis = {
      executiveSummary: 'Ringkasan rapat.',
      timeline: [],
      keyDiscussions: [],
      decisions: [],
      actionItems: [],
      risks: [],
      openQuestions: [],
      nextSteps: [],
      diagrams: [],
    };
    expect(toBridgeBatch(meeting(), 0, analysis).markdown).toContain('Ringkasan rapat.');
    expect(toBridgeBatch(meeting(), 1, analysis).markdown).toBeUndefined();
  });
});
