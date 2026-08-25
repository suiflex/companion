import type { Meeting } from './types';

// P0.1 — a meeting *room* is not a meeting *session*. A recurring Meet link
// (`xdr-fdbe-zqz`) is reused every Monday/Wednesday/Friday; keying storage on
// the room merges three different meetings into one transcript. Sessions get
// their own id, `<roomId>#<startedAtMs>`, and the room is derivable from it —
// so nothing has to be stored twice and legacy ids (no separator) keep working
// as "a room with a single session".

export const SESSION_SEP = '#';

/**
 * Rejoining after a dropped connection, a refresh, or a short break must
 * continue the same session; a new day must not. 5 minutes is longer than the
 * 15s live threshold (so a brief network blip resumes) and far shorter than
 * any realistic gap between two meetings on the same link.
 */
export const SESSION_REJOIN_MS = 5 * 60_000;

/** The room id arrives from a content script (a page URL, ultimately) and ends
 *  up inside storage keys, so it is constrained here rather than trusted:
 *  URL-ish characters only, and short enough that a crafted link cannot bloat
 *  storage. Empty after cleaning -> caller decides (see background).  */
export function sanitizeRoomId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
}

export function makeSessionId(roomId: string, startedAt: string | number): string {
  const ms = typeof startedAt === 'number' ? startedAt : Date.parse(startedAt);
  return `${roomId}${SESSION_SEP}${Number.isFinite(ms) ? ms : Date.now()}`;
}

/** Legacy ids have no separator — the whole id is the room. */
export function roomIdOf(sessionId: string): string {
  const i = sessionId.lastIndexOf(SESSION_SEP);
  return i < 0 ? sessionId : sessionId.slice(0, i);
}

/** Session start encoded in the id, or null for a legacy id. */
export function sessionStartOf(sessionId: string): number | null {
  const i = sessionId.lastIndexOf(SESSION_SEP);
  if (i < 0) return null;
  const ms = Number(sessionId.slice(i + 1));
  return Number.isFinite(ms) ? ms : null;
}

/** What to show when a meeting has no title yet: the room code, not the
 *  `room#1756…` session id, which means nothing to the user. */
export function displayMeetingId(sessionId: string): string {
  return roomIdOf(sessionId);
}

export interface SessionResolution {
  sessionId: string;
  /** false = a fresh session was minted for this room. */
  resumed: boolean;
}

/**
 * Decide which session a tab joining `roomId` belongs to: resume the room's
 * most recent session when its last heartbeat is still within the rejoin
 * window, otherwise start a new one. Pure — the caller supplies the meetings.
 */
export function resolveSession(
  roomId: string,
  meetings: Meeting[],
  now: number,
): SessionResolution {
  let best: { id: string; seen: number } | null = null;
  for (const m of meetings) {
    if (roomIdOf(m.id) !== roomId) continue;
    const t = m.meta?.lastSeenAt ?? m.entries[m.entries.length - 1]?.time;
    const seen = t ? Date.parse(t) : NaN;
    if (!Number.isFinite(seen)) continue;
    if (!best || seen > best.seen) best = { id: m.id, seen };
  }
  if (best && now - best.seen < SESSION_REJOIN_MS) {
    return { sessionId: best.id, resumed: true };
  }
  return { sessionId: makeSessionId(roomId, now), resumed: false };
}
