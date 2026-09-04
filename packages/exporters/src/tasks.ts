import { startedAt, type Analysis, type Meeting } from '@meetcc/shared'
import { t } from '@meetcc/shared/i18n';

// Turns extracted action items into paste-ready artifacts. No AI, no deps —
// .ics is plain text (RFC 5545). Two outputs:
//   toChecklist -> markdown checklist for Notion/Obsidian/issues
//   toIcs       -> all-day calendar events for items with a parseable date

/**
 * Parse a due string to a calendar date. Structured dates only (ISO
 * yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy); freeform ("besok", "Jumat") returns
 * null — those stay in the checklist but can't be placed on a calendar.
 */
export function parseDue(due: string): Date | null {
  const s = due.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) // ISO
  if (m) return valid(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s) // dd/mm/yyyy or dd-mm-yyyy
  if (m) return valid(+m[3], +m[2], +m[1])
  return null
}

function valid(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null
}

export function toChecklist(analysis: Analysis): string {
  const lines = analysis.actionItems.map((a) => {
    const meta = [a.owner && `PIC: ${a.owner}`, a.due && `due ${a.due}`]
      .filter(Boolean)
      .join(', ')
    return `- [ ] ${a.task}${meta ? ` — ${meta}` : ''}`
  })
  if (!lines.length) lines.push(t('pkg.export.noActionItems'))
  return ['## Action Items', '', ...lines, '', '_powered by suiflex_'].join(
    '\n',
  )
}

/** Number of action items that carry a calendar-placeable date. */
export function datedCount(analysis: Analysis): number {
  return analysis.actionItems.filter((a) => parseDue(a.due)).length
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
const stampUtc = (iso: string) => {
  const d = new Date(iso)
  return `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// RFC 5545 §3.3.11 text escaping
const esc = (s: string) => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n')

/**
 * All-day VEVENTs for action items with a parseable due date. Returns a valid
 * VCALENDAR even when nothing is dated (caller can warn via datedCount).
 * DTSTAMP is derived from the meeting start, not wall-clock, so output is
 * deterministic across runs.
 */
export function toIcs(meeting: Meeting, analysis: Analysis): string {
  const dtstamp = stampUtc(
    startedAt(meeting) ?? meeting.entries[0]?.time ?? '2000-01-01T00:00:00Z',
  )
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meet Companion//suiflex//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  analysis.actionItems.forEach((a, i) => {
    const date = parseDue(a.due)
    if (!date) return
    const next = new Date(date)
    next.setUTCDate(next.getUTCDate() + 1) // DTEND is exclusive for all-day
    lines.push(
      'BEGIN:VEVENT',
      `UID:${meeting.id}-action-${i}@meetcc`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${ymd(date)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${esc(a.task)}`,
      a.owner
        ? `DESCRIPTION:${esc(`PIC: ${a.owner} · Meeting ${meeting.id}`)}`
        : `DESCRIPTION:${esc(`Meeting ${meeting.id}`)}`,
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
