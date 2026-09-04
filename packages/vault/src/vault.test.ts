import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '@meetcc/store'
import { openNodeVault } from './nodeIo'
import type { Vault } from './vault'
import { createIndex, search } from './search'
import type { VaultNote } from './note'

let dir: string
let vault: Vault

function note(over: Partial<VaultNote> = {}): VaultNote {
  return {
    id: '0191f3c2-8a41-7a2e-9c33-1b7d5e0a4f21',
    sessionKey: 'meet/abc#2026-08-28T14:00',
    platform: 'google-meet',
    startedAt: '2026-08-28T14:00:12+07:00',
    updatedAt: '2026-09-01T10:00:00+07:00',
    title: 'Gate review',
    body: 'Desktop vault ditahan sampai verdict gate.',
    ...over,
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vault-'))
  vault = openNodeVault(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('vault file ops', () => {
  it('writes an atomic .md note and reads it back', async () => {
    const path = await vault.writeNote(note())
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('# Gate review')
    const back = await vault.readAll()
    expect(back[0].sessionKey).toBe('meet/abc#2026-08-28T14:00')
  })

  it('appends raw transcript lines to a sidecar, never overwriting', async () => {
    await vault.writeNote(note())
    await vault.appendTranscript('0191f3c2', '{"speaker":"Andi","text":"a"}')
    await vault.appendTranscript('0191f3c2', '{"speaker":"Rani","text":"b"}')
    expect(await vault.readTranscript('0191f3c2')).toHaveLength(2)
  })

  it('moves a note to trash instead of deleting', async () => {
    const path = await vault.writeNote(note())
    const rel = path.replace(dir + '/', '')
    await vault.trash(rel)
    expect(existsSync(path)).toBe(false)
    expect(await vault.listNotes()).toHaveLength(0)
    // original content still exists under .trash
    expect(existsSync(join(dir, '.trash'))).toBe(true)
  })

  it('keeps two meetings in the same room on the same day apart', async () => {
    // session_key identifies a meeting down to the minute; a file keyed by room
    // + day alone made the afternoon retro overwrite the morning standup.
    const morning = await vault.writeNote(
      note({ id: 'a', sessionKey: 'meet/abc#2026-08-28T09:00', title: 'Standup' }),
    )
    const afternoon = await vault.writeNote(
      note({ id: 'b', sessionKey: 'meet/abc#2026-08-28T14:00', title: 'Retro' }),
    )
    expect(morning).not.toBe(afternoon)
    expect(existsSync(morning)).toBe(true)
    expect(existsSync(afternoon)).toBe(true)
    const titles = (await vault.readAll()).map((n) => n.title).sort()
    expect(titles).toEqual(['Retro', 'Standup'])
  })

  it('names a hand-made note without a session start', async () => {
    const path = await vault.writeNote(
      note({ sessionKey: 'nota/lz4x', startedAt: undefined, title: 'Nota baru' }),
    )
    expect(path.endsWith('Rapat/undated/nota-lz4x.md')).toBe(true)
  })

  it('keeps a hostile timestamp inside the vault', async () => {
    // startedAt crosses the bridge from the extension; it must not be able to
    // steer the write out of the vault root.
    const path = await vault.writeNote(
      note({ sessionKey: 'meet/abc', startedAt: '../../../..', title: 'Escape' }),
    )
    expect(path.startsWith(dir + '/')).toBe(true)
    expect(path).not.toContain('..')
  })

  it('does not let the trash overwrite a note already in it', async () => {
    const first = await vault.writeNote(note({ startedAt: '2026-08-27T14:00:12+07:00' }))
    await vault.trash(first.replace(dir + '/', ''))
    const second = await vault.writeNote(note({ startedAt: '2026-08-28T14:00:12+07:00' }))
    await vault.trash(second.replace(dir + '/', ''))
    const trashed = readdirSync(join(dir, '.trash'))
    expect(trashed).toHaveLength(2)
  })

  it('lists notes newest-updated first', async () => {
    const older = await vault.writeNote(note({ id: 'a', title: 'Older' }))
    const newer = await vault.writeNote(
      note({ id: 'b', sessionKey: 'meet/x#2026-08-28T14:00', updatedAt: '2026-09-02T10:00:00+07:00', title: 'Newer' }),
    )
    // listNotes orders by filesystem mtime, and two writes this close land in
    // the same tick on a coarse-resolution filesystem — the tie then resolves
    // by directory order, which is why CI saw 'Older' first on Linux. Stamp
    // the two apart so the assertion tests the ordering, not the clock.
    utimesSync(older, new Date(1_000_000), new Date(1_000_000))
    utimesSync(newer, new Date(2_000_000), new Date(2_000_000))
    const list = await vault.listNotes()
    expect(list).toHaveLength(2)
    expect((await vault.readNote(list[0])).title).toBe('Newer')
  })
})

describe('a note that has been moved', () => {
  it('is saved back where it is, not where its session key implies', async () => {
    // The bug this pins: `writeNote` derives the path from the session key, so
    // saving a moved note wrote a *second* copy at the derived location and
    // left the original behind — two files carrying one session key.
    const n = note({ sessionKey: 'nota/abc', startedAt: undefined })
    const derived = vault.relPath(n)
    await vault.writeNote(n)

    const moved = 'Projects/Alpha/abc.md'
    await vault.writeNoteAt(moved, { ...n, body: 'edited' })
    // the original is still where writeNote put it, so remove it the way a
    // real move does
    rmSync(join(dir, derived))

    await vault.writeNoteAt(moved, { ...n, body: 'edited twice' })

    const paths = await vault.listNotes()
    expect(paths).toEqual([moved])
    expect((await vault.readNote(moved)).body).toBe('edited twice')
  })

  it('is indexed at the path it occupies', async () => {
    // Indexing by the derived path meant two notes deriving the same location
    // collided on session_key, which surfaced as a UNIQUE constraint error on
    // save rather than as anything a reader could act on.
    const { driver } = await openDatabase()
    const n = note({ sessionKey: 'nota/abc', startedAt: undefined })
    const moved = 'Projects/Alpha/abc.md'
    await vault.writeNoteAt(moved, n)

    await createIndex(driver, vault, [n], [moved])
    const hit = search(driver, 'Gate')[0]
    expect(hit.path).toBe(moved)
  })

  it('skips a duplicate session key instead of failing the whole index', async () => {
    // Two files can carry one session key — a .md copied in Finder, or a
    // duplicate an older build wrote. The index can hold only one, but taking
    // the window down over it is worse than indexing what it can.
    const { driver } = await openDatabase()
    const a = note({ id: 'a', sessionKey: 'nota/same', startedAt: undefined, title: 'One' })
    const b = note({ id: 'b', sessionKey: 'nota/same', startedAt: undefined, title: 'Two' })

    const skipped = await createIndex(driver, vault, [a, b], ['x/one.md', 'y/two.md'])
    expect(skipped).toEqual(['y/two.md'])
    expect(search(driver, 'One')[0].path).toBe('x/one.md')
  })
})

describe('derived index', () => {
  it('rebuilds from source and searches title/body', async () => {
    await vault.writeNote(note())
    await vault.writeNote(
      note({ id: 'c', sessionKey: 'teams/y#2026-08-28T14:00', title: 'Standup', body: 'Installer spike GO' }),
    )
    const { driver } = await openDatabase()
    await createIndex(driver, vault)
    const hits = search(driver, 'Installer')
    expect(hits.map((h) => h.title)).toContain('Standup')
    const gate = search(driver, 'Gate')
    expect(gate.map((h) => h.title)).toContain('Gate review')
  })

  it('indexes notes the caller already read without reading them again', async () => {
    await vault.writeNote(note())
    const notes = await vault.readAll()
    let reads = 0
    const counted = {
      readAll: async () => {
        reads++
        return notes
      },
      relPath: (n: VaultNote) => vault.relPath(n),
    } as unknown as Vault
    const { driver } = await openDatabase()
    await createIndex(driver, counted, notes)
    expect(reads).toBe(0)
    expect(search(driver, 'Gate')).toHaveLength(1)
  })

  it('returns nothing for a query too short to make an FTS term', async () => {
    await vault.writeNote(note())
    const { driver } = await openDatabase()
    await createIndex(driver, vault)
    // one character survives neither ftsQuery nor `MATCH ''`
    expect(search(driver, 'a')).toEqual([])
    expect(search(driver, '  ')).toEqual([])
  })

  it('delete + rebuild restores the index from .md source', async () => {
    await vault.writeNote(note())
    const { driver } = await openDatabase()
    await createIndex(driver, vault)
    expect(search(driver, 'vault')).toHaveLength(1)
    // wipe and rebuild — the .md files are the source of truth
    driver.exec('DELETE FROM vault_notes')
    expect(search(driver, 'vault')).toHaveLength(0)
    await createIndex(driver, vault)
    expect(search(driver, 'vault')).toHaveLength(1)
  })
})

it('parks a note with an unusable date in undated', async () => {
  // The day segment is part of a path, so a non-date there is a directory
  // named after the failure — `Rapat/NaN-NaN-Na/` is what that looked like.
  const rel = vault.relPath({
    id: 'i',
    sessionKey: 'meet/abc#not-a-date',
    platform: 'google-meet',
    updatedAt: '2026-01-01T00:00:00Z',
    title: 't',
    body: '',
  })
  expect(rel.split('/')[1]).toBe('undated')
})
