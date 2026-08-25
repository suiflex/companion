import type { SessionRow } from '@meetcc/store';

// P2.5 — calendar. Two independent paths, both optional:
//  * an .ics file the user already has (no network, no account);
//  * Google Calendar, which needs an OAuth client id the *user* supplies —
//    there is no key baked into this extension.
// Matching is by conferencing link first (exact) and by time overlap second.

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  /** Meet/Teams link found on the event, when it has one. */
  conferenceUrl?: string;
  attendees?: string[];
}

const unfold = (ics: string): string[] =>
  ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');

/** `20260824T140000Z` / `20260824` -> ISO. */
export function parseIcsDate(value: string): string {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return '';
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}

/** Minimal VEVENT reader — enough to match meetings, not a full RFC 5545. */
export function parseIcs(ics: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> | null = null;
  for (const line of unfold(ics)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = { attendees: [] };
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current?.start && current.end) {
        events.push({
          id: current.id ?? `${current.start}-${current.title ?? ''}`,
          title: current.title ?? '',
          start: current.start,
          end: current.end,
          conferenceUrl: current.conferenceUrl,
          attendees: current.attendees,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const name = line.slice(0, idx).split(';')[0].toUpperCase();
    const value = line.slice(idx + 1).trim();
    if (name === 'UID') current.id = value;
    else if (name === 'SUMMARY') current.title = value;
    else if (name === 'DTSTART') current.start = parseIcsDate(value);
    else if (name === 'DTEND') current.end = parseIcsDate(value);
    else if (name === 'ATTENDEE') current.attendees?.push(value.replace(/^mailto:/i, ''));
    else if ((name === 'LOCATION' || name === 'DESCRIPTION' || name === 'X-GOOGLE-CONFERENCE') && !current.conferenceUrl) {
      const url = value.match(/https:\/\/(?:meet\.google\.com|teams\.(?:microsoft\.com|live\.com))\/\S+/);
      if (url) current.conferenceUrl = url[0];
    }
  }
  return events;
}

/** How far apart a meeting and an event may start and still be the same one. */
export const MATCH_TOLERANCE_MS = 30 * 60_000;

/**
 * Pick the event a captured session belongs to. A conferencing link containing
 * the room id is decisive; otherwise the closest start time inside the
 * tolerance wins. No match returns null — a wrong title is worse than none.
 */
export function matchEvent(session: SessionRow, events: CalendarEvent[]): CalendarEvent | null {
  const byLink = events.find((e) => e.conferenceUrl?.includes(session.roomId));
  if (byLink) return byLink;
  if (!session.startedAt) return null;
  const start = Date.parse(session.startedAt);
  let best: { event: CalendarEvent; delta: number } | null = null;
  for (const e of events) {
    const delta = Math.abs(Date.parse(e.start) - start);
    if (!Number.isFinite(delta) || delta > MATCH_TOLERANCE_MS) continue;
    if (!best || delta < best.delta) best = { event: e, delta };
  }
  return best?.event ?? null;
}

export interface GoogleCalendarConfig {
  /** OAuth access token obtained with the user's own client id. */
  accessToken: string;
}

/** Fetch events around a time window from Google Calendar. */
export async function fetchGoogleEvents(
  config: GoogleCalendarConfig,
  from: string,
  to: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CalendarEvent[]> {
  if (!config.accessToken) throw new Error('Belum terhubung ke Google Calendar.');
  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    `?timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}` +
    '&singleEvents=true&orderBy=startTime&maxResults=50';
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
  if (!res.ok) throw new Error(`Google Calendar menolak permintaan (${res.status})`);
  const data = (await res.json()) as {
    items?: {
      id: string;
      summary?: string;
      hangoutLink?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: { email?: string; displayName?: string }[];
    }[];
  };
  return (data.items ?? [])
    .map((i) => ({
      id: i.id,
      title: i.summary ?? '',
      start: i.start?.dateTime ?? i.start?.date ?? '',
      end: i.end?.dateTime ?? i.end?.date ?? '',
      conferenceUrl: i.hangoutLink ?? i.location,
      attendees: (i.attendees ?? []).map((a) => a.displayName || a.email || '').filter(Boolean),
    }))
    .filter((e) => e.start && e.end);
}
