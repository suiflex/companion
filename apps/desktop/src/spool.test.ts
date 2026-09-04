// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openNodeVault } from '@meetcc/vault/nodeIo'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const { drainSpool } = await import('./spool')

const batch = (operationId: string) => ({
  operationId,
  roomId: 'meet/abc',
  platform: 'google-meet',
  startedAt: '2026-09-04T14:00:00+07:00',
  participants: ['Andi'],
  entries: [{ speaker: 'Andi', text: 'halo', time: '2026-09-04T14:00:01Z' }],
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spool-'))
  invoke.mockReset()
})

describe('drainSpool', () => {
  it('applies a spooled batch and drops it', async () => {
    const vault = openNodeVault(dir)
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'take_spool' ? [{ name: 'a.json', json: JSON.stringify(batch('op-1')) }] : undefined,
    )
    const res = await drainSpool(vault)
    expect(res.applied).toBe(1)
    expect(invoke).toHaveBeenCalledWith('drop_spooled', { name: 'a.json' })
    expect((await vault.readAll()).length).toBe(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('does not apply the same delivery twice', async () => {
    // The host spools whatever the browser sends, including a redelivery after
    // a disconnect. The dedupe that used to live in the host lives here now, so
    // this is the test that moved with it.
    const vault = openNodeVault(dir)
    const spool = [{ name: 'a.json', json: JSON.stringify(batch('op-1')) }]
    invoke.mockImplementation(async (cmd: string) => (cmd === 'take_spool' ? spool : undefined))
    await drainSpool(vault)
    const second = await drainSpool(vault)
    expect(second.duplicates).toBe(1)
    expect(second.applied).toBe(0)
    expect((await vault.readAll()).length).toBe(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('leaves a batch it could not apply on disk', async () => {
    // Deleting it would lose the captions; the next drain is a free retry.
    const vault = openNodeVault(dir)
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'take_spool' ? [{ name: 'bad.json', json: '{ not json' }] : undefined,
    )
    const res = await drainSpool(vault)
    expect(res.errors.length).toBe(1)
    expect(invoke).not.toHaveBeenCalledWith('drop_spooled', expect.anything())
    rmSync(dir, { recursive: true, force: true })
  })

  it('costs one call when the spool is empty', async () => {
    // This runs on a five-second timer for the life of the app.
    const vault = openNodeVault(dir)
    invoke.mockImplementation(async () => [])
    await drainSpool(vault)
    expect(invoke).toHaveBeenCalledTimes(1)
    rmSync(dir, { recursive: true, force: true })
  })
})
