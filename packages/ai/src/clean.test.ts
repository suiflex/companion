import { describe, expect, it, vi } from 'vitest'
import type { Entry } from '@meetcc/shared'
import {
  buildCleanPrompt,
  cleanTranscript,
  CLEAN_CHUNK_LINES,
  parseFixes,
} from './clean'
import { AIError, type AIClient } from './client'

const entry = (text: string): Entry => ({ speaker: 'A', text, time: '2026-07-13T01:00:00Z' })

const clientOf = (fn: (n: number) => Promise<string>): { client: AIClient; calls: () => number } => {
  let n = 0
  return {
    client: { provider: 'custom', complete: async () => fn(n++) },
    calls: () => n,
  }
}

describe('parseFixes', () => {
  it('maps line index to corrected text, trimming', () => {
    const m = parseFixes('{"fixes":[{"i":2,"text":" 2023 "},{"i":5,"text":"unpaid"}]}')
    expect(m.get(2)).toBe('2023')
    expect(m.get(5)).toBe('unpaid')
    expect(m.size).toBe(2)
  })

  it('ignores malformed entries and non-JSON', () => {
    expect(parseFixes('maaf tidak bisa').size).toBe(0)
    const m = parseFixes('{"fixes":[{"i":"x","text":"a"},{"i":1},{"text":"b"},{"i":3,"text":"  "}]}')
    expect(m.size).toBe(0)
  })
})

describe('buildCleanPrompt', () => {
  it('numbers lines with a global offset and speaker context', () => {
    const p = buildCleanPrompt([entry('halo'), entry('dunia')], 10)
    expect(p).toBe('[10] A: halo\n[11] A: dunia')
  })
})

describe('cleanTranscript', () => {
  it('applies fixes by index and reports the change count', async () => {
    const { client } = clientOf(async () =>
      JSON.stringify({ fixes: [{ i: 0, text: '2023' }, { i: 1, text: 'unpaid' }] }),
    )
    const { entries, changed } = await cleanTranscript(client, [entry('2003'), entry('unpad')])
    expect(entries.map((e) => e.text)).toEqual(['2023', 'unpaid'])
    expect(changed).toBe(2)
  })

  it('does not mutate the input entries', async () => {
    const input = [entry('2003')]
    const { client } = clientOf(async () => JSON.stringify({ fixes: [{ i: 0, text: '2023' }] }))
    await cleanTranscript(client, input)
    expect(input[0].text).toBe('2003') // original untouched
  })

  it('ignores out-of-range indices from the model', async () => {
    const { client } = clientOf(async () =>
      JSON.stringify({ fixes: [{ i: 99, text: 'nope' }, { i: 0, text: 'ok' }] }),
    )
    const { entries, changed } = await cleanTranscript(client, [entry('x')])
    expect(entries[0].text).toBe('ok')
    expect(changed).toBe(1)
  })

  it('keeps original lines when a chunk fails', async () => {
    const { client } = clientOf(async () => {
      throw new AIError('boom', true)
    })
    const { entries, changed } = await cleanTranscript(client, [entry('asli')])
    expect(entries[0].text).toBe('asli')
    expect(changed).toBe(0)
  })

  it('chunks long transcripts and offsets indices per chunk', async () => {
    const lines = Array.from({ length: CLEAN_CHUNK_LINES + 5 }, (_, i) => entry(`line ${i}`))
    const seenOffsets: number[] = []
    const client: AIClient = {
      provider: 'custom',
      complete: vi.fn(async (req) => {
        // first line number in the prompt = this chunk's offset
        seenOffsets.push(Number(/^\[(\d+)\]/.exec(req.user)![1]))
        return '{"fixes":[]}'
      }),
    }
    await cleanTranscript(client, lines)
    expect([...seenOffsets].sort((a, b) => a - b)).toEqual([0, CLEAN_CHUNK_LINES]) // two chunks
  })

  it('reports progress after each batch, ending at total', async () => {
    const lines = Array.from({ length: CLEAN_CHUNK_LINES + 5 }, () => entry('x'))
    const { client } = clientOf(async () => '{"fixes":[]}')
    const seen: Array<[number, number]> = []
    await cleanTranscript(client, lines, (done, total) => void seen.push([done, total]))
    expect(seen.at(-1)).toEqual([lines.length, lines.length]) // finishes at 100%
    expect(seen.every(([d, t]) => d <= t)).toBe(true)
  })

  it('resumes from startLine, skipping earlier chunks', async () => {
    const lines = Array.from({ length: CLEAN_CHUNK_LINES + 5 }, (_, i) => entry(`orig ${i}`))
    const { client, calls } = clientOf(async () =>
      JSON.stringify({ fixes: [{ i: CLEAN_CHUNK_LINES, text: 'FIXED' }] }),
    )
    const { entries, changed } = await cleanTranscript(client, lines, undefined, CLEAN_CHUNK_LINES)
    expect(calls()).toBe(1) // only the second chunk ran
    expect(entries[0].text).toBe('orig 0') // first chunk left untouched
    expect(entries[CLEAN_CHUNK_LINES].text).toBe('FIXED')
    expect(changed).toBe(1)
  })
})
