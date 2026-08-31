import {
  participants,
  startedAt,
  type Analysis,
  type AnalysisRecord,
  type Meeting,
} from '@meetcc/shared'

// Obsidian-friendly export (unified architecture §13.1) — the Phase 0 demand
// probe (D2) and its forcing function: wiki-links, tags and a folder layout
// only stay coherent across re-exports if every meeting has a stable ID, so
// companion_id is derived, never stored.
//
// No DOM, no chrome.*, no deps — this file must stay importable from the
// desktop core later (§6.2 shared TypeScript domain).

/** FNV-1a 32-bit — small, dependency-free, good enough to scramble ids. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Stable companion ID for a meeting (D2, ADR-013 UUIDv7 shape): 48-bit
 * unix-ms timestamp + version/variant bits, random fields derived from the
 * legacy id instead of a RNG. Deterministic on purpose — the same meeting
 * exports to the same `companion_id` forever, with zero storage, which is
 * what makes re-exports idempotent and the canonical map a pure function.
 * The legacy session id remains the external identity (§10.1).
 */

/** Unix-ms of the meeting start; 0 when the meeting has no usable time. */
function startMs(meeting: Meeting): number {
  const t = Date.parse(startedAt(meeting) ?? meeting.entries[0]?.time ?? '')
  return Number.isFinite(t) ? t : 0
}

export function companionIdFor(meeting: Meeting): string {
  const ms = startMs(meeting)
  let h = fnv1a(meeting.id)
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0
    return h
  }
  const chunk = () => next().toString(16).padStart(8, '0')
  // RFC 9562 UUIDv7 layout in hex:
  //   12 unix-ms | 1 version | 3 rand_a | 16 variant+rand_b ('8'..'b' first)
  return (
    ms.toString(16).padStart(12, '0') +
    '7' +
    chunk().slice(0, 3) +
    '89ab'[next() % 4] +
    chunk() +
    chunk().slice(0, 7)
  )
}

/** `Meetings/2026-07-13 zkz-fwkm-ibn.md` — §13.1 vault layout. */
export function obsidianPath(meeting: Meeting): string {
  const ms = startMs(meeting)
  const day = ms ? new Date(ms).toISOString().slice(0, 10) : 'undated'
  return `Meetings/${day} ${meeting.id}.md`
}

// -- markdown surface (Obsidian wiki-links) --

/** Inline code/specials make a wiki-link target unresolvable — strip them. */
function wikiTarget(s: string): string {
  return s.replace(/[[\]|#^]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Obsidian tag: letters/digits/underscore/hyphen/slash, must not start with a digit. */
function tagOf(s: string): string | null {
  const t = s.trim().replace(/[^a-zA-Z0-9/_-]+/g, '-')
  return /^[a-zA-Z_/][a-zA-Z0-9/_-]*$/.test(t) ? t : null
}

function frontmatter(meeting: Meeting, now: string): string {
  // "Minimal" per §13.1: ids and user-facing organization only. No transcript
  // lines, no analysis JSON — structured records stay in the store. There is
  // no project field on the capture-side Meeting type; when the desktop import
  // maps project_id (§11.2) it can extend this line without breaking the id.
  return [
    '---',
    `companion_id: ${companionIdFor(meeting)}`,
    'type: meeting',
    'tags:',
    '  - companion',
    '  - meeting',
    `created: ${now}`,
    `updated: ${now}`,
    '---',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

const section = (title: string, body: string): string =>
  body.trim() ? `## ${title}\n\n${body.trim()}\n` : ''

const bullets = (items: string[]): string =>
  items.map((i) => `- ${i}`).join('\n')

function decisionsMd(analysis: Analysis): string {
  const rows = analysis.decisions.map((d) => {
    const lines = [`- **${d.what}**${d.topic ? ` #${tagOf(d.topic) ?? 'topic'}` : ''}`]
    if (d.why) lines.push(`  - Alasan: ${d.why}`)
    if (d.rejected.length) lines.push(`  - Ditolak: ${d.rejected.join('; ')}`)
    return lines.join('\n')
  })
  if (!rows.length) return ''
  return `Tagged for the graph: ${[...new Set(analysis.decisions.map((d) => d.topic && `#${tagOf(d.topic) ?? 'topic'}`).filter(Boolean))].join(' ')}\n\n${rows.join('\n')}\n`
}

function actionItemsMd(analysis: Analysis): string {
  if (!analysis.actionItems.length) return ''
  const rows = analysis.actionItems.map(
    (a) =>
      `- [ ] ${a.task}${a.owner ? ` — [[${wikiTarget(a.owner)}]]` : ''}${
        a.due ? ` (due ${a.due})` : ''
      }`,
  )
  return rows.join('\n') + '\n'
}

function fmtDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('id-ID', {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : '—'
}

/**
 * Obsidian-ready meeting note: frontmatter with the stable companion_id,
 * wiki-linked participants and action-item owners, decision topic tags, and
 * no duplicate footer (the first heading already names the meeting).
 */
export function toObsidian(meeting: Meeting, analysis: Analysis): string {
  const people = participants(meeting)
  const now = new Date().toISOString()
  const parts: string[] = [
    frontmatter(meeting, now),
    `# ${meeting.id}`,
    '',
    section(
      'Meeting Information',
      [
        `- **Meeting ID**: ${meeting.id}`,
        `- **companion_id**: ${companionIdFor(meeting)}`,
        `- **Tanggal**: ${fmtDate(startedAt(meeting))}`,
        `- **Jumlah baris transcript**: ${meeting.entries.length}`,
      ].join('\n'),
    ),
    section(
      'Participants',
      people.length
        ? people.map((p) => `- [[${wikiTarget(p)}]]`).join('\n')
        : '',
    ),
    section(
      'Timeline',
      analysis.timeline
        .map((t) => `- **${t.time || '—'}** — ${t.topic}`)
        .join('\n'),
    ),
    section('Executive Summary', analysis.executiveSummary),
    section('Key Discussion', bullets(analysis.keyDiscussions)),
    section('Decisions', decisionsMd(analysis)),
    section('Action Items', actionItemsMd(analysis)),
    section('Risks', bullets(analysis.risks)),
    section('Open Questions', bullets(analysis.openQuestions)),
    section('Next Steps', bullets(analysis.nextSteps)),
    section(
      'Diagram',
      (analysis.diagrams ?? [])
        .map((d) => `### ${d.title}\n\n\`\`\`mermaid\n${d.mermaid}\n\`\`\``)
        .join('\n\n'),
    ),
    '---',
    `_Generated by Meet Companion AI — ${now}_`,
    '',
  ]
  return parts.filter((p) => p !== '').join('\n')
}

/**
 * Whole-vault export (§13.1 folder layout): one note per analyzed meeting at
 * `Meetings/<day> <id>.md`, plus a README that names the layout. Only 'done'
 * analyses export — a meeting without a summary has nothing worth reading in
 * Obsidian. Deterministic content for identical inputs, so re-exporting a
 * vault that did not change produces byte-identical files except the README
 * timestamp.
 */
export function obsidianVault(
  meetings: Meeting[],
  analyses: Record<string, AnalysisRecord>,
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  for (const meeting of meetings) {
    const rec = analyses[meeting.id]
    if (rec?.status !== 'done') continue
    files.push({ path: obsidianPath(meeting), content: toObsidian(meeting, rec.analysis) })
  }
  if (files.length) {
    files.push({
      path: 'README.md',
      content: [
        '# Meet Companion vault',
        '',
        `Exported ${files.length} meeting note(s) from Meet Companion AI.`,
        '',
        '- `Meetings/` — one note per analyzed meeting, wiki-linked participants and actions.',
        '- Notes carry a stable `companion_id` in their frontmatter: re-exporting a meeting',
        '  always produces the same id, so links between notes stay valid.',
        '',
      ].join('\n'),
    })
  }
  return files
}
