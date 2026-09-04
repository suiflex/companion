import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EXTENSION_ID, dashboardUrl, parseTranscript, roomIdOf } from './MeetingMeta'

describe('extension id', () => {
  it('still matches the id derived from the pinned manifest key', () => {
    // Hardcoded in the component because the Tauri app cannot read the
    // extension's manifest at runtime. This recomputes it the way Chromium
    // does, so the constant cannot quietly go stale if the key ever changes.
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../extension/public/manifest.json', import.meta.url)),
        'utf8',
      ),
    ) as { key: string }
    const digest = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest()
    const derived = [...digest.subarray(0, 16)]
      .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15)))
      .join('')
    expect(EXTENSION_ID).toBe(derived)
  })
})

describe('roomIdOf', () => {
  it('takes the part before the timestamp', () => {
    expect(roomIdOf('abc-defg-hij#2026-09-04T10:00')).toBe('abc-defg-hij')
  })

  it('copes with a session key that has no timestamp', () => {
    expect(roomIdOf('nota/xyz')).toBe('nota/xyz')
    expect(roomIdOf('')).toBe('')
  })

  it('escapes a room id that would otherwise break the query string', () => {
    expect(dashboardUrl('a b&c#2026-01-01T00:00')).toContain('meeting=a%20b%26c')
  })
})

describe('parseTranscript', () => {
  const line = (o: Record<string, unknown>) => JSON.stringify(o)

  it('reads one caption per line', () => {
    const rows = parseTranscript(
      [
        line({ speaker: 'Andi', text: 'halo', time: '2026-09-04T10:00:00Z' }),
        line({ speaker: 'Rani', text: 'siap', time: '2026-09-04T10:00:05Z' }),
      ].join('\n'),
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({ speaker: 'Rani', text: 'siap', time: '2026-09-04T10:00:05Z' })
  })

  it('skips a truncated final line rather than throwing', () => {
    // The sidecar is append-only, so the last line can be half-written while a
    // meeting is still being delivered.
    const rows = parseTranscript(`${line({ speaker: 'A', text: 'one', time: '' })}\n{"speaker":"B","te`)
    expect(rows).toHaveLength(1)
  })

  it('tolerates missing speaker and time but requires text', () => {
    expect(parseTranscript(line({ text: 'only text' }))).toEqual([
      { speaker: '', text: 'only text', time: '' },
    ])
    expect(parseTranscript(line({ speaker: 'A' }))).toEqual([])
  })

  it('ignores blank lines', () => {
    expect(parseTranscript('\n\n')).toEqual([])
  })
})
