import type { Analysis, DocType, Entry, Meeting } from '@meetcc/shared'
import { formatEntries, formatTranscript } from './analyze'
import { t } from '@meetcc/shared/i18n';
import { AIError, type AIClient } from './client'

// Advanced document generation — a grounded, multi-pass (Reflexion) pipeline,
// NOT a single shot. For each request:
//   1. CONTEXT  — full transcript, or map-reduce notes for long meetings so
//                 nothing is truncated away (C).
//   2. DRAFT    — write the document against a per-type rubric + example (D),
//                 citing [jj:mm] timestamps and marking gaps _[belum dibahas]_.
//   3. CRITIQUE — a reviewer pass hunts unsupported claims, vague bullets,
//                 missing sections, and hallucinations (A + B).
//   4. REVISE   — rewrite using the critique; unsupported -> _[belum dibahas]_.
// If critique/revise fail, degrade gracefully to the draft (never worse than
// the old single-pass behavior). Costs ~3x tokens — worth it for real docs.

interface DocMeta {
  label: string
  filename: string
  /** persona + structure + rubric + a short example of a GOOD section */
  system: string
}

// Map-reduce kicks in past this size; below it the full transcript is passed
// verbatim (best grounding). ~40k chars ≈ a long-ish 1h meeting.
export const MAP_THRESHOLD_CHARS = 40_000
export const MAP_CHUNK_LINES = 120

const GROUNDING_RULES = `Dasar & sitasi (WAJIB):
- Dukung setiap poin penting dengan sitasi timestamp [jj:mm] dari transcript/notes.
- Jika suatu bagian TIDAK dibahas di rapat, tulis persis "_[belum dibahas]_" — JANGAN mengarang, JANGAN mengisi dengan asumsi umum.
- Gunakan bahasa yang sama dengan transcript. Markdown rapi (heading, list, tabel bila perlu). Tanpa basa-basi di luar dokumen.`

export const DOC_META: Record<DocType, DocMeta> = {
  brd: {
    label: 'BRD',
    filename: 'BRD',
    system: `Kamu Business Analyst senior. Susun Business Requirements Document (BRD) dari rapat.
Fokus sisi bisnis (KENAPA & APA), bahasa untuk stakeholder, hindari detail teknis implementasi.
Struktur: 1) Latar Belakang, 2) Tujuan Bisnis, 3) Ruang Lingkup (In Scope / Out of Scope), 4) Stakeholder, 5) Kebutuhan Bisnis (high-level), 6) Asumsi & Batasan, 7) Kriteria Sukses / KPI.

Standar mutu (rubrik):
- Tujuan bisnis harus terukur (mis. "kurangi waktu proses klaim dari X ke Y"), bukan slogan.
- Stakeholder = peran + kepentingannya, bukan sekadar nama.
- KPI harus punya arah/target, bukan "meningkatkan efisiensi" tanpa angka.
Contoh poin BAIK: "Tujuan Bisnis: memangkas waktu pelaporan kerusakan dari manual ke < 5 menit [04:21] agar debitur tidak menunggu."
${GROUNDING_RULES}`,
  },
  prd: {
    label: 'PRD',
    filename: 'PRD',
    system: `Kamu Product Manager senior. Susun Product Requirements Document (PRD) dari rapat.
Fokus sisi produk (APA & BAGAIMANA), bahasa untuk tim pengembang.
Struktur: 1) Problem Statement, 2) Tujuan & Metrik, 3) User Stories + Acceptance Criteria, 4) Functional Requirements, 5) Non-Functional Requirements, 6) Out of Scope, 7) Open Questions.

Standar mutu (rubrik):
- User story format "Sebagai <peran>, saya ingin <aksi> agar <manfaat>".
- Acceptance criteria harus DAPAT DIUJI (format Given/When/Then bila mungkin), bukan bullet umum seperti "fitur berjalan baik".
- Functional requirement = perilaku spesifik + input/output, bukan judul fitur.
Contoh AC BAIK: "Given transcript > 60 menit, When user klik Rapikan, Then sistem mengoreksi angka/istilah salah-dengar tanpa mengubah makna [05:22]."
${GROUNDING_RULES}`,
  },
  recap: {
    label: 'Recap',
    filename: 'Recap',
    system: `Kamu chief of staff yang menulis email tindak lanjut setelah rapat.
Hasilnya SIAP KIRIM: pendek, langsung, tanpa penjelasan meta soal dokumen ini.
Struktur: 1) Subject (satu baris), 2) Pembuka satu kalimat (rapat apa, kapan), 3) Keputusan (maksimal 5 bullet), 4) Action Items (tabel: Tugas / PIC / Tenggat), 5) Yang masih terbuka, 6) Penutup satu kalimat.

Standar mutu (rubrik):
- Subject menyebut topik nyata rapat, bukan "Notulen Rapat".
- Tiap action item punya PIC bila disebut di rapat; tulis "_[belum ada PIC]_" bila tidak, jangan menebak orang.
- Tenggat hanya ditulis bila benar-benar disebut; jangan mengarang tanggal.
- Total di bawah 400 kata — ini email, bukan notulen. Detail panjang tinggalkan di notulen.
Contoh bullet BAIK: "Rollout ditunda ke sprint depan karena API mitra belum siap [12:04]."
${GROUNDING_RULES}`,
  },
  notulen: {
    label: 'Notulen',
    filename: 'Notulen',
    system: `Kamu notulis rapat profesional. Susun notulen rapat formal.
Struktur: 1) Informasi Rapat (judul, tanggal, peserta), 2) Agenda / Pembahasan, 3) Keputusan, 4) Action Items (tabel: Tugas / PIC / Tenggat), 5) Penutup.

Standar mutu (rubrik):
- Keputusan = apa yang diputuskan + alasan singkat + siapa.
- Action item wajib punya PIC bila disebut; tulis "_[belum ada PIC]_" bila tidak.
- Pembahasan runut sesuai alur rapat, bukan gumpalan kalimat.
${GROUNDING_RULES}`,
  },
}

const BRANDING =
  `\n\n---\n\n${t('pkg.docgen.footer')}`

/** Strip a wrapping ```markdown / ``` fence some models add around the doc. */
export function unfence(text: string): string {
  const t = text.trim()
  const m = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(t)
  return (m ? m[1] : t).trim()
}

function chunkEntries(entries: Entry[], size: number): Entry[][] {
  const out: Entry[][] = []
  for (let i = 0; i < entries.length; i += size) out.push(entries.slice(i, i + size))
  return out
}

const MAP_SYSTEM = `Ringkas bagian transcript rapat ini menjadi poin-poin padat: fakta, keputusan, kebutuhan, angka, nama, dan istilah penting.
- SERTAKAN timestamp [jj:mm] pada tiap poin agar bisa disitasi nanti.
- Jangan mengarang, jangan menyimpulkan di luar isi. Pertahankan bahasa asli.
Balas HANYA daftar poin (markdown "-"), tanpa basa-basi.`

/** Retry a single stage once on a retryable failure (mirrors analyzeMeeting). */
async function complete1(client: AIClient, system: string, user: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = (await client.complete({ system, user })).trim()
      if (!out) throw new AIError(t('pkg.ai.emptyResponse'), true)
      return out
    } catch (e) {
      lastError = e
      if (e instanceof AIError && !e.retryable) break
    }
  }
  throw lastError
}

/** Bounded parallelism for the map stage — a long meeting isn't N sequential
 *  round-trips (the reason docgen felt frozen). */
export const MAP_CONCURRENCY = 5

/** Number of map chunks a meeting will produce (0 = short, passed verbatim). */
export function mapChunkCount(meeting: Meeting): number {
  if (formatEntries(meeting.entries).length <= MAP_THRESHOLD_CHARS) return 0
  return Math.ceil(meeting.entries.length / MAP_CHUNK_LINES)
}

/**
 * Grounded context: full transcript when it fits, else map-reduce notes so a
 * long meeting isn't truncated (C). Chunks summarize in bounded-parallel
 * batches. Notes keep [jj:mm] for citation. A failed chunk falls back to its
 * raw text — never silently drops content. `onChunk(done, total)` reports map
 * progress.
 */
export async function prepareContext(
  client: AIClient,
  meeting: Meeting,
  onChunk?: (done: number, total: number) => void | Promise<void>,
): Promise<string> {
  const full = formatEntries(meeting.entries)
  if (full.length <= MAP_THRESHOLD_CHARS) return full
  const chunks = chunkEntries(meeting.entries, MAP_CHUNK_LINES)
  const notes: string[] = new Array(chunks.length)
  let done = 0
  for (let i = 0; i < chunks.length; i += MAP_CONCURRENCY) {
    const batch = chunks.slice(i, i + MAP_CONCURRENCY)
    await Promise.all(
      batch.map(async (chunk, k) => {
        const text = formatEntries(chunk)
        try {
          notes[i + k] = await complete1(client, MAP_SYSTEM, text)
        } catch {
          notes[i + k] = text // keep raw lines rather than lose the segment
        }
      }),
    )
    done = Math.min(i + batch.length, chunks.length)
    if (onChunk) await onChunk(done, chunks.length)
  }
  return notes.join('\n\n')
}

export function buildDocUserPrompt(meeting: Meeting, analysis: Analysis | null): string {
  const ctx = analysis
    ? `\n\nRingkasan & hasil analisis (untuk konteks, tetap verifikasi ke transcript):\n${JSON.stringify(
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

function draftUser(context: string, analysis: Analysis | null, template?: DocTemplate): string {
  const ctx = analysis?.executiveSummary
    ? `\n\nRingkasan analisis (konteks, verifikasi ke transcript):\n${analysis.executiveSummary}`
    : ''
  return `Transcript / notes rapat (dengan timestamp):\n${context}${ctx}${templateBlock(template)}`
}

/** P2.1 — a user-defined template steers structure and emphasis. It is added
 *  to the prompt, never replacing the grounding rules: a template can ask for
 *  different sections, not for facts the transcript does not contain. */
export interface DocTemplate {
  name: string
  instructions: string
  sections?: string[]
}

export function templateBlock(template?: DocTemplate): string {
  if (!template?.instructions && !template?.sections?.length) return ''
  const sections = template.sections?.length
    ? `\nGunakan struktur section berikut, dengan urutan ini:\n${template.sections.map((x) => `- ${x}`).join('\n')}`
    : ''
  return `\n\nTemplate "${template.name}" dari pengguna (ikuti strukturnya, tetap jangan mengarang fakta):\n${template.instructions}${sections}`
}

function critiqueUser(docLabel: string, draft: string, context: string): string {
  return `Transcript / notes rapat (sumber kebenaran):\n${context}\n\nDraft ${docLabel} yang harus kamu review:\n${draft}`
}

const critiqueSystem = (docLabel: string): string =>
  `Kamu reviewer kritis untuk dokumen ${docLabel}. Bandingkan draft dengan transcript/notes. Temukan:
1. Klaim yang TIDAK didukung transcript (halusinasi) — sebutkan bagiannya.
2. Poin kabur/umum yang seharusnya spesifik & terukur.
3. Bagian yang seharusnya "_[belum dibahas]_" tapi malah dikarang.
4. Struktur/section yang hilang atau acceptance criteria yang tidak dapat diuji.
Balas daftar temuan ringkas + instruksi perbaikan konkret. Jika draft sudah baik, katakan "TIDAK ADA MASALAH BERARTI".`

const reviseSystem = (base: string): string =>
  `${base}

Kamu sedang MEREVISI draft berdasarkan temuan reviewer. Terapkan SEMUA perbaikan:
- Hapus/koreksi klaim tak didukung; ganti dengan "_[belum dibahas]_" bila tak ada dasar.
- Buat poin kabur jadi spesifik & terukur bila transcript mendukung.
- Pertahankan sitasi [jj:mm]. Balas HANYA dokumen final (markdown), tanpa komentar.`

function reviseUser(docLabel: string, draft: string, critique: string, context: string): string {
  return `Transcript / notes (sumber kebenaran):\n${context}\n\nDraft ${docLabel}:\n${draft}\n\nTemuan reviewer:\n${critique}\n\nTulis ulang ${docLabel} final yang sudah diperbaiki.`
}

/** Reports pipeline progress (completed steps of total) with a stage label. */
export type DocProgress = (step: number, total: number, label: string) => void | Promise<void>

/**
 * Generate one document via the draft -> critique -> revise pipeline.
 * Draft failure throws (real error). Refinement failure degrades to the draft.
 * `onProgress` reports steps: N map chunks + draft + critique + revise.
 */
export async function generateDoc(
  client: AIClient,
  meeting: Meeting,
  analysis: Analysis | null,
  type: DocType,
  onProgress?: DocProgress,
  template?: DocTemplate,
): Promise<string> {
  const meta = DOC_META[type]
  if (!meta) throw new AIError(`Tipe dokumen tidak dikenal: ${type}`, false)

  const total = mapChunkCount(meeting) + 3 // map... + draft + critique + revise
  let step = 0
  const tick = async (label: string) => {
    if (onProgress) await onProgress(step, total, label)
  }

  await tick('Menyiapkan konteks')
  const context = await prepareContext(client, meeting, async (done) => {
    step = done
    await tick('Menyiapkan konteks')
  })

  const draft = unfence(await complete1(client, meta.system, draftUser(context, analysis, template)))
  if (!draft) throw new AIError(t('pkg.ai.emptyDraft'), true)
  step += 1
  await tick('Menulis draft')

  try {
    const critique = await complete1(
      client,
      critiqueSystem(meta.label),
      critiqueUser(meta.label, draft, context),
    )
    step += 1
    await tick('Memeriksa & memvalidasi')
    if (/TIDAK ADA MASALAH BERARTI/i.test(critique)) {
      step = total
      await tick('Selesai')
      return draft + BRANDING
    }
    const final = unfence(
      await complete1(
        client,
        reviseSystem(meta.system),
        reviseUser(meta.label, draft, critique, context),
      ),
    )
    step = total
    await tick('Selesai')
    return (final || draft) + BRANDING
  } catch {
    return draft + BRANDING // graceful: draft is still a full document
  }
}
