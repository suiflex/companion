import { describe, expect, it } from 'vitest'
import { hideCopiedOriginals, inboxSearchResults } from './sidebarResults'

type SearchResult = { rel: string; platform: string }

describe('inboxSearchResults', () => {
  it('uses the inbox order when the query is empty', () => {
    const incoming: SearchResult[] = [
      { rel: 'newest.md', platform: 'google-meet' },
      { rel: 'older.md', platform: 'microsoft-teams' },
    ]

    expect(inboxSearchResults('   ', incoming, [])).toBe(incoming)
  })

  it('limits active searches to delivered notes', () => {
    const incoming: SearchResult[] = [{ rel: 'meeting.md', platform: 'google-meet' }]
    const matches: SearchResult[] = [
      { rel: 'manual.md', platform: 'manual' },
      { rel: 'meeting.md', platform: 'google-meet' },
      { rel: 'unclassified.md', platform: '' },
    ]

    expect(inboxSearchResults('budget', incoming, matches)).toEqual([matches[1]])
  })
})

describe('hideCopiedOriginals', () => {
  const meeting = { sessionKey: 'meet/abc#1', platform: 'google-meet' }
  const copy = { sessionKey: 'nota/x', platform: 'manual', source: 'meet/abc#1' }
  const other = { sessionKey: 'meet/def#2', platform: 'google-meet' }

  it('lists the copy in place of the meeting it was made from', () => {
    const all = [meeting, copy, other]
    expect(hideCopiedOriginals(all, all)).toEqual([copy, other])
  })

  it('checks copies across the whole vault, not just the listed rows', () => {
    expect(hideCopiedOriginals([meeting], [meeting, copy])).toEqual([])
  })
})
