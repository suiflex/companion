import { describe, expect, it } from 'vitest'
import { roomIdFromSessionKey, sessionKeyFor, shortId, uuidV7 } from './identity'

describe('identity', () => {
  it('uuidV7 emits an RFC 9562 v7 uuid (version nibble 7, variant 8..b)', () => {
    const id = uuidV7(Date.parse('2026-08-28T14:00:00Z'))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('uuidV7 is mostly-time-ordered and unique across calls', () => {
    const a = uuidV7(0)
    const b = uuidV7(0)
    expect(a).not.toBe(b)
    const early = uuidV7(1_000_000)
    const late = uuidV7(99_000_000)
    expect(early < late).toBe(true)
  })

  it('shortId keeps a readable prefix', () => {
    expect(shortId('0191f3c2-8a41-7a2e-9c33-1b7d5e0a4f21')).toBe('0191f3c2')
  })

  it('sessionKeyFor collapses a meeting start to local wall-clock minutes', () => {
    // Offsets are stripped; only YYYY-MM-DDTHH:MM survives.
    const key = sessionKeyFor('meet/abc-defg-hij', '2026-08-28T14:00:12+07:00')
    expect(key.startsWith('meet/abc-defg-hij#')).toBe(true)
    expect(key).toMatch(/#\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('sessionKeyFor is idempotent for the same minute', () => {
    const a = sessionKeyFor('meet/x', '2026-08-28T14:00:12+07:00')
    const b = sessionKeyFor('meet/x', '2026-08-28T14:00:59+07:00')
    expect(a).toBe(b)
  })

  it('roomIdFromSessionKey strips the #start suffix', () => {
    expect(roomIdFromSessionKey('meet/abc#2026-08-28T14:00')).toBe('meet/abc')
    expect(roomIdFromSessionKey('plain')).toBe('plain')
  })
})
