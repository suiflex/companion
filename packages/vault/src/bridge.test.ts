import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Vault } from './vault'
import { openNodeVault } from './nodeIo'
import { applyBatch, type BridgeBatch } from './bridge'

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

it('applies a batch once and writes note + transcript to the sidecar', async () => {
  const result = await applyBatch(
    { vault, now: () => '2026-09-01T10:00:00Z' },
    batch({ markdown: '# Gate review\n\nKeputusan rapat soal vault.' }),
  )
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') return
  expect(result.noteId).toBeTruthy()

  const notes = await vault.readAll()
  expect(notes).toHaveLength(1)
  expect(notes[0].sessionKey).toContain('meet/abc#')
  // raw caption goes to the sidecar, never the note body
  expect(await vault.readTranscript(notes[0].id)).toHaveLength(1)
})

it('points the transcript frontmatter at the sidecar it actually writes', async () => {
  await applyBatch({ vault, now: () => '2026-09-01T10:00:00Z' }, batch())
  const [note] = await vault.readAll()
  expect(note.transcript).toBe(`.transcript/${note.id}.jsonl`)
  expect(await vault.readTranscript(note.id)).toHaveLength(1)
})

it('dedupes a redelivered operation_id', async () => {
  const now = () => '2026-09-01T10:00:00Z'
  const state = { seen: {} }
  const first = await applyBatch({ vault, now }, batch(), state)
  expect(first.status).toBe('ok')
  const second = await applyBatch({ vault, now }, batch(), state)
  expect(second.status).toBe('duplicate')
  expect(await vault.readAll()).toHaveLength(1)
})

it('merges two batches of the same meeting into one note (by session_key)', async () => {
  const now = () => '2026-09-01T10:00:00Z'
  const state = { seen: {} }
  await applyBatch(
    { vault, now },
    batch({ operationId: 'op-1', entries: [{ speaker: 'A', text: 'baris 1', time: 't' }] }),
    state,
  )
  await applyBatch(
    { vault, now },
    batch({ operationId: 'op-2', entries: [{ speaker: 'B', text: 'baris 2', time: 't' }] }),
    state,
  )
  const notes = await vault.readAll()
  expect(notes).toHaveLength(1)
  expect(await vault.readTranscript(notes[0].id)).toHaveLength(2)
})

it('fills a first-delivery note body from markdown (title split off)', async () => {
  await applyBatch(
    { vault, now: () => '2026-09-01T10:00:00Z' },
    batch({ markdown: '# Gate review\n\nDesktop ditahan sampai verdict.' }),
  )
  const [note] = await vault.readAll()
  expect(note.title).toBe('Gate review')
  expect(note.body).toBe('Desktop ditahan sampai verdict.')
})

// Not hypothetical: a `{type:'ping'}` message sent to a host that predated the
// ping branch fell through to here, and this wrote
// `Rapat/NaN-NaN-Na/undefined-TNaN.md` into a real vault before failing on the
// entries it did not have.
it('refuses a batch that identifies no meeting', async () => {
  const noRoom = await applyBatch({ vault, now: () => 'x' }, batch({ roomId: '' }))
  expect(noRoom.status).toBe('error')
  const noStart = await applyBatch({ vault, now: () => 'x' }, batch({ startedAt: '' }))
  expect(noStart.status).toBe('error')
  const badStart = await applyBatch({ vault, now: () => 'x' }, batch({ startedAt: 'nonsense' }))
  expect(badStart.status).toBe('error')
  expect(await vault.readAll()).toEqual([])
})

it('still accepts a batch that carries its own session key', async () => {
  // The roomId/startedAt pair only matters when the key has to be derived.
  const res = await applyBatch(
    { vault, now: () => '2026-08-28T07:00:00.000Z' },
    batch({ roomId: '', startedAt: '', sessionKey: 'meet/abc#2026-08-28T14:00' }),
  )
  expect(res.status).toBe('ok')
})
