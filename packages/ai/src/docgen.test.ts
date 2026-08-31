import { describe, expect, it } from 'vitest'
import type { Analysis, Entry, Meeting } from '@meetcc/shared'
import {
  buildDocUserPrompt,
  DOC_META,
  generateDoc,
  MAP_CHUNK_LINES,
  MAP_THRESHOLD_CHARS,
  prepareContext,
} from './docgen'
import { AIError, type AIClient } from './client'

const meeting: Meeting = {
  id: 'abc-defg-hij',
  meta: { id: 'abc-defg-hij', startedAt: '2026-07-13T01:00:00Z', lastSeenAt: '2026-07-13T02:00:00Z' },
  entries: [{ speaker: 'Gunawan', text: 'Kita butuh fitur export', time: '2026-07-13T01:00:05Z' }],
}

const analysis = {
  executiveSummary: 'Bahas fitur export.',
  decisions: [{ what: 'Pakai PDF', why: '', rejected: [], topic: 'export' }],
  actionItems: [{ task: 'Buat export', owner: 'Manan', due: 'Jumat' }],
  openQuestions: ['Format apa?'],
  nextSteps: ['Prototype'],
} as unknown as Analysis

// call-recording mock: returns outputs[i] for the i-th complete() call
function seq(outputs: Array<string | Error>) {
  const systems: string[] = []
  let i = 0
  const client: AIClient = {
    provider: 'custom',
    complete: async (req) => {
      systems.push(req.system)
      const out = outputs[Math.min(i, outputs.length - 1)]
      i++
      if (out instanceof Error) throw out
      return out
    },
  }
  return { client, systems, calls: () => i }
}

describe('DOC_META', () => {
  it('defines brd, prd, notulen with rubric + grounding rules', () => {
    expect(Object.keys(DOC_META).sort()).toEqual(['brd', 'notulen', 'prd', 'recap'])
    expect(DOC_META.prd.system).toContain('Acceptance criteria')
    expect(DOC_META.brd.system).toContain('_[belum dibahas]_')
  })
})

describe('buildDocUserPrompt', () => {
  it('embeds transcript and analysis context', () => {
    const p = buildDocUserPrompt(meeting, analysis)
    expect(p).toContain('Gunawan:')
    expect(p).toContain('Pakai PDF')
  })
})

describe('prepareContext (map-reduce)', () => {
  it('returns the full transcript when it fits (no map calls)', async () => {
    const { client, calls } = seq(['unused'])
    const ctx = await prepareContext(client, meeting)
    expect(ctx).toContain('Gunawan:')
    expect(calls()).toBe(0) // short meeting -> no summarization
  })

  it('map-reduces a long meeting into notes, one call per chunk', async () => {
    const long: Meeting = {
      ...meeting,
      entries: Array.from(
        { length: MAP_CHUNK_LINES * 2 + 10 },
        (_, k): Entry => ({ speaker: 'A', text: 'x'.repeat(200) + k, time: '2026-07-13T01:00:00Z' }),
      ),
    }
    expect(long.entries.length * 200).toBeGreaterThan(MAP_THRESHOLD_CHARS)
    const { client, calls } = seq(['- poin [01:00]'])
    const ctx = await prepareContext(client, long)
    expect(calls()).toBe(3) // ceil((2*120+10)/120)
    expect(ctx).toContain('poin')
  })
})

describe('generateDoc (draft -> critique -> revise)', () => {
  it('runs three passes and returns the revised doc with branding', async () => {
    const { client, systems, calls } = seq(['# DRAFT', 'perbaiki: X kabur', '# FINAL REVISED'])
    const out = await generateDoc(client, meeting, analysis, 'prd')
    expect(calls()).toBe(3)
    expect(out).toContain('# FINAL REVISED')
    expect(out).toContain('powered by suiflex')
    expect(systems[0]).toContain('Product Requirements Document') // draft uses the PRD rubric
  })

  it('short-circuits when the critique finds no issues', async () => {
    const { client, calls } = seq(['# DRAFT OK', 'TIDAK ADA MASALAH BERARTI'])
    const out = await generateDoc(client, meeting, null, 'brd')
    expect(calls()).toBe(2) // no revise pass
    expect(out).toContain('# DRAFT OK')
  })

  it('degrades to the draft when refinement fails', async () => {
    const { client } = seq(['# DRAFT', new AIError('reviewer down', false)])
    const out = await generateDoc(client, meeting, null, 'notulen')
    expect(out).toContain('# DRAFT')
    expect(out).toContain('powered by suiflex')
  })

  it('strips a wrapping markdown fence from the draft', async () => {
    const { client } = seq(['```markdown\n# BRD\n\nisi\n```', 'TIDAK ADA MASALAH BERARTI'])
    const out = await generateDoc(client, meeting, null, 'brd')
    expect(out).toContain('# BRD')
    expect(out).not.toContain('```markdown')
  })

  it('throws when the draft is empty', async () => {
    const { client } = seq(['   '])
    await expect(generateDoc(client, meeting, null, 'notulen')).rejects.toThrow(AIError)
  })

  it('reports progress ending at 100% (step === total)', async () => {
    const { client } = seq(['# DRAFT', 'ada masalah', '# FINAL'])
    const steps: Array<[number, number]> = []
    await generateDoc(client, meeting, null, 'brd', (step, total) => void steps.push([step, total]))
    const [lastStep, lastTotal] = steps.at(-1)!
    expect(lastStep).toBe(lastTotal) // finished
    expect(steps.every(([s, t]) => s <= t)).toBe(true)
  })
})
