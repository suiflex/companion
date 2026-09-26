import { describe, expect, it } from 'vitest'
import { inboxSearchResults } from './sidebarResults'

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
