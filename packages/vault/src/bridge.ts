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
  /**
   * Set by a manual re-export: `markdown` replaces the body of a note that
   * already exists. Safe because a delivered note is an archive — editing
   * one in the app makes a copy — so the body is still what the extension
   * last sent, unless someone edited the file outside the app.
   */
  replaceBody?: boolean
  /**
   * `entries` is the whole transcript, not the lines since the last delivery.
   * When the note already exists its sidecar has them, so they are skipped
   * rather than appended a second time.
   */
  snapshot?: boolean
  /** Meeting tags from the extension, merged into the note's frontmatter tags. */
  tags?: string[]
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
  // Found together with its path: the user may have moved the note to
  // another folder, and `writeNote` would derive the original path and lay
  // down a second file there.
  let existing: VaultNote | undefined
  let existingRel: string | undefined
  for (const rel of await deps.vault.listNotes()) {
    const candidate = await deps.vault.readNote(rel)
    if (candidate.sessionKey === sessionKey) {
      existing = candidate
      existingRel = rel
      break
    }
  }
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
  if (batch.markdown !== undefined && (!existing || batch.replaceBody)) {
    // First delivery carries the (possibly AI-cleaned) note body. The writer
    // synthesizes the `# heading`, so split it out of the markdown body.
    const split = splitMarkdown(batch.markdown)
    note.title = split.title || batch.roomId
    note.body = split.body
  }
  if (batch.tags?.length) {
    // ponytail: merge only — a tag removed in the extension stays in the note
    note.tags = [...new Set([...(note.tags ?? []), ...batch.tags])]
  }
  note.updatedAt = deps.now()
  if (existingRel) await deps.vault.writeNoteAt(existingRel, note)
  else await deps.vault.writeNote(note)
  const lines = existing && batch.snapshot ? [] : batch.entries
  for (const line of lines) {
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
