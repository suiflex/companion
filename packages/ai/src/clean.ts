import type { Entry } from '@meetcc/shared'
import { type AIClient } from './client'

// On-demand transcript cleanup: fix automatic-speech-recognition slips
// (misheard numbers like 2003->2023, homophones like "unpad"->"unpaid",
// misspelled names/terms) WITHOUT changing meaning or inventing content.
//
// Index-keyed corrections: the model returns only the lines it changed,
// keyed by line number. Robust to the model merging/dropping lines — a bad
// or out-of-range index is simply ignored, so alignment can never drift.
// Processed in chunks so long meetings stay within any context window.

export const CLEAN_CHUNK_LINES = 60

export const CLEAN_SYSTEM_PROMPT = `Kamu editor transcript rapat. Tugasmu memperbaiki HANYA kesalahan transkripsi otomatis (salah dengar):
- angka yang salah (mis. "2003" seharusnya "2023", "2002 6" seharusnya "2026")
- istilah/nama yang salah eja bila konteksnya jelas (mis. "unpad" -> "unpaid", "poin" -> "paid", "korban" -> "read")
- homofon dan typo jelas

ATURAN KETAT:
- JANGAN mengubah makna, JANGAN menambah atau menghapus kalimat, JANGAN menerjemahkan, JANGAN merapikan gaya bicara.
- Pertahankan bahasa dan gaya asli. Jika ragu, JANGAN ubah barisnya.
- Nama pembicara tidak boleh diubah.

Balas HANYA satu objek JSON valid (tanpa teks lain) berbentuk:
{"fixes":[{"i":<nomor baris>,"text":"<teks yang sudah dikoreksi>"}]}
Sertakan HANYA baris yang benar-benar kamu ubah. Jika tidak ada yang perlu dikoreksi, balas {"fixes":[]}.`

/** Numbered lines with speaker context; `offset` keeps indices global. */
export function buildCleanPrompt(entries: Entry[], offset: number): string {
  return entries.map((e, k) => `[${offset + k}] ${e.speaker}: ${e.text}`).join('\n')
}

/** Tolerant extraction of the {fixes:[{i,text}]} object -> index->text map. */
export function parseFixes(raw: string): Map<number, string> {
  const out = new Map<number, string>()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return out
  let obj: unknown
  try {
    obj = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return out
  }
  const fixes = (obj as { fixes?: unknown })?.fixes
  if (!Array.isArray(fixes)) return out
  for (const f of fixes) {
    const i = (f as { i?: unknown })?.i
    const text = (f as { text?: unknown })?.text
    if (typeof i === 'number' && Number.isInteger(i) && typeof text === 'string' && text.trim()) {
      out.set(i, text.trim())
    }
  }
  return out
}

export interface CleanResult {
  entries: Entry[]
  changed: number
}

/** How many chunk requests run at once — parallel so a long transcript isn't
 *  8-9 sequential round-trips. Bounded so we don't hammer the provider. */
export const CLEAN_CONCURRENCY = 5

/** Reports progress after each batch (with the partial result); awaited so
 *  callers can persist it and resume a later run from `done`. */
export type CleanProgress = (done: number, total: number, entries: Entry[]) => void | Promise<void>

/**
 * Correct ASR errors across a transcript, chunk by chunk. Chunks are
 * independent (index-keyed fixes), so they run in bounded-parallel batches.
 * `startLine` resumes a previously-interrupted run (lines before it are kept
 * as-is). Returns a fresh copy of the entries with fixes applied plus the
 * number of lines changed. A failed/unparseable chunk keeps its original
 * lines — cleanup is best-effort and never destroys the transcript.
 */
export async function cleanTranscript(
  client: AIClient,
  entries: Entry[],
  onProgress?: CleanProgress,
  startLine = 0,
): Promise<CleanResult> {
  const out = entries.map((e) => ({ ...e }))
  const total = out.length
  const starts: number[] = []
  for (let s = Math.max(0, startLine); s < total; s += CLEAN_CHUNK_LINES) starts.push(s)

  let changed = 0
  const runChunk = async (start: number): Promise<Map<number, string>> => {
    const chunk = out.slice(start, start + CLEAN_CHUNK_LINES)
    try {
      const raw = await client.complete({
        system: CLEAN_SYSTEM_PROMPT,
        user: buildCleanPrompt(chunk, start),
        json: true,
      })
      return parseFixes(raw)
    } catch {
      return new Map() // keep original lines for this chunk
    }
  }

  for (let i = 0; i < starts.length; i += CLEAN_CONCURRENCY) {
    const batch = starts.slice(i, i + CLEAN_CONCURRENCY)
    const maps = await Promise.all(batch.map(runChunk))
    batch.forEach((start, k) => {
      for (const [idx, text] of maps[k]) {
        // only touch lines inside this chunk's range; ignore stray indices
        if (idx >= start && idx < start + CLEAN_CHUNK_LINES && out[idx].text !== text) {
          out[idx].text = text
          changed++
        }
      }
    })
    if (onProgress) {
      const done = Math.min(batch[batch.length - 1] + CLEAN_CHUNK_LINES, total)
      await onProgress(done, total, out)
    }
  }
  return { entries: out, changed }
}
