import { describe, expect, it } from 'vitest'
import type { Meeting } from '@meetcc/shared'
import { buildDiagramPrompt, generateDiagrams, parseDiagrams } from './diagram'
import { AIError, type AIClient } from './client'

const meeting: Meeting = {
  id: 'abc-defg-hij',
  meta: { id: 'abc-defg-hij', startedAt: '2026-07-13T01:00:00Z', lastSeenAt: '2026-07-13T02:00:00Z' },
  entries: [{ speaker: 'A', text: 'order masuk lalu divalidasi', time: '2026-07-13T01:00:00Z' }],
}

const clientOf = (fn: () => Promise<string>): AIClient => ({ provider: 'custom', complete: fn })

describe('parseDiagrams', () => {
  it('extracts valid diagrams and drops bad types', () => {
    const d = parseDiagrams(
      JSON.stringify({
        diagrams: [
          { title: 'Alur', type: 'flowchart', mermaid: 'flowchart TB\nA-->B' },
          { title: 'x', type: 'mindmap', mermaid: 'mindmap' },
        ],
      }),
    )
    expect(d).toHaveLength(1)
    expect(d[0].type).toBe('flowchart')
  })

  it('returns [] on non-JSON or empty', () => {
    expect(parseDiagrams('maaf')).toEqual([])
    expect(parseDiagrams('{"diagrams":[]}')).toEqual([])
  })
})

describe('buildDiagramPrompt', () => {
  it('includes transcript and meeting id', () => {
    const p = buildDiagramPrompt(meeting)
    expect(p).toContain('abc-defg-hij')
    expect(p).toContain('order masuk')
  })
})

describe('generateDiagrams', () => {
  it('returns parsed diagrams', async () => {
    const d = await generateDiagrams(
      clientOf(async () =>
        JSON.stringify({ diagrams: [{ title: 'Alur', type: 'flowchart', mermaid: 'flowchart TB\nA-->B' }] }),
      ),
      meeting,
    )
    expect(d).toHaveLength(1)
  })

  it('retries once on retryable failure', async () => {
    let n = 0
    const d = await generateDiagrams(
      clientOf(async () => {
        if (++n === 1) throw new AIError('boom', true)
        return '{"diagrams":[]}'
      }),
      meeting,
    )
    expect(n).toBe(2)
    expect(d).toEqual([])
  })

  it('does not retry non-retryable errors', async () => {
    let n = 0
    await expect(
      generateDiagrams(
        clientOf(async () => {
          n++
          throw new AIError('bad key', false)
        }),
        meeting,
      ),
    ).rejects.toThrow('bad key')
    expect(n).toBe(1)
  })
})
