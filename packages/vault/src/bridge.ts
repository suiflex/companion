// Native-messaging bridge handler — the desktop side of extension ↔ vault.
import type { SqlDriver } from '@meetcc/store'
import { sessionKeyFor, uuidV7 } from './identity'
import type { Vault } from './vault'
import type { VaultNote } from './note'
import { createIndex } from './search'

export interface BatchLine {
  speaker: string
  text: string
  /** ISO timestamp of the caption line. */
  time: string
}

/** Payload the extension sends for one meeting delivery. */
export interface BridgeBatch {
  /** unique per batch; redelivery with the same id is deduped */
  operationId: string
  sessionKey?: string
  roomId: string
  platform: string
  startedAt: string
  participants: string[]
  /** Caption lines that arrived in this batch. */
  entries: BatchLine[]
  /** Optional preformatted note body (e.g. a prior AI summary). */
  markdown?: string
}

export interface BridgeState {
  /** `operationId` → first-delivery timestamp. */
  seen: Record<string, string>
}

export interface BridgeDeps {
  vault: Vault
  driver: SqlDriver
  now(): string
}

export type BridgeResult =
  | { status: 'ok'; applied: true; noteId: string }
  | { status: 'duplicate'; applied: false }
  | { status: 'error'; applied: false; error: string }

const emptyState = (): BridgeState => ({ seen: {} })

/**
 * Apply one batch to the vault. Idempotent by `operationId` (redelivery after
 * a disconnect is not applied twice) and by `session_key` (two batches for the
 * same meeting merge into one note). Caption lines are appended to the raw
 * transcript sidecar, never into the human-editable note body.
 */
export async function applyBatch(
  deps: BridgeDeps,
  batch: BridgeBatch,
  state = emptyState(),
): Promise<BridgeResult> {
  if (state.seen[batch.operationId]) {
    return { status: 'duplicate', applied: false }
  }
  const sessionKey = batch.sessionKey ?? sessionKeyFor(batch.roomId, batch.startedAt)
  const all = await deps.vault.readAll()
  const existing = all.find((n) => n.sessionKey === sessionKey)
  const note: VaultNote = existing ?? {
    id: uuidV7(),
    sessionKey,
    platform: batch.platform,
    startedAt: batch.startedAt,
    participants: batch.participants,
    tags: ['rapat'],
    transcript: transcriptPathFor(batch),
    updatedAt: deps.now(),
    title: '',
    body: '',
  }
  if (batch.markdown !== undefined && !existing) {
    // First delivery carries the (possibly AI-cleaned) note body. The writer
    // synthesizes the `# heading`, so split it out of the markdown body.
    const split = splitMarkdown(batch.markdown)
    note.title = split.title || batch.roomId
    note.body = split.body
  }
  note.updatedAt = deps.now()
  await deps.vault.writeNote(note)
  for (const line of batch.entries) {
    await deps.vault.appendTranscript(note.id, JSON.stringify(line))
  }
  state.seen[batch.operationId] = deps.now()
  await createIndex(deps.driver, deps.vault)
  return { status: 'ok', applied: true, noteId: note.id }
}

function splitMarkdown(md: string): { title: string; body: string } {
  const m = /^#\s+(.+)$/m.exec(md)
  if (!m) return { title: '', body: md.trim() }
  const body = md.replace(/^#\s+.+\n+/, '')
  return { title: m[1].trim(), body: body.trim() }
}

function transcriptPathFor(batch: BridgeBatch): string {
  const room = batch.roomId.replace(/[^a-zA-Z0-9-]+/g, '-')
  return `.transcript/${room}.jsonl`
}
