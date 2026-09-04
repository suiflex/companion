import { describe, expect, it } from 'vitest'
import { noteFromMarkdown, noteToMarkdown, type VaultNote } from './note'

const NOTE: VaultNote = {
  id: '0191f3c2-8a41-7a2e-9c33-1b7d5e0a4f21',
  sessionKey: 'meet/abc-defg-hij#2026-08-28T14:00',
  platform: 'google-meet',
  startedAt: '2026-08-28T14:00:12+07:00',
  participants: ['Andi', 'Rani'],
  tags: ['rapat', 'gate'],
  transcript: '.transcript/2026-08-28 Gate review §32.1.jsonl',
  updatedAt: '2026-09-01T10:00:00+07:00',
  title: 'Gate review §32.1',
  body: '## Keputusan\n\n- Desktop ditahan.',
}

describe('note frontmatter', () => {
  it('round-trips a note through markdown', () => {
    const md = noteToMarkdown(NOTE)
    const parsed = noteFromMarkdown(md)
    expect(parsed).toEqual(NOTE)
  })

  it('round-trips the source key', () => {
    // A frontmatter key lives in four places; miss one and the value is
    // dropped silently on the next save. `source` is the link from an edited
    // copy back to the delivered meeting it came from, so losing it turns the
    // copy into a note of unknown origin.
    const copy: VaultNote = {
      ...NOTE,
      platform: 'manual',
      source: 'meet/abc-defg-hij#2026-08-28T14:00',
    }
    expect(noteFromMarkdown(noteToMarkdown(copy))).toEqual(copy)
  })

  it('round-trips the ticket fields', () => {
    // A frontmatter key lives in four places — the interface, QUOTED, ORDER and
    // the parser's return literal — and missing any one of them loses the value
    // silently on the next save. This is what catches that.
    const ticket: VaultNote = {
      ...NOTE,
      status: 'In Progress',
      assignee: 'Rani',
      priority: 'High',
      dueDate: '2026-09-10',
    }
    expect(noteFromMarkdown(noteToMarkdown(ticket))).toEqual(ticket)
  })

  it('still reads a note written before the ticket fields existed', () => {
    const parsed = noteFromMarkdown(noteToMarkdown(NOTE))
    expect(parsed.status).toBeUndefined()
    expect(parsed.assignee).toBeUndefined()
    expect(parsed.priority).toBeUndefined()
    expect(parsed.dueDate).toBeUndefined()
    expect(parsed).toEqual(NOTE)
  })

  it('emits frontmatter in canonical order with id/session_key first', () => {
    const md = noteToMarkdown(NOTE)
    const head = md.slice(0, md.indexOf('---', 4))
    const idLine = head.indexOf('id: "')
    const skLine = head.indexOf('sessionKey: "')
    expect(idLine).toBeGreaterThan(-1)
    expect(skLine).toBeGreaterThan(idLine)
    expect(md).toContain('participants:')
    expect(md).toContain('  - "Andi"')
  })

  it('writes a leading # heading from title and preserves the body', () => {
    const md = noteToMarkdown(NOTE)
    expect(md).toContain('# Gate review §32.1')
    expect(md).toContain('## Keputusan')
  })

  it('keeps a mid-body heading in the body across repeated saves', () => {
    const note = { ...NOTE, body: 'Pembuka.\n\n# Bagian dua\n\nIsi.' }
    const once = noteFromMarkdown(noteToMarkdown(note))
    const twice = noteFromMarkdown(noteToMarkdown(once))
    expect(once.title).toBe('Gate review §32.1')
    expect(once.body).toBe(note.body)
    expect(twice).toEqual(once)
    // the title heading plus the body's own — and no more on the next save
    expect(noteToMarkdown(once).match(/^# /gm)).toHaveLength(2)
    expect(noteToMarkdown(twice).match(/^# /gm)).toHaveLength(2)
  })

  it('does not duplicate a heading the body already opens with', () => {
    const md = noteToMarkdown({ ...NOTE, title: 'Gate review', body: '# Gate review\n\nIsi.' })
    expect(md.match(/^# Gate review$/gm)).toHaveLength(1)
    const parsed = noteFromMarkdown(md)
    expect(parsed.title).toBe('Gate review')
    expect(parsed.body).toBe('Isi.')
    expect(noteFromMarkdown(noteToMarkdown(parsed))).toEqual(parsed)
  })

  it('parses a body-only document with the fallback title', () => {
    const parsed = noteFromMarkdown('Just a note without frontmatter.\n', 'From filename')
    expect(parsed.id).toBe('')
    expect(parsed.title).toBe('From filename')
    expect(parsed.body).toBe('Just a note without frontmatter.')
  })

  it('escapes quotes and backslashes in scalar values', () => {
    const md = noteToMarkdown({ ...NOTE, title: 'Rapat "vendor" \\ T2', body: 'x' })
    const parsed = noteFromMarkdown(md)
    expect(parsed.title).toBe('Rapat "vendor" \\ T2')
  })

  it('omits empty optional lists from frontmatter', () => {
    const md = noteToMarkdown({ ...NOTE, participants: [], tags: undefined })
    expect(md).not.toContain('participants:')
  })
})
