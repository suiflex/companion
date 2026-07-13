import { startedAt, type Meeting } from '@meetcc/shared'
import {
  ACCENT,
  DIM,
  Doc,
  drawCover,
  drawFooters,
  INK,
  M,
  W,
  type PdfLogo,
} from './pdf'

// Markdown -> styled PDF for generated documents (BRD / PRD / notulen).
// Same visual language as the summary PDF: dark branded cover, phosphor
// accent headings, helvetica body, footer branding on every page.
// Supports the subset our docgen prompts actually emit: #/##/### headings,
// bullet & numbered lists, tables, --- rules, paragraphs. Inline markers
// (** _ `) are stripped — jsPDF has no inline rich text worth the complexity.

export type MdToken =
  | { kind: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string }
  | { kind: 'oli'; n: string; text: string }
  | { kind: 'hr' }
  | { kind: 'table'; rows: string[][] }

const inline = (s: string): string =>
  s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim()

const tableRow = (line: string): string[] =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => inline(c))

const isDivider = (line: string): boolean =>
  /^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')

/** Parse the markdown subset into a flat token list. Exported for tests. */
export function parseMd(md: string): MdToken[] {
  const tokens: MdToken[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^-{3,}$/.test(line)) {
      tokens.push({ kind: 'hr' })
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      const kind = (['h1', 'h2', 'h3'] as const)[h[1].length - 1]
      tokens.push({ kind, text: inline(h[2]) })
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const t = lines[i].trim()
        if (!isDivider(t)) rows.push(tableRow(t))
        i++
      }
      i--
      if (rows.length) tokens.push({ kind: 'table', rows })
      continue
    }
    const li = /^[-*]\s+(.*)$/.exec(line)
    if (li) {
      tokens.push({ kind: 'li', text: inline(li[1]) })
      continue
    }
    const oli = /^(\d+)[.)]\s+(.*)$/.exec(line)
    if (oli) {
      tokens.push({ kind: 'oli', n: oli[1], text: inline(oli[2]) })
      continue
    }
    tokens.push({ kind: 'p', text: inline(line) })
  }
  return tokens
}

const CELL_FONT = 9.5
const CELL_LH = 4.6
const CELL_PAD = 1.6

function renderTable(d: Doc, rows: string[][]): void {
  const cols = Math.max(...rows.map((r) => r.length))
  const colW = W / cols
  rows.forEach((row, rowIdx) => {
    const header = rowIdx === 0
    d.pdf
      .setFont('helvetica', header ? 'bold' : 'normal')
      .setFontSize(CELL_FONT)
      .setTextColor(...(header ? ACCENT : INK))
    const wrapped = row.map(
      (cell) => d.pdf.splitTextToSize(cell, colW - 3) as string[],
    )
    const rowH =
      Math.max(1, ...wrapped.map((w) => w.length)) * CELL_LH + CELL_PAD * 2
    d.ensure(rowH)
    wrapped.forEach((cellLines, c) => {
      cellLines.forEach((cl, li) => {
        d.pdf.text(cl, M + c * colW, d.y + CELL_PAD + (li + 1) * CELL_LH - 1.4)
      })
    })
    d.y += rowH
    d.pdf
      .setDrawColor(...(header ? ACCENT : DIM))
      .setLineWidth(header ? 0.4 : 0.1)
    d.pdf.line(M, d.y, M + W, d.y)
    d.y += 1.6
  })
  d.y += 2
}

function renderTokens(d: Doc, tokens: MdToken[]): void {
  let n = 0
  for (const t of tokens) {
    switch (t.kind) {
      case 'h1':
        // the doc title already headlines the cover; inside the body treat
        // it as a top-level section like ##, just slightly larger
        d.ensure(18)
        d.y += 7
        d.pdf
          .setFont('helvetica', 'bold')
          .setFontSize(15)
          .setTextColor(...ACCENT)
        d.pdf.text(t.text, M, d.y)
        d.y += 2.4
        d.pdf.setDrawColor(...ACCENT).setLineWidth(0.5)
        d.pdf.line(M, d.y, M + 30, d.y)
        d.y += 7
        break
      case 'h2':
        d.heading(t.text)
        break
      case 'h3':
        d.ensure(12)
        d.y += 3
        d.pdf
          .setFont('helvetica', 'bold')
          .setFontSize(11)
          .setTextColor(...INK)
        d.pdf.text(t.text, M, d.y)
        d.y += 6
        break
      case 'p':
        d.para(t.text)
        break
      case 'li':
        d.para(t.text, { bullet: true })
        break
      case 'oli':
        d.para(`${t.n}. ${t.text}`)
        break
      case 'hr':
        d.ensure(6)
        d.pdf.setDrawColor(...DIM).setLineWidth(0.2)
        d.pdf.line(M, d.y, M + W, d.y)
        d.y += 5
        break
      case 'table':
        renderTable(d, t.rows)
        break
    }
    n++
  }
  if (!n) d.para('—', { dim: true })
}

/** Render a generated document (markdown) into a branded PDF. */
export function docToPdf(
  meeting: Meeting,
  docLabel: string,
  markdown: string,
  logo: PdfLogo | null = null,
): Blob {
  const d = new Doc()
  const date = startedAt(meeting)
  const dateStr = date
    ? new Date(date).toLocaleString('id-ID', {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : '—'

  drawCover(d.pdf, {
    kicker: 'SUIFLEX — MEET Companion',
    title: docLabel,
    subtitle: meeting.id,
    date: dateStr,
    logo,
  })

  d.pdf.addPage()
  renderTokens(d, parseMd(markdown))
  drawFooters(d.pdf, `${docLabel} · ${meeting.id}`)

  return d.pdf.output('blob')
}
