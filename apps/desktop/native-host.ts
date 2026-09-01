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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
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

function saveState(state: { seen: Record<string, string> }): void {
  writeFileSync(stateFile, JSON.stringify(state, null, 2))
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
    void handle(msg)
  }
})

async function handle(msg: BridgeBatch): Promise<void> {
  const state = loadState()
  const result = await applyBatch({ vault, now: () => new Date().toISOString() }, msg, state)
  saveState(state)
  respond(result)
}

function respond(obj: unknown): void {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)
  process.stdout.write(head)
  process.stdout.write(body)
}
