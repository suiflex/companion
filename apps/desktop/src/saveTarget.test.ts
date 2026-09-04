import { describe, expect, it } from 'vitest'
import { saveTarget } from './saveTarget'
import type { VaultNote } from '@meetcc/vault'

const meeting: VaultNote = {
  id: 'm-1',
  sessionKey: 'meet/abc#2026-09-04T14:00',
  platform: 'google-meet',
  updatedAt: '2026-09-04T00:00:00Z',
  title: 'Gate review',
  body: 'catatan',
}

const manual: VaultNote = { ...meeting, id: 'n-1', sessionKey: 'nota/x', platform: 'manual' }

const relPath = (n: VaultNote): string => `Rapat/undated/${n.sessionKey.replace(/\W/g, '-')}.md`

describe('saveTarget', () => {
  it('writes a note that has a file back to that file', () => {
    const out = saveTarget({ note: manual, selected: 'Test/mine.md', target: null, relPath })
    expect(out.rel).toBe('Test/mine.md')
    expect(out.copied).toBe(false)
  })

  it('puts a note with no file yet in the chosen folder', () => {
    const out = saveTarget({ note: manual, selected: null, target: 'Test', relPath })
    expect(out.rel.startsWith('Test/')).toBe(true)
  })

  it('copies a delivered meeting instead of rewriting it', () => {
    const out = saveTarget({ note: meeting, selected: 'Rapat/2026-09-04/abc.md', target: null, relPath })
    expect(out.copied).toBe(true)
    expect(out.rel).not.toBe('Rapat/2026-09-04/abc.md')
    expect(out.note.platform).toBe('manual')
    expect(out.note.source).toBe(meeting.sessionKey)
    expect(out.note.id).not.toBe(meeting.id)
  })

  it('copies a meeting once, not once per save', () => {
    // The bug: every edit-and-save of the same meeting laid down another note,
    // because nothing looked for the copy that already existed.
    const first = saveTarget({ note: meeting, selected: 'Rapat/x.md', target: null, relPath })
    const existing = [
      { rel: first.rel, id: first.note.id, sessionKey: first.note.sessionKey, source: first.note.source },
    ]
    const second = saveTarget({ note: meeting, selected: 'Rapat/x.md', target: null, relPath, existing })
    expect(second.copied).toBe(false)
    expect(second.rel).toBe(first.rel)
    expect(second.note.id).toBe(first.note.id)
    // Reusing the meeting's own key here is what caused the UNIQUE violation.
    expect(second.note.sessionKey).toBe(first.note.sessionKey)
    expect(second.note.sessionKey).not.toBe(meeting.sessionKey)
  })

  it('never writes a copy over the archive it came from', () => {
    const out = saveTarget({ note: meeting, selected: 'Rapat/2026-09-04/abc.md', target: 'Test', relPath })
    expect(out.rel.startsWith('Test/')).toBe(true)
    expect(out.rel).not.toBe('Rapat/2026-09-04/abc.md')
  })
})
