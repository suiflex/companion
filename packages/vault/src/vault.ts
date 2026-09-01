// Vault file operations — the desktop's canonical store is a plain folder of
// .md notes (roadmap Stage 1 "Desktop workspace", mockup "Vault & jembatan").
// SQLite/FTS is only a derived index and can be rebuilt; the .md files are the
// source of truth.
//
// This module is framework-free and I/O-agnostic: it talks to the filesystem
// through a `VaultIo` so the same logic runs under Node (tests/docs) and in the
// Tauri WebView (which can only reach the disk through Rust IPC commands).
import { noteFromMarkdown, noteToMarkdown, type VaultNote } from './note'

export interface VaultIo {
  /** Absolute root of the vault (e.g. `~/Companion`). */
  readonly root: string
  /** Path join for a note/transcript path, absolute. */
  join(...parts: string[]): string
  /** Create a directory (and parents) if missing. */
  mkdirs(absDir: string): void
  /** Read a file's UTF-8 text; throws if missing. */
  readFile(abs: string): string
  /** Append a single line (plus newline) to a file, creating it if needed. */
  appendLine(abs: string, line: string): void
  /** Atomic write: temp file + rename so a crash never leaves a partial file. */
  writeFileAtomic(abs: string, content: string): void
  /** Move a file into the vault's `.trash` keeping its basename. */
  trash(abs: string): void
  /** All absolute `.md` paths under the vault, excluding `.trash`/`.transcript`. */
  listMarkdown(): string[]
  /** mtime (ms) of a file, for newest-first ordering. */
  mtimeMs(abs: string): number
}

const TRASH = '.trash'
const TRANSCRIPT_DIR = '.transcript'

export interface VaultOptions {
  io: VaultIo
}

/** Vault backed by any `VaultIo` (Node fs in tests, Rust IPC in the desktop). */
export class Vault {
  readonly io: VaultIo

  constructor(options: VaultOptions) {
    this.io = options.io
    this.io.mkdirs(this.io.join(this.io.root, TRANSCRIPT_DIR))
  }

  transcriptDir(): string {
    return this.io.join(this.io.root, TRANSCRIPT_DIR)
  }

  /** Absolute path for a note file, derived from `session_key`'s room + date. */
  notePath(note: VaultNote): string {
    const room = note.sessionKey.split('#')[0].replace(/[^a-zA-Z0-9-]+/g, '-')
    const day = note.startedAt?.slice(0, 10) ?? 'undated'
    return this.io.join(this.io.root, 'Rapat', day, `${room}.md`)
  }

  /** Write a note atomically so a crash never leaves a half-written .md. */
  writeNote(note: VaultNote): string {
    const path = this.notePath(note)
    this.io.mkdirs(dirname(path))
    this.io.writeFileAtomic(path, noteToMarkdown(note))
    return path
  }

  /** Read a note by its relative path under the vault. */
  readNote(rel: string): VaultNote {
    const abs = this.io.join(this.io.root, rel)
    return noteFromMarkdown(this.io.readFile(abs), basenameNoExt(rel))
  }

  /** All notes as relative paths, newest-updated first. */
  listNotes(): string[] {
    return this.io
      .listMarkdown()
      .map((abs) => relative(this.io.root, abs))
      .sort((a, b) => this.io.mtimeMs(joinAbs(this.io, b)) - this.io.mtimeMs(joinAbs(this.io, a)))
  }

  readAll(): VaultNote[] {
    return this.listNotes().map((rel) => this.readNote(rel))
  }

  /** Append one raw transcript line to the note's sidecar (never edited). */
  appendTranscript(noteId: string, line: string): string {
    const path = this.io.join(this.transcriptDir(), `${noteId}.jsonl`)
    this.io.appendLine(path, line)
    return path
  }

  readTranscript(noteId: string): string[] {
    const path = this.io.join(this.transcriptDir(), `${noteId}.jsonl`)
    return this.io
      .readFile(path)
      .split('\n')
      .filter((l) => l.trim() !== '')
  }

  /** Move a note to the trash instead of deleting (non-destructive). */
  trash(rel: string): void {
    const from = this.io.join(this.io.root, rel)
    const trashRoot = this.io.join(this.io.root, TRASH)
    this.io.mkdirs(trashRoot)
    this.io.trash(from)
  }
}

/** @internal dirname of an absolute path (also fine for forward slashes). */
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

/** @internal join for the sort comparator. */
function joinAbs(io: VaultIo, rel: string): string {
  return io.join(io.root, rel)
}
