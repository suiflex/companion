import { describe, expect, it, vi } from 'vitest'
import type { Analysis, Meeting } from '@meetcc/shared'
import { buildDocUserPrompt, DOC_META, generateDoc } from './docgen'
import { AIError, type AIClient } from './client'

const meeting: Meeting = {
  id: 'abc-defg-hij',
  meta: {
    id: 'abc-defg-hij',
    startedAt: '2026-07-13T01:00:00Z',
    lastSeenAt: '2026-07-13T02:00:00Z',
  },
  entries: [
    {
      speaker: 'Gunawan',
      text: 'Kita butuh fitur export',
      time: '2026-07-13T01:00:05Z',
    },
  ],
}

const analysis = {
  executiveSummary: 'Bahas fitur export.',
  decisions: [{ what: 'Pakai PDF', why: '', rejected: [], topic: 'export' }],
  actionItems: [{ task: 'Buat export', owner: 'Manan', due: 'Jumat' }],
  openQuestions: ['Format apa?'],
  nextSteps: ['Prototype'],
} as unknown as Analysis

const clientOf = (fn: () => Promise<string>): AIClient => ({
  provider: 'custom',
  complete: fn,
})

describe('DOC_META', () => {
  it('defines brd, prd, and notulen', () => {
    expect(Object.keys(DOC_META).sort()).toEqual(['brd', 'notulen', 'prd'])
  })
})

describe('buildDocUserPrompt', () => {
  it('embeds transcript and analysis context', () => {
    const p = buildDocUserPrompt(meeting, analysis)
    expect(p).toContain('Gunawan:')
    expect(p).toContain('Bahas fitur export.')
    expect(p).toContain('Pakai PDF')
  })

  it('works without an analysis', () => {
    expect(buildDocUserPrompt(meeting, null)).toContain('Transcript:')
  })
})

describe('generateDoc', () => {
  it('appends branding and strips a wrapping markdown fence', async () => {
    const out = await generateDoc(
      clientOf(async () => '```markdown\n# BRD\n\nLatar belakang.\n```'),
      meeting,
      analysis,
      'brd',
    )
    expect(out).toContain('# BRD')
    expect(out).not.toContain('```markdown')
    expect(out).toContain('powered by suiflex')
  })

  it('uses the requested type system prompt', async () => {
    let seenSystem = ''
    const client: AIClient = {
      provider: 'custom',
      complete: vi.fn(async (req) => {
        seenSystem = req.system
        return '# PRD'
      }),
    }
    await generateDoc(client, meeting, null, 'prd')
    expect(seenSystem).toContain('Product Requirements Document')
    expect(seenSystem).not.toContain('Business Requirements Document')
  })

  it('retries once on retryable failure', async () => {
    let calls = 0
    const out = await generateDoc(
      clientOf(async () => {
        if (++calls === 1) throw new AIError('boom', true)
        return '# BRD ok'
      }),
      meeting,
      null,
      'brd',
    )
    expect(calls).toBe(2)
    expect(out).toContain('# BRD ok')
  })

  it('throws on empty output', async () => {
    await expect(
      generateDoc(
        clientOf(async () => '   '),
        meeting,
        null,
        'notulen',
      ),
    ).rejects.toThrow(AIError)
  })
})
