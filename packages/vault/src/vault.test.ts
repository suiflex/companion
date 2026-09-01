import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '@meetcc/store'
import { Vault } from './vault'
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
  vault = new Vault({ root: dir })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('vault file ops', () => {
  it('writes an atomic .md note and reads it back', () => {
    const path = vault.writeNote(note())
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('# Gate review')
    const back = vault.readAll()[0]
    expect(back.sessionKey).toBe('meet/abc#2026-08-28T14:00')
  })

  it('appends raw transcript lines to a sidecar, never overwriting', () => {
    vault.writeNote(note())
    vault.appendTranscript('0191f3c2', '{"speaker":"Andi","text":"a"}')
    vault.appendTranscript('0191f3c2', '{"speaker":"Rani","text":"b"}')
    expect(vault.readTranscript('0191f3c2')).toHaveLength(2)
  })

  it('moves a note to trash instead of deleting', () => {
    const path = vault.writeNote(note())
    const rel = path.replace(dir + '/', '')
    vault.trash(rel)
    expect(existsSync(path)).toBe(false)
    expect(vault.listNotes()).toHaveLength(0)
    // original content still exists under .trash
    expect(existsSync(join(dir, '.trash'))).toBe(true)
  })

  it('lists notes newest-updated first', () => {
    vault.writeNote(note({ id: 'a', title: 'Older' }))
    vault.writeNote(note({ id: 'b', sessionKey: 'meet/x#2026-08-28T14:00', updatedAt: '2026-09-02T10:00:00+07:00', title: 'Newer' }))
    const list = vault.listNotes()
    expect(list).toHaveLength(2)
    expect(vault.readNote(list[0]).title).toBe('Newer')
  })
})

describe('derived index', () => {
  it('rebuilds from source and searches title/body', async () => {
    vault.writeNote(note())
    vault.writeNote(note({ id: 'c', sessionKey: 'teams/y#2026-08-28T14:00', title: 'Standup', body: 'Installer spike GO' }))
    const { driver } = await openDatabase()
    createIndex(driver, vault)
    const hits = search(driver, 'Installer')
    expect(hits.map((h) => h.title)).toContain('Standup')
    const gate = search(driver, 'Gate')
    expect(gate.map((h) => h.title)).toContain('Gate review')
  })

  it('delete + rebuild restores the index from .md source', async () => {
    vault.writeNote(note())
    const { driver } = await openDatabase()
    createIndex(driver, vault)
    expect(search(driver, 'vault')).toHaveLength(1)
    // wipe and rebuild — the .md files are the source of truth
    driver.exec('DELETE FROM vault_notes')
    expect(search(driver, 'vault')).toHaveLength(0)
    createIndex(driver, vault)
    expect(search(driver, 'vault')).toHaveLength(1)
  })
})
