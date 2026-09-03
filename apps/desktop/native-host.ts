#!/usr/bin/env node
// Companion native-messaging host.
//
// Speaks Chrome Native Messaging over stdio (4-byte LE length + JSON). Each
// delivered batch is applied to the vault through @meetcc/vault's applyBatch
// (deduped by operation_id, merged by session_key); the FTS index is left for
// the desktop app to rebuild on scan, so the host needs no SQLite.
//
// State (seen operation_ids) and the vault root are file-based so the process,
// which Chrome spawns and kills freely, survives restarts.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { openNodeVault } from '../../packages/vault/src/nodeIo.ts'
import { applyBatch, type BridgeBatch } from '../../packages/vault/src/bridge.ts'

const root = process.env.COMPANION_VAULT ?? join(homedir(), 'Companion')
const stateFile = join(root, '.bridge-state.json')
mkdirSync(dirname(stateFile), { recursive: true })

function loadState(): { seen: Record<string, string> } {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    return { seen: {} }
  }
}

// A redelivery older than this many operations is not a case worth carrying
// forever; without a cap the seen-set grows for the life of the vault.
const MAX_SEEN = 500

function saveState(state: { seen: Record<string, string> }): void {
  const ids = Object.keys(state.seen)
  if (ids.length > MAX_SEEN) {
    const newest = ids
      .sort((a, b) => state.seen[a].localeCompare(state.seen[b]))
      .slice(-MAX_SEEN)
    state.seen = Object.fromEntries(newest.map((id) => [id, state.seen[id]]))
  }
  // Chrome kills this process freely, and a half-written state file reads back
  // as no state at all — which would silently drop every dedupe record.
  const tmp = `${stateFile}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, stateFile)
}

const vault = openNodeVault(root)

let buf = Buffer.alloc(0)
process.stdin.on('data', (chunk: Buffer) => {
  buf = Buffer.concat([buf, chunk])
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0)
    if (buf.length < 4 + len) return
    let msg: BridgeBatch & { type?: string }
    try {
      msg = JSON.parse(buf.slice(4, 4 + len).toString('utf8'))
    } catch {
      respond({ status: 'error', applied: false, error: 'bad-json' })
      buf = buf.slice(4 + len)
      continue
    }
    buf = buf.slice(4 + len)
    // A liveness check, so "is the desktop bridge reachable?" can be answered
    // without writing anything into the vault.
    if (msg.type === 'ping') {
      respond({ status: 'ok', pong: true, root })
      continue
    }
    queue(msg)
  }
})

// Chrome can deliver several batches in one chunk. Each one reads the seen-set,
// awaits the vault, then writes it back, so running them concurrently lets the
// later write clobber the earlier one — losing exactly the operation_id that
// redelivery-after-disconnect depends on. One at a time.
let pending: Promise<void> = Promise.resolve()

function queue(msg: BridgeBatch): void {
  pending = pending.then(() => handle(msg)).catch(() => {})
}

async function handle(msg: BridgeBatch): Promise<void> {
  const state = loadState()
  try {
    const result = await applyBatch({ vault, now: () => new Date().toISOString() }, msg, state)
    saveState(state)
    respond(result)
  } catch (e) {
    respond({ status: 'error', applied: false, error: (e as Error).message })
  }
}

function respond(obj: unknown): void {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)
  process.stdout.write(head)
  process.stdout.write(body)
}
