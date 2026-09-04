import { describe, expect, it } from 'vitest'
import type { Analysis, Meeting } from '@meetcc/shared'
import { datedCount, parseDue, toChecklist, toIcs } from './tasks'

const meeting: Meeting = {
  id: 'zkz-fwkm-ibn',
  meta: {
    id: 'zkz-fwkm-ibn',
    startedAt: '2026-07-12T16:00:00Z',
    lastSeenAt: '2026-07-12T17:00:00Z',
  },
  entries: [{ speaker: 'A', text: 'x', time: '2026-07-12T16:00:00Z' }],
}

const base: Analysis = {
  executiveSummary: 'ok',
  timeline: [],
  keyDiscussions: [],
  decisions: [],
  actionItems: [
    { task: 'Fix logo', owner: 'Gunawan', due: '2026-07-20' },
    { task: 'Review, cek; test', owner: '', due: 'besok' },
    { task: 'Deploy', owner: 'Manan', due: '05/08/2026' },
  ],
  risks: [],
  openQuestions: [],
  nextSteps: [],
  diagrams: [],
}

describe('parseDue', () => {
  it('parses ISO and dd/mm/yyyy, rejects freeform and impossible dates', () => {
    expect(parseDue('2026-07-20')?.toISOString().slice(0, 10)).toBe(
      '2026-07-20',
    )
    expect(parseDue('05/08/2026')?.toISOString().slice(0, 10)).toBe(
      '2026-08-05',
    )
    expect(parseDue('05-08-2026')?.toISOString().slice(0, 10)).toBe(
      '2026-08-05',
    )
    expect(parseDue('besok')).toBeNull()
    expect(parseDue('2026-13-40')).toBeNull()
    expect(parseDue('')).toBeNull()
  })
})

describe('toChecklist', () => {
  const md = toChecklist(base)
  it('renders every item with PIC and due, plus branding', () => {
    expect(md).toContain('- [ ] Fix logo — PIC: Gunawan, due 2026-07-20')
    expect(md).toContain('- [ ] Review, cek; test — due besok')
    expect(md).toContain('_powered by suiflex_')
  })
  it('handles no action items', () => {
    expect(toChecklist({ ...base, actionItems: [] })).toContain(
      '(no action items)',
    )
  })
})

describe('toIcs / datedCount', () => {
  it('counts only calendar-placeable items', () => {
    expect(datedCount(base)).toBe(2)
  })

  it('emits one all-day VEVENT per dated item with escaped text', () => {
    const ics = toIcs(meeting, base)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260720')
    expect(ics).toContain('DTEND;VALUE=DATE:20260721') // exclusive end
    expect(ics).toContain('SUMMARY:Deploy')
    expect(ics).toContain('UID:zkz-fwkm-ibn-action-0@meetcc')
    expect(ics).toContain('\r\n') // RFC 5545 line endings
  })

  it('escapes commas and semicolons per RFC 5545', () => {
    const ics = toIcs(meeting, {
      ...base,
      actionItems: [{ task: 'a, b; c', owner: '', due: '2026-01-02' }],
    })
    expect(ics).toContain('SUMMARY:a\\, b\\; c')
  })

  it('returns a valid empty calendar when nothing is dated', () => {
    const ics = toIcs(meeting, {
      ...base,
      actionItems: [{ task: 'x', owner: '', due: 'nanti' }],
    })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})
