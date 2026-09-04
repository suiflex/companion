// Vault note: a markdown file with a canonical frontmatter block.
//
// This is the contract the desktop vault owns (§11.2 / mockup "Vault & jembatan"):
// caption for a meeting lands as a human-readable note + a raw transcript
// sidecar, and the frontmatter `id`/`session_key` are what keep the note a
// stable target for backlinks, re-imports and the FTS index. YAML is kept
// deliberately simple (flat key: value, JSON-scalar values) so the files stay
// editable in any text editor and we never pull in a YAML dependency.

export interface VaultNote {
  /** UUIDv7 — the note's canonical id (§17 identity). */
  id: string
  /** `room#YYYY-MM-DDTHH:MM` — dedupe key for bridge deliveries. */
  sessionKey: string
  /** `google-meet` | `microsoft-teams` | `import` | … */
  platform: string
  startedAt?: string
  participants?: string[]
  transcript?: string
  /**
   * The `sessionKey` of the delivered meeting this note was copied from.
   *
   * A note written by hand has none. A meeting arrives as an archive and is
   * never rewritten, so editing one produces a copy that carries this back to
   * the original — the link that makes the archive a backup rather than a
   * second, diverging copy of unknown origin.
   */
  source?: string
  tags?: string[]
  /* Ticket fields. Free-form on purpose: a vault note is a markdown file
     someone can edit in any editor, so nothing here is an enum the parser
     would have to defend. The UI offers a set; a hand-typed value survives. */
  status?: string
  assignee?: string
  priority?: string
  dueDate?: string
  updatedAt: string
  /** Title = first `# Heading` in the body, else the filename. */
  title: string
  body: string
}

/** Frontmatter keys whose values are (un)quoted when round-tripped. */
const QUOTED: Record<string, boolean> = {
  id: true,
  sessionKey: true,
  transcript: true,
  source: true,
  platform: true,
  startedAt: true,
  status: true,
  assignee: true,
  priority: true,
  dueDate: true,
  updatedAt: true,
}
/** Frontmatter keys serialized as a YAML list. */
const LISTS: Record<string, boolean> = {
  participants: true,
  tags: true,
}

const ORDER = [
  'id',
  'sessionKey',
  'platform',
  'startedAt',
  'participants',
  'transcript',
  'source',
  'tags',
  'status',
  'assignee',
  'priority',
  'dueDate',
  'updatedAt',
] as const

const esc = (v: string): string => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
const unesc = (v: string): string => v.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

function scalarLine(key: string, value: string): string {
  return `${key}: ${QUOTED[key] ? `"${esc(value)}"` : value}`
}

/** Serialize a note to a .md document with YAML-ish frontmatter + body. */
export function noteToMarkdown(note: VaultNote): string {
  const lines: string[] = ['---']
  for (const key of ORDER) {
    const value = note[key as keyof VaultNote]
    if (value === undefined) continue
    if (LISTS[key]) {
      const arr = value as string[]
      if (!arr.length) continue
      lines.push(`${key}:`, ...arr.map((x) => `  - "${esc(x)}"`))
    } else {
      lines.push(scalarLine(key, value as string))
    }
  }
  lines.push('---', '')
  const body = note.body.trim()
  // The title is written as the document's leading `# Heading`. A body that
  // already opens with one owns it — synthesizing a second copy on top is what
  // made a note grow one more heading on every save.
  const doc = LEAD_HEADING.test(body) || !note.title ? '' : `# ${note.title}\n\n`
  return lines.join('\n') + doc + body + (body ? '\n' : '')
}

/** A `# Heading` on the document's first line — the title slot. */
const LEAD_HEADING = /^#\s+(.+)(?:\n|$)/

const FM_RE = /^---\n([\s\S]*?)\n---\n?/

/** Parse a .md document into a note; `fallbackTitle` fills an untitled note. */
export function noteFromMarkdown(doc: string, fallbackTitle = ''): VaultNote {
  const fm = FM_RE.exec(doc)
  const body = (fm ? doc.slice(fm[0].length) : doc).trim()
  const fmText = fm ? fm[1] : ''
  const map = new Map<string, string[]>()
  let key: string | null = null
  for (const raw of fmText.split('\n')) {
    const kv = /^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/.exec(raw)
    if (kv) {
      key = kv[1]
      map.set(key, [kv[2]])
      continue
    }
    const item = /^\s+-\s+"?(.*?)"?$/.exec(raw)
    if (key && item) {
      const arr = map.get(key)!
      arr.push(item[1])
    }
  }
  const first = (k: string): string | undefined => {
    const arr = map.get(k)
    if (!arr || !arr.length) return undefined
    const v = arr[0].replace(/^"(.*)"$/, '$1')
    return unesc(v)
  }
  const list = (k: string): string[] | undefined => {
    const arr = map.get(k)
    if (!arr) return undefined
    const v = unesc(arr[0].replace(/^"(.*)"$/, '$1'))
    return v ? [v, ...arr.slice(1).map((x) => unesc(x.replace(/^"(.*)"$/, '$1')))] : arr.slice(1).map((x) => unesc(x.replace(/^"(.*)"$/, '$1')))
  }
  // Only a heading on the *first* line was synthesized by the writer. Matching
  // one anywhere promoted a mid-body `# Heading` to the title while leaving it
  // in the body, so every save re-synthesized it and the note grew a duplicate
  // heading per round-trip.
  const h = LEAD_HEADING.exec(body)
  const bodyCore = h ? body.slice(h[0].length) : body
  return {
    id: first('id') ?? '',
    sessionKey: first('sessionKey') ?? '',
    platform: first('platform') ?? '',
    startedAt: first('startedAt'),
    participants: list('participants'),
    transcript: first('transcript'),
    source: first('source'),
    tags: list('tags'),
    status: first('status'),
    assignee: first('assignee'),
    priority: first('priority'),
    dueDate: first('dueDate'),
    updatedAt: first('updatedAt') ?? '',
    title: (h ? h[1].trim() : fallbackTitle).trim(),
    body: bodyCore.trim(),
  }
}
