// Native-messaging bridge handler — the desktop side of extension ↔ vault.
// The FTS index is derived and rebuilt by the desktop app when it scans the
// vault, not by the bridge, so this module has no SqlDriver dependency and can
// run in a plain Node native-messaging host without @meetcc/store.
import { sessionKeyFor, uuidV7 } from './identity'
import type { Vault } from './vault'
import type { VaultNote } from './note'

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
  // A batch that identifies no meeting cannot be written anywhere sensible.
  // Without this the derived session key came out `undefined#NaN-NaN-NaNTNaN`
  // and the note landed in `Rapat/NaN-NaN-Na/undefined-TNaN.md` — a real file
  // in a real vault, produced by a message that was never a delivery at all.
  if (!batch.sessionKey) {
    if (!batch.roomId) {
      return { status: 'error', applied: false, error: 'batch has no roomId' }
    }
    if (!batch.startedAt || Number.isNaN(Date.parse(batch.startedAt))) {
      return { status: 'error', applied: false, error: 'batch has no usable startedAt' }
    }
  }
  const sessionKey = batch.sessionKey ?? sessionKeyFor(batch.roomId, batch.startedAt)
  const all = await deps.vault.readAll()
  const existing = all.find((n) => n.sessionKey === sessionKey)
  const id = uuidV7()
  const note: VaultNote = existing ?? {
    id,
    sessionKey,
    platform: batch.platform,
    startedAt: batch.startedAt,
    participants: batch.participants,
    // Data, not UI: this tag is written into note frontmatter and is what
    // existing vaults are already filtered by. Renaming it with the interface
    // language would split one vault across two vocabularies.
    tags: ['rapat'],
    // must match where appendTranscript writes it, below
    transcript: `.transcript/${id}.jsonl`,
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
  return { status: 'ok', applied: true, noteId: note.id }
}

function splitMarkdown(md: string): { title: string; body: string } {
  const m = /^#\s+(.+)$/m.exec(md)
  if (!m) return { title: '', body: md.trim() }
  const body = md.replace(/^#\s+.+\n+/, '')
  return { title: m[1].trim(), body: body.trim() }
}
