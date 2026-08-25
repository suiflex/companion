import { describe, expect, it } from 'vitest';
import type { CleanRecord, Meeting } from './types';
import {
  displayMeetingId,
  sanitizeRoomId,
  makeSessionId,
  resolveSession,
  roomIdOf,
  sessionStartOf,
  SESSION_REJOIN_MS,
} from './session';
import { cleanChanges, effectiveClean, entriesById, entryId, withEntryIds } from './entries';

const ROOM = 'xdr-fdbe-zqz';
const T = Date.parse('2026-08-24T07:00:00Z');

const meetingAt = (id: string, lastSeen: number): Meeting => ({
  id,
  meta: { id, startedAt: new Date(lastSeen - 60_000).toISOString(), lastSeenAt: new Date(lastSeen).toISOString() },
  entries: [],
});

describe('session ids', () => {
  it('round-trips room and start time', () => {
    const id = makeSessionId(ROOM, T);
    expect(roomIdOf(id)).toBe(ROOM);
    expect(sessionStartOf(id)).toBe(T);
    expect(displayMeetingId(id)).toBe(ROOM);
  });

  it('treats a legacy id (no separator) as a room with one session', () => {
    expect(roomIdOf(ROOM)).toBe(ROOM);
    expect(sessionStartOf(ROOM)).toBeNull();
  });
});

describe('sanitizeRoomId', () => {
  it('keeps a normal room code untouched', () => {
    expect(sanitizeRoomId(ROOM)).toBe(ROOM);
    expect(sanitizeRoomId('tms-AbC123')).toBe('tms-AbC123');
  });

  it('strips characters that have no business in a storage key', () => {
    expect(sanitizeRoomId('../../settings')).toBe('....settings');
    expect(sanitizeRoomId('a b/c?d=e')).toBe('abcde');
  });

  it('caps the length so a crafted link cannot bloat storage', () => {
    expect(sanitizeRoomId('x'.repeat(500))).toHaveLength(64);
  });
});

describe('resolveSession', () => {
  it('starts a new session when the room has never been used', () => {
    const r = resolveSession(ROOM, [], T);
    expect(r.resumed).toBe(false);
    expect(roomIdOf(r.sessionId)).toBe(ROOM);
  });

  it('resumes the running session on a rejoin', () => {
    const live = meetingAt(makeSessionId(ROOM, T - 600_000), T - 30_000);
    const r = resolveSession(ROOM, [live], T);
    expect(r).toEqual({ sessionId: live.id, resumed: true });
  });

  // The bug this exists for: one recurring link, three different meetings.
  it('starts a new session for the next occurrence of a recurring meeting', () => {
    const monday = meetingAt(makeSessionId(ROOM, T), T + 3_600_000);
    const wednesday = resolveSession(ROOM, [monday], T + 2 * 86_400_000);
    expect(wednesday.resumed).toBe(false);
    expect(wednesday.sessionId).not.toBe(monday.id);
  });

  it('never adopts a session from a different room', () => {
    const other = meetingAt(makeSessionId('abc-defg-hij', T), T);
    expect(resolveSession(ROOM, [other], T).resumed).toBe(false);
  });

  it('resumes right up to the rejoin window and not past it', () => {
    const m = meetingAt(makeSessionId(ROOM, T - 10_000), T - SESSION_REJOIN_MS + 1_000);
    expect(resolveSession(ROOM, [m], T).resumed).toBe(true);
    expect(resolveSession(ROOM, [m], T + 2_000).resumed).toBe(false);
  });

  it('falls back to the last entry time when a meeting has no meta', () => {
    const m: Meeting = {
      id: makeSessionId(ROOM, T - 60_000),
      meta: null,
      entries: [{ speaker: 'A', text: 'halo', time: new Date(T - 20_000).toISOString() }],
    };
    expect(resolveSession(ROOM, [m], T).resumed).toBe(true);
  });
});

describe('entry ids', () => {
  it('numbers entries from 1 and leaves existing ids alone', () => {
    const withIds = withEntryIds([
      { speaker: 'A', text: 'satu', time: '2026-08-24T07:00:00Z' },
      { id: 'E9', speaker: 'B', text: 'dua', time: '2026-08-24T07:00:10Z' },
    ]);
    expect(withIds[0].id).toBe(entryId(0));
    expect(withIds[0].id).toBe('E1');
    expect(withIds[1].id).toBe('E9');
  });

  it('indexes by id for evidence verification', () => {
    const map = entriesById([{ speaker: 'A', text: 'satu', time: '2026-08-24T07:00:00Z' }]);
    expect(map.get('E1')?.text).toBe('satu');
    expect(map.has('E2')).toBe(false);
  });
});

describe('cleanup provenance (§26)', () => {
  const raw = [
    { speaker: 'A', text: 'target dua ribu tiga', time: '2026-08-24T07:00:00Z' },
    { speaker: 'B', text: 'oke siap', time: '2026-08-24T07:00:10Z' },
  ];
  const record = (kept?: number[]): CleanRecord => ({
    status: 'done',
    generatedAt: '2026-08-24T08:00:00Z',
    changed: 1,
    entries: [
      { speaker: 'A', text: 'target 2023', time: '2026-08-24T07:00:00Z' },
      { speaker: 'B', text: 'oke siap', time: '2026-08-24T07:00:10Z' },
    ],
    kept,
  });

  it('lists only the lines the AI actually rewrote', () => {
    const changes = cleanChanges(raw, record());
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ index: 0, raw: 'target dua ribu tiga', cleaned: 'target 2023', kept: false });
  });

  // a wrong correction must not propagate into summary -> decisions -> Ask -> PRD
  it('falls back to the raw line where the user kept the original', () => {
    expect(effectiveClean(raw, record())[0].text).toBe('target 2023');
    expect(effectiveClean(raw, record([0]))[0].text).toBe('target dua ribu tiga');
  });

  it('keeps lines captured after the cleanup ran', () => {
    const grown = [...raw, { speaker: 'A', text: 'satu hal lagi', time: '2026-08-24T07:05:00Z' }];
    const merged = effectiveClean(grown, record());
    expect(merged).toHaveLength(3);
    expect(merged[2].text).toBe('satu hal lagi');
  });

  it('returns the raw transcript when there is no finished cleanup', () => {
    expect(effectiveClean(raw, null)).toBe(raw);
  });
});
