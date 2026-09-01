// Vault file operations — the desktop's canonical store is a plain folder of
// .md notes (roadmap Stage 1 "Desktop workspace", mockup "Vault & jembatan").
// SQLite/FTS is only a derived index and can be rebuilt; the .md files are the
// source of truth. Node-only by design (this is the Tauri desktop core).
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, relative, extname } from 'node:path'
import { noteFromMarkdown, noteToMarkdown, type VaultNote } from './note'

const TRASH = '.trash'
const TRANSCRIPT_DIR = '.transcript'

export interface VaultOptions {
  root: string
}

/** Filesystem-backed vault rooted at `options.root` (e.g. `~/Companion`). */
export class Vault {
  readonly root: string

  constructor(options: VaultOptions) {
    this.root = options.root
    mkdirSync(this.root, { recursive: true })
    mkdirSync(this.transcriptDir(), { recursive: true })
  }

  transcriptDir(): string {
    return join(this.root, TRANSCRIPT_DIR)
  }

  /** Path for a note file, derived from `session_key`'s room + start date. */
  notePath(note: VaultNote): string {
    const room = note.sessionKey.split('#')[0].replace(/[^a-zA-Z0-9-]+/g, '-')
    const day = note.startedAt?.slice(0, 10) ?? 'undated'
    return join(this.root, 'Rapat', day, `${room}.md`)
  }

  /** Write a note atomically: temp file + rename, so a crash never leaves a
   *  half-written .md (roadmap crash-injection requirement). */
  writeNote(note: VaultNote): string {
    const path = this.notePath(note)
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, noteToMarkdown(note), 'utf8')
    renameSync(tmp, path)
    return path
  }

  readNote(rel: string): VaultNote {
    const path = join(this.root, rel)
    return noteFromMarkdown(readFileSync(path, 'utf8'), basenameNoExt(rel))
  }

  /** All notes under the vault, relative paths, newest-updated first. */
  listNotes(): string[] {
    return walkMd(this.root)
      .map((abs) => relative(this.root, abs))
      .sort((a, b) => (fMtime(join(this.root, b)) - fMtime(join(this.root, a))))
  }

  readAll(): VaultNote[] {
    return this.listNotes().map((rel) => this.readNote(rel))
  }

  /** Append one transcript line to the note's sidecar (raw capture, never edited). */
  appendTranscript(noteId: string, line: string): string {
    const path = join(this.transcriptDir(), `${noteId}.jsonl`)
    writeFileSync(path, `${line}\n`, { encoding: 'utf8', flag: 'a' })
    return path
  }

  readTranscript(noteId: string): string[] {
    const path = join(this.transcriptDir(), `${noteId}.jsonl`)
    const raw = readFileSync(path, 'utf8')
    return raw.split('\n').filter((l) => l.trim() !== '')
  }

  /** Move a note to the trash instead of deleting — non-destructive (stage 1 must-ship). */
  trash(rel: string): void {
    const from = join(this.root, rel)
    const trashRoot = join(this.root, TRASH)
    mkdirSync(trashRoot, { recursive: true })
    renameSync(from, join(trashRoot, basenameNoExt(rel) + extname(rel)))
  }
}

function walkMd(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === TRASH || entry.name === TRANSCRIPT_DIR) continue
    const abs = join(root, entry.name)
    if (entry.isDirectory()) out.push(...walkMd(abs))
    else if (entry.name.endsWith('.md')) out.push(abs)
  }
  return out
}

function fMtime(abs: string): number {
  return statSync(abs).mtimeMs
}

function basenameNoExt(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  return base.replace(/\.[^.]+$/, '')
}
