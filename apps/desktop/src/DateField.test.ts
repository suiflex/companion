import { describe, expect, it } from 'vitest'
import { iso, monthGrid, parseIso } from './DateField'

describe('parseIso', () => {
  it('reads a date as local time, not UTC', () => {
    // `new Date('2026-09-04')` is midnight UTC, which is the 3rd in any
    // timezone behind it — the whole reason this parses by hand.
    const d = parseIso('2026-09-04')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(4)
  })

  it('round-trips through iso()', () => {
    expect(iso(parseIso('2026-01-31')!)).toBe('2026-01-31')
  })

  it('rejects anything that is not YYYY-MM-DD', () => {
    for (const bad of ['', '2026-9-4', '04/09/2026', 'besok']) {
      expect(parseIso(bad)).toBeNull()
    }
  })
})

describe('monthGrid', () => {
  const sep = new Date(2026, 8, 1) // September 2026 — the 1st is a Tuesday

  it('always fills six whole weeks, so paging never reflows the grid', () => {
    for (let m = 0; m < 12; m++) {
      expect(monthGrid(new Date(2026, m, 1))).toHaveLength(42)
    }
  })

  it('starts on the Monday on or before the 1st', () => {
    const first = monthGrid(sep)[0]
    expect(first.getDay()).toBe(1)
    expect(iso(first)).toBe('2026-08-31')
  })

  it('contains every day of the month exactly once', () => {
    const days = monthGrid(sep).filter((d) => d.getMonth() === 8)
    expect(days).toHaveLength(30)
    expect(new Set(days.map(iso)).size).toBe(30)
  })

  it('handles a February that starts on a Monday without a blank leading week', () => {
    // 2027-02-01 is a Monday: the lead must be 0, not 7.
    expect(iso(monthGrid(new Date(2027, 1, 1))[0])).toBe('2027-02-01')
  })
})
