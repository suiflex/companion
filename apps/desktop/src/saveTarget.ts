// Where a save goes, and what it writes.
//
// This was three nested ternaries inside a 1000-line component, which is
// exactly why it was wrong twice: a note that already had a file was written
// to a second path, and later every save of a delivered meeting made another
// copy. Neither could be tested where it lived.
import { uuidV7, type VaultNote } from '@meetcc/vault'

export interface SaveInput {
  note: VaultNote
  /** The path the open note occupies, or null for one that has no file yet. */
  selected: string | null
  /** Folder chosen for a note that has no file yet. */
  target: string | null
  /** Vault path derivation, injected so this stays pure. */
  relPath: (note: VaultNote) => string
  /** Notes already in the vault, used to find an existing copy of a meeting. */
  existing?: readonly { rel: string; id: string; sessionKey: string; source?: string }[]
  now?: () => string
  newSessionKey?: () => string
}

export interface SaveTarget {
  rel: string
  note: VaultNote
  /** True when this save created a copy rather than overwriting in place. */
  copied: boolean
}

/**
 * A delivered meeting is an archive: the vault keeps what the extension sent,
 * so editing one produces a copy and never rewrites the original.
 *
 * The copy is made **once**. A second edit of the same meeting reopens the
 * copy that already exists — found by its `source` — instead of laying down
 * another one, which is what turned "save" into "make another note" every
 * single time.
 */
export function saveTarget(input: SaveInput): SaveTarget {
  const { note, selected, target, relPath } = input
  const now = input.now ?? (() => new Date().toISOString())
  const inFolder = (derived: string): string =>
    target ? `${target}/${derived.split('/').pop()}` : derived

  const archived = Boolean(note.platform && note.platform !== 'manual')
  if (!archived) {
    const rel = selected ?? inFolder(relPath(note))
    return { rel, note: { ...note, updatedAt: now() }, copied: false }
  }

  const prior = input.existing?.find((e) => e.source === note.sessionKey)
  const copy: VaultNote = {
    ...note,
    id: uuidV7(),
    sessionKey: input.newSessionKey?.() ?? `nota/${Date.now().toString(36)}`,
    platform: 'manual',
    source: note.sessionKey,
    // The sidecar belongs to the archive; the copy links back by `source`
    // rather than claiming to own the raw captions.
    transcript: undefined,
    updatedAt: now(),
  }
  // An existing copy keeps its own identity and its own place on disk —
  // overwriting it is an edit, not a second copy. Its own id and session key
  // have to come back with it: reusing the meeting's would put two rows in
  // the index under one key, which is the UNIQUE violation from two rounds ago.
  if (prior) {
    return {
      rel: prior.rel,
      note: { ...copy, id: prior.id, sessionKey: prior.sessionKey },
      copied: false,
    }
  }
  return { rel: inFolder(relPath(copy)), note: copy, copied: true }
}
