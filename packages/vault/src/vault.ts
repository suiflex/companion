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
    void this.io.mkdirs(this.io.join(this.io.root, TRANSCRIPT_DIR))
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
  async writeNote(note: VaultNote): Promise<string> {
    const path = this.notePath(note)
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
    const from = this.io.join(this.io.root, rel)
    const trashRoot = this.io.join(this.io.root, TRASH)
    await this.io.mkdirs(trashRoot)
    await this.io.trash(from)
  }
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
