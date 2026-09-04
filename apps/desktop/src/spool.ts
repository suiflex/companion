// Applying what the native host spooled.
//
// The host is the desktop binary in `--native-host` mode. It writes each batch
// to disk verbatim and knows nothing about notes — vault logic stays in
// TypeScript so the host and the app cannot drift apart, which is the rule
// CLAUDE.md records. This is the other half: read the spool, apply each batch
// with the same `applyBatch` the Node host used, delete what succeeded.
//
// What this buys beyond replacing Node: a delivery arriving while the app is
// closed waits on disk instead of being dropped.
import { invoke } from '@tauri-apps/api/core'
import { applyBatch, type BridgeBatch, type BridgeState, type Vault } from '@meetcc/vault'

interface Spooled {
  name: string
  json: string
}

const STATE_FILE = '.bridge-state.json'

/** The dedupe state, shared with the Node host's own file so a machine that
 *  has run both does not reapply what the other already wrote. */
async function loadState(vault: Vault): Promise<BridgeState> {
  try {
    const raw = await vault.io.readFile(vault.io.join(vault.io.root, STATE_FILE))
    return JSON.parse(raw) as BridgeState
  } catch {
    return { seen: {} }
  }
}

async function saveState(vault: Vault, state: BridgeState): Promise<void> {
  await vault.io.writeFileAtomic(
    vault.io.join(vault.io.root, STATE_FILE),
    JSON.stringify(state, null, 2),
  )
}

export interface DrainResult {
  /** Batches applied, so the caller knows whether to refresh. */
  applied: number
  /** Batches the host had already delivered before. */
  duplicates: number
  errors: string[]
}

/**
 * Apply everything waiting in the spool.
 *
 * A batch that fails is left on disk and reported: dropping it would lose the
 * captions it carries, and the next drain is a free retry. A batch that was
 * already applied is dropped — that is what the dedupe state is for.
 */
export async function drainSpool(vault: Vault): Promise<DrainResult> {
  const spooled = await invoke<Spooled[]>('take_spool').catch(() => [] as Spooled[])
  if (!spooled.length) return { applied: 0, duplicates: 0, errors: [] }

  const state = await loadState(vault)
  const out: DrainResult = { applied: 0, duplicates: 0, errors: [] }

  // One at a time, in arrival order: each call reads and writes the same seen
  // set, and running them together lets a later write clobber an earlier one —
  // losing exactly the operation id redelivery depends on.
  for (const item of spooled) {
    try {
      const batch = JSON.parse(item.json) as BridgeBatch
      const res = await applyBatch({ vault, now: () => new Date().toISOString() }, batch, state)
      if (res.status === 'error') {
        out.errors.push(res.error)
        continue
      }
      if (res.status === 'duplicate') out.duplicates += 1
      else out.applied += 1
      state.seen[batch.operationId] = new Date().toISOString()
      await invoke('drop_spooled', { name: item.name })
    } catch (e) {
      // Malformed JSON is not retryable, but it is also not ours to delete
      // silently — say so and leave the evidence on disk.
      out.errors.push(String(e))
    }
  }

  if (out.applied || out.duplicates) await saveState(vault, state)
  return out
}
