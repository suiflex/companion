import type { Analysis, DocType, Meeting } from '@meetcc/shared'
import { formatTranscript } from './analyze'
import { AIError, type AIClient } from './client'

// On-demand document generation. One prompt template per document type; input
// is the transcript plus the existing analysis. Output is markdown (not JSON) —
// a draft starting point, never a final document. Adding a new type = adding
// one entry to DOC_META, nothing else.

interface DocMeta {
  label: string
  filename: string
  system: string
}

const COMMON_RULES = `Balas HANYA dengan dokumen dalam format Markdown yang rapi (heading, list, tabel bila perlu). Tanpa basa-basi pembuka/penutup di luar dokumen.
Gunakan bahasa yang sama dengan transcript. Dasarkan isi pada transcript dan ringkasan yang diberikan — JANGAN mengarang. Bagian yang tidak dibahas di rapat tandai dengan "_[belum dibahas]_".`

export const DOC_META: Record<DocType, DocMeta> = {
  brd: {
    label: 'BRD',
    filename: 'BRD',
    system: `Kamu Business Analyst senior. Susun Business Requirements Document (BRD) dari rapat.
Fokus pada sisi bisnis (KENAPA & APA), bahasa untuk stakeholder, hindari detail teknis implementasi.
Struktur: 1) Latar Belakang, 2) Tujuan Bisnis, 3) Ruang Lingkup (In Scope / Out of Scope), 4) Stakeholder, 5) Kebutuhan Bisnis (high-level), 6) Asumsi & Batasan, 7) Kriteria Sukses / KPI.
${COMMON_RULES}`,
  },
  prd: {
    label: 'PRD',
    filename: 'PRD',
    system: `Kamu Product Manager senior. Susun Product Requirements Document (PRD) dari rapat.
Fokus pada sisi produk (APA & BAGAIMANA), bahasa untuk tim pengembang.
Struktur: 1) Problem Statement, 2) Tujuan & Metrik, 3) User Stories + Acceptance Criteria (format "Sebagai … saya ingin … agar …"), 4) Functional Requirements, 5) Non-Functional Requirements, 6) Out of Scope, 7) Open Questions.
${COMMON_RULES}`,
  },
  notulen: {
    label: 'Notulen',
    filename: 'Notulen',
    system: `Kamu notulis rapat profesional. Susun notulen rapat formal.
Struktur: 1) Informasi Rapat (judul, tanggal, peserta), 2) Agenda / Pembahasan, 3) Keputusan, 4) Action Items (tabel: Tugas / PIC / Tenggat), 5) Penutup.
${COMMON_RULES}`,
  },
}

const BRANDING =
  '\n\n---\n\n_Dokumen draft dibuat oleh Meet Companion AI — powered by suiflex. Tinjau sebelum digunakan._'

/** Strip a wrapping ```markdown / ``` fence some models add around the doc. */
function unfence(text: string): string {
  const t = text.trim()
  const m = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(t)
  return (m ? m[1] : t).trim()
}

export function buildDocUserPrompt(
  meeting: Meeting,
  analysis: Analysis | null,
): string {
  const ctx = analysis
    ? `\n\nRingkasan & hasil analisis (untuk konteks):\n${JSON.stringify(
        {
          executiveSummary: analysis.executiveSummary,
          decisions: analysis.decisions,
          actionItems: analysis.actionItems,
          openQuestions: analysis.openQuestions,
          nextSteps: analysis.nextSteps,
        },
        null,
        2,
      )}`
    : ''
  return `Rapat: ${meeting.id}\n\nTranscript:\n${formatTranscript(meeting)}${ctx}`
}

/** Generate one document type, with one retry on transient failure. */
export async function generateDoc(
  client: AIClient,
  meeting: Meeting,
  analysis: Analysis | null,
  type: DocType,
): Promise<string> {
  const meta = DOC_META[type]
  if (!meta) throw new AIError(`Tipe dokumen tidak dikenal: ${type}`, false)
  const req = {
    system: meta.system,
    user: buildDocUserPrompt(meeting, analysis),
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = unfence(await client.complete(req))
      if (!out) throw new AIError('Dokumen kosong dari AI', true)
      return out + BRANDING
    } catch (e) {
      lastError = e
      if (e instanceof AIError && !e.retryable) break
    }
  }
  throw lastError
}
