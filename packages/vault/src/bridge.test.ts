import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '@meetcc/store'
import { type Vault } from './vault'
import { openNodeVault } from './nodeIo'
import { applyBatch, type BridgeBatch } from './bridge'
import { search } from './search'

let dir: string
let vault: Vault

const batch = (over: Partial<BridgeBatch> = {}): BridgeBatch => ({
  operationId: 'op-1',
  roomId: 'meet/abc',
  platform: 'google-meet',
  startedAt: '2026-08-28T14:00:12+07:00',
  participants: ['Andi', 'Rani'],
  entries: [{ speaker: 'Andi', text: 'Vault ditahan dulu', time: '2026-08-28T14:01:00Z' }],
  ...over,
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bridge-'))
  vault = openNodeVault(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

it('applies a batch once and writes note + transcript, with caption searchable', async () => {
  const { driver } = await openDatabase()
  const result = await applyBatch(
    { vault, driver, now: () => '2026-09-01T10:00:00Z' },
    batch({ markdown: '# Gate review\n\nKeputusan rapat soal vault.' }),
  )
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') return
  expect(result.noteId).toBeTruthy()

  const notes = await vault.readAll()
  expect(notes).toHaveLength(1)
  expect(notes[0].sessionKey).toContain('meet/abc#')
  // raw caption goes to the sidecar, not the note body
  expect(await vault.readTranscript(notes[0].id)).toHaveLength(1)
  // note body is searchable
  const hits = search(driver, 'Keputusan')
  expect(hits.map((h) => h.id)).toContain(notes[0].id)
})

it('dedupes a redelivered operation_id', async () => {
  const { driver } = await openDatabase()
  const now = () => '2026-09-01T10:00:00Z'
  const state = { seen: {} }
  const first = await applyBatch({ vault, driver, now }, batch(), state)
  expect(first.status).toBe('ok')
  const second = await applyBatch({ vault, driver, now }, batch(), state)
  expect(second.status).toBe('duplicate')
  expect(await vault.readAll()).toHaveLength(1)
})

it('merges two batches of the same meeting into one note (by session_key)', async () => {
  const { driver } = await openDatabase()
  const now = () => '2026-09-01T10:00:00Z'
  const state = { seen: {} }
  await applyBatch(
    { vault, driver, now },
    batch({ operationId: 'op-1', entries: [{ speaker: 'A', text: 'baris 1', time: 't' }] }),
    state,
  )
  await applyBatch(
    { vault, driver, now },
    batch({ operationId: 'op-2', entries: [{ speaker: 'B', text: 'baris 2', time: 't' }] }),
    state,
  )
  const notes = await vault.readAll()
  expect(notes).toHaveLength(1)
  expect(await vault.readTranscript(notes[0].id)).toHaveLength(2)
})

it('fills a first-delivery note body from markdown (title split off)', async () => {
  const { driver } = await openDatabase()
  await applyBatch(
    { vault, driver, now: () => '2026-09-01T10:00:00Z' },
    batch({ markdown: '# Gate review\n\nDesktop ditahan sampai verdict.' }),
  )
  const [note] = await vault.readAll()
  expect(note.title).toBe('Gate review')
  expect(note.body).toBe('Desktop ditahan sampai verdict.')
})
