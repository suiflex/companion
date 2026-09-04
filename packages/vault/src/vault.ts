// Vault file operations — the desktop's canonical store is a plain folder of
// .md notes (roadmap Stage 1 "Desktop workspace", mockup "Vault & jembatan").
// SQLite/FTS is only a derived index and can be rebuilt; the .md files are the
// source of truth.
//
// This module is framework-free and I/O-agnostic: it talks to the filesystem
// through an async `VaultIo` so the same logic runs under Node (tests/scripts)
// and in the Tauri WebView (which reaches the disk only through async Rust IPC).
import { noteFromMarkdown, noteToMarkdown, type VaultNote } from './note'

export interface VaultIo {
  /** Absolute root of the vault (e.g. `~/Companion`). */
  readonly root: string
  /** Path join (pure, synchronous). */
  join(...parts: string[]): string
  /** Create a directory (and parents) if missing. */
  mkdirs(absDir: string): Promise<void>
  /** Read a file's UTF-8 text; rejects if missing. */
  readFile(abs: string): Promise<string>
  /** Append a single line (plus newline), creating the file if needed. */
  appendLine(abs: string, line: string): Promise<void>
  /** Atomic write: temp file + rename so a crash never leaves a partial file. */
  writeFileAtomic(abs: string, content: string): Promise<void>
  /** Move a file into the vault's `.trash` keeping its basename. */
  trash(abs: string): Promise<void>
  /** All absolute `.md` paths under the vault, excluding `.trash`/`.transcript`. */
  listMarkdown(): Promise<string[]>
  /** mtime (ms) of a file, for newest-first ordering. */
  mtimeMs(abs: string): Promise<number>
}

const TRANSCRIPT_DIR = '.transcript'

export interface VaultOptions {
  io: VaultIo
}

/** Vault backed by any `VaultIo` (Node fs in tests, Rust IPC in the desktop). */
export class Vault {
  readonly io: VaultIo

  constructor(options: VaultOptions) {
    this.io = options.io
  }

  transcriptDir(): string {
    return this.io.join(this.io.root, TRANSCRIPT_DIR)
  }

  /**
   * Absolute path for a note file, derived from its `session_key`.
   *
   * The start time has to be part of the filename: `session_key` identifies a
   * meeting down to the minute, so keying the file by room + day alone makes
   * the afternoon retro overwrite the morning standup held in the same room.
   */
  notePath(note: VaultNote): string {
    const [room, stamp] = splitSessionKey(note.sessionKey)
    // Every segment is slugged, the date included: `startedAt` arrives from the
    // extension over the bridge, and an unslugged `..` in it would walk the
    // write out of the vault entirely.
    // A day segment that is not a date is not a day: `undated` is where a note
    // with no usable start belongs, and it already exists for exactly that.
    const raw = slug(stamp?.slice(0, 10) || note.startedAt?.slice(0, 10) || '')
    const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : 'undated'
    const hhmm = slug(stamp?.slice(11, 16).replace(':', '') ?? '')
    const name = hhmm ? `${slug(room)}-${hhmm}` : slug(room)
    return this.io.join(this.io.root, 'Rapat', day, `${name}.md`)
  }

  /** Vault-relative path for a note — what the derived index stores. */
  relPath(note: VaultNote): string {
    return relative(this.io.root, this.notePath(note))
  }

  /**
   * Write a note atomically so a crash never leaves a half-written .md.
   *
   * The location is derived from the session key, which is right for a note
   * arriving over the bridge — it has no location yet. It is wrong for a note
   * that already lives somewhere: saving would write a *second* copy at the
   * derived path and leave the original where it was, giving two files with
   * one session key. Use `writeNoteAt` for a note you already have a path for.
   */
  async writeNote(note: VaultNote): Promise<string> {
    return this.writeNoteAt(this.relPath(note), note)
  }

  /** Write a note to the path it already occupies, wherever that is. */
  async writeNoteAt(rel: string, note: VaultNote): Promise<string> {
    const path = this.io.join(this.io.root, rel)
    await this.io.mkdirs(dirname(path))
    await this.io.writeFileAtomic(path, noteToMarkdown(note))
    return path
  }

  /** Read a note by its relative path under the vault. */
  async readNote(rel: string): Promise<VaultNote> {
    const abs = this.io.join(this.io.root, rel)
    return noteFromMarkdown(await this.io.readFile(abs), basenameNoExt(rel))
  }

  /** All notes as relative paths, newest-updated first. */
  async listNotes(): Promise<string[]> {
    const files = await this.io.listMarkdown()
    const rel = files.map((abs) => relative(this.io.root, abs))
    const withMtime = await Promise.all(
      rel.map(async (r) => ({ r, m: await this.io.mtimeMs(this.io.join(this.io.root, r)) })),
    )
    return withMtime.sort((a, b) => b.m - a.m).map((x) => x.r)
  }

  async readAll(): Promise<VaultNote[]> {
    const rel = await this.listNotes()
    return Promise.all(rel.map((r) => this.readNote(r)))
  }

  /** Append one raw transcript line to the note's sidecar (never edited). */
  async appendTranscript(noteId: string, line: string): Promise<string> {
    const path = this.io.join(this.transcriptDir(), `${noteId}.jsonl`)
    await this.io.mkdirs(this.transcriptDir())
    await this.io.appendLine(path, line)
    return path
  }

  async readTranscript(noteId: string): Promise<string[]> {
    const path = this.io.join(this.transcriptDir(), `${noteId}.jsonl`)
    return (await this.io.readFile(path))
      .split('\n')
      .filter((l) => l.trim() !== '')
  }

  /** Move a note to the trash instead of deleting (non-destructive). */
  async trash(rel: string): Promise<void> {
    await this.io.trash(this.io.join(this.io.root, rel))
  }
}

/** @internal filesystem-safe segment. */
function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, '-')
}

/** @internal `room#YYYY-MM-DDTHH:MM` -> `[room, stamp]`; stamp is absent for
 *  hand-made notes, whose keys carry no meeting start. */
function splitSessionKey(sessionKey: string): [string, string | undefined] {
  const hash = sessionKey.lastIndexOf('#')
  return hash === -1
    ? [sessionKey, undefined]
    : [sessionKey.slice(0, hash), sessionKey.slice(hash + 1)]
}

/** @internal dirname of a forward-slash path. */
function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? p : p.slice(0, i)
}

/** @internal basename without extension. */
function basenameNoExt(name: string): string {
  const base = name.split('/').pop() ?? name
  return base.replace(/\.[^.]+$/, '')
}

/** @internal relative path from root to abs, using forward slashes. */
function relative(root: string, abs: string): string {
  const r = root.replace(/\/+$/, '')
  return abs.startsWith(r + '/') ? abs.slice(r.length + 1) : abs
}
