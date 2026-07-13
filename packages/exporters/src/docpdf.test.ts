import { describe, expect, it } from 'vitest'
import type { Meeting } from '@meetcc/shared'
import { docToPdf, parseMd } from './docpdf'

const meeting: Meeting = {
  id: 'zkz-fwkm-ibn',
  meta: {
    id: 'zkz-fwkm-ibn',
    startedAt: '2026-07-12T16:00:00Z',
    lastSeenAt: '2026-07-12T17:00:00Z',
  },
  entries: [{ speaker: 'A', text: 'x', time: '2026-07-12T16:00:00Z' }],
}

const MD = `# BRD — Fitur Export

## Latar Belakang

Tim butuh export **otomatis** dari _rapat_.

### Detail

- Poin satu
- Poin dua
1. Langkah pertama
2. Langkah kedua

| Tugas | PIC |
| --- | --- |
| Export PDF | Gunawan |
| Review | Manan |

---

_[belum dibahas]_`

describe('parseMd', () => {
  const tokens = parseMd(MD)

  it('tokenizes headings, lists, tables, and rules', () => {
    const kinds = tokens.map((t) => t.kind)
    expect(kinds).toEqual([
      'h1',
      'h2',
      'p',
      'h3',
      'li',
      'li',
      'oli',
      'oli',
      'table',
      'hr',
      'p',
    ])
  })

  it('strips inline markers and keeps text', () => {
    const p = tokens.find((t) => t.kind === 'p')
    expect(p).toMatchObject({ text: 'Tim butuh export otomatis dari rapat.' })
  })

  it('drops the table divider row and keeps cells', () => {
    const table = tokens.find((t) => t.kind === 'table')
    expect(table).toMatchObject({
      rows: [
        ['Tugas', 'PIC'],
        ['Export PDF', 'Gunawan'],
        ['Review', 'Manan'],
      ],
    })
  })

  it('handles empty input', () => {
    expect(parseMd('')).toEqual([])
  })
})

describe('docToPdf', () => {
  it('produces a valid PDF blob from markdown', async () => {
    const blob = docToPdf(meeting, 'BRD', MD)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(3_000)
    const head = new Uint8Array((await blob.arrayBuffer()).slice(0, 5))
    expect(String.fromCharCode(...head)).toBe('%PDF-')
  })

  it('survives a long document with page breaks', () => {
    const long = Array.from(
      { length: 120 },
      (_, i) => `- Butir panjang nomor ${i} `.repeat(4),
    ).join('\n')
    expect(docToPdf(meeting, 'PRD', `# Judul\n${long}`).size).toBeGreaterThan(
      5_000,
    )
  })
})
