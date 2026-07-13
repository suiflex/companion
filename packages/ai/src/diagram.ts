import { normalizeDiagrams, type Diagram, type Meeting } from '@meetcc/shared'
import { formatTranscript } from './analyze'
import { AIError, type AIClient } from './client'

// On-demand flow/sequence diagrams. Split out of the auto-analysis pipeline so
// it never runs unless the user asks (and so it can run on the CLEANED
// transcript). Returns [] when the meeting has no clear process to diagram.

export const DIAGRAM_SYSTEM_PROMPT = `Kamu membuat diagram alur dari rapat.
Balas HANYA satu objek JSON valid (tanpa teks lain) berbentuk:
{"diagrams":[{"title": string, "type": "flowchart"|"sequenceDiagram", "mermaid": string}]}

Aturan:
- Buat 0-3 diagram HANYA jika rapat membahas alur/proses/urutan langkah yang jelas. Jika tidak ada, balas {"diagrams":[]}. JANGAN memaksakan diagram.
- "mermaid" harus sintaks Mermaid valid. Flowchart mulai dengan "flowchart TB" (vertikal). Untuk urutan interaksi antar pihak gunakan "sequenceDiagram".
- Maksimal ~15 node per diagram; pecah jadi beberapa diagram jika lebih.
- Label node pakai bahasa transcript. Jangan mengarang alur yang tidak dibahas.`

export function buildDiagramPrompt(m: Meeting): string {
  return `Meeting: ${m.id}\nTranscript:\n${formatTranscript(m)}`
}

/** Tolerant extraction of the {diagrams:[...]} object. */
export function parseDiagrams(raw: string): Diagram[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    return normalizeDiagrams((JSON.parse(raw.slice(start, end + 1)) as { diagrams?: unknown }).diagrams)
  } catch {
    return []
  }
}

/** Generate diagrams for a meeting, one retry on transient failure. */
export async function generateDiagrams(client: AIClient, meeting: Meeting): Promise<Diagram[]> {
  const req = { system: DIAGRAM_SYSTEM_PROMPT, user: buildDiagramPrompt(meeting), json: true }
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseDiagrams(await client.complete(req))
    } catch (e) {
      lastError = e
      if (e instanceof AIError && !e.retryable) break
    }
  }
  throw lastError
}
