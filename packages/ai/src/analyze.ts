import {
  normalizeDecisions,
  normalizeDiagrams,
  type Analysis,
  type Entry,
  type Meeting,
} from '@meetcc/shared';
import { AIError, type AIClient } from './client';

const MAX_TRANSCRIPT_CHARS = 60_000;

/** `[jj:mm] Speaker: text` lines — the citable format grounding relies on. */
export function formatEntries(entries: Entry[]): string {
  return entries
    .map((e) => {
      const t = new Date(e.time).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `[${t}] ${e.speaker}: ${e.text}`;
    })
    .join('\n');
}

export function formatTranscript(m: Meeting): string {
  const text = formatEntries(m.entries);
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    const half = MAX_TRANSCRIPT_CHARS / 2;
    return (
      text.slice(0, half) +
      '\n[... transcript dipotong karena terlalu panjang ...]\n' +
      text.slice(-half)
    );
  }
  return text;
}

export const SYSTEM_PROMPT = `Kamu adalah asisten notulen rapat profesional.
Balas HANYA dengan satu objek JSON valid (tanpa markdown fence, tanpa teks lain) berskema:
{
  "executiveSummary": string,           // 2-4 kalimat ringkasan eksekutif
  "timeline": [{"time": string, "topic": string}],
  "keyDiscussions": [string],
  "decisions": [{"what": string, "why": string, "rejected": [string], "topic": string}],
  "actionItems": [{"task": string, "owner": string, "due": string}],
  "risks": [string],
  "openQuestions": [string],
  "nextSteps": [string]
}
Gunakan bahasa yang sama dengan transcript. Field yang tidak ada isinya = array kosong / string kosong. Jangan mengarang fakta.

Aturan "decisions": tiap keputusan berisi "what" (keputusan yang diambil), "why" (alasan singkat), "rejected" (opsi yang ditolak beserta alasan, boleh kosong), dan "topic" (label topik/area pendek dalam kebab-case, mis. "arsitektur-order"). Kosongkan field yang tidak disebut.`;

export function buildUserPrompt(m: Meeting, part?: { index: number; total: number }): string {
  const header = part
    ? `Meeting: ${m.id} (bagian ${part.index + 1} dari ${part.total} — analisis bagian ini saja)`
    : `Meeting: ${m.id}`;
  return `${header}\nTranscript:\n${formatTranscript(m)}`;
}

/**
 * Split entries into chunks that each fit one request. Greedy over the
 * formatted line length, so a chunk never overflows `maxChars` unless a
 * single line already does (then it gets a chunk of its own and
 * `formatTranscript` truncates it as a last resort).
 */
export function chunkEntries(entries: Entry[], maxChars = MAX_TRANSCRIPT_CHARS): Entry[][] {
  if (entries.length <= 1) return [entries];
  const chunks: Entry[][] = [];
  let current: Entry[] = [];
  let size = 0;
  for (const e of entries) {
    const len = formatEntries([e]).length + 1;
    if (current.length && size + len > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(e);
    size += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : [];

/** Tolerant JSON extraction: models love to wrap JSON in prose/fences. */
export function parseAnalysis(raw: string): Analysis {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AIError('Respons AI bukan JSON', true);
  let obj: any;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AIError('JSON dari AI tidak valid', true);
  }
  const analysis: Analysis = {
    executiveSummary: str(obj.executiveSummary),
    timeline: Array.isArray(obj.timeline)
      ? obj.timeline
          .map((t: any) => ({ time: str(t?.time), topic: str(t?.topic) }))
          .filter((t: { topic: string }) => t.topic)
      : [],
    keyDiscussions: strArr(obj.keyDiscussions),
    decisions: normalizeDecisions(obj.decisions),
    actionItems: Array.isArray(obj.actionItems)
      ? obj.actionItems
          .map((a: any) => ({ task: str(a?.task), owner: str(a?.owner), due: str(a?.due) }))
          .filter((a: { task: string }) => a.task)
      : [],
    risks: strArr(obj.risks),
    openQuestions: strArr(obj.openQuestions),
    nextSteps: strArr(obj.nextSteps),
    diagrams: normalizeDiagrams(obj.diagrams),
  };
  if (!analysis.executiveSummary) throw new AIError('executiveSummary kosong', true);
  return analysis;
}

/** One completion + parse, retried once on retryable failures. */
async function completeAnalysis(client: AIClient, user: string): Promise<Analysis> {
  const req = { system: SYSTEM_PROMPT, user, json: true };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseAnalysis(await client.complete(req));
    } catch (e) {
      lastError = e;
      if (e instanceof AIError && !e.retryable) break;
    }
  }
  throw lastError;
}

/** Case-insensitive de-dupe that keeps the first spelling seen. */
function uniqueBy<T>(items: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item).toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Fold per-chunk analyses into one. Executive summaries are concatenated
 *  here; `analyzeMeeting` replaces that with a real reduce pass when it can. */
export function mergeAnalyses(parts: Analysis[]): Analysis {
  const all = <T>(pick: (a: Analysis) => T[]): T[] => parts.flatMap(pick);
  return {
    executiveSummary: parts
      .map((p) => p.executiveSummary.trim())
      .filter(Boolean)
      .join(' '),
    timeline: all((p) => p.timeline), // chronological: chunks are already in order
    keyDiscussions: uniqueBy(all((p) => p.keyDiscussions), (x) => x),
    decisions: uniqueBy(all((p) => p.decisions), (d) => d.what),
    actionItems: uniqueBy(all((p) => p.actionItems), (a) => a.task),
    risks: uniqueBy(all((p) => p.risks), (x) => x),
    openQuestions: uniqueBy(all((p) => p.openQuestions), (x) => x),
    nextSteps: uniqueBy(all((p) => p.nextSteps), (x) => x),
    diagrams: all((p) => p.diagrams),
  };
}

/** How many chunk analyses run at once — same bounded-parallel shape as the
 *  transcript cleanup, so a long meeting isn't N sequential round-trips. */
export const ANALYZE_CONCURRENCY = 3;

const REDUCE_SYSTEM_PROMPT = `Kamu editor notulen. Kamu diberi beberapa ringkasan bagian dari SATU rapat.
Gabungkan menjadi satu ringkasan eksekutif 2-4 kalimat untuk keseluruhan rapat.
Balas HANYA teks ringkasannya, tanpa judul, tanpa markdown, tanpa penjelasan.
Gunakan bahasa yang sama dengan ringkasan bagian. Jangan menambah fakta baru.`;

/** Collapse the per-chunk summaries into one. Best-effort: if the extra call
 *  fails, the concatenated summaries from `mergeAnalyses` are kept. */
async function reduceSummary(client: AIClient, parts: Analysis[]): Promise<string> {
  const user = parts
    .map((p, i) => `Bagian ${i + 1}: ${p.executiveSummary}`)
    .filter((line) => line.length > 12)
    .join('\n');
  const text = (await client.complete({ system: REDUCE_SYSTEM_PROMPT, user })).trim();
  if (!text) throw new AIError('Ringkasan gabungan kosong', true);
  return text;
}

/**
 * Full analysis. Transcripts that fit one request take a single call; longer
 * ones are analyzed chunk by chunk and folded back together (map-reduce), so
 * a two-hour meeting is summarized in full instead of having its middle cut.
 * A chunk that fails is skipped rather than failing the whole meeting — but
 * if every chunk fails, the error propagates.
 */
export async function analyzeMeeting(client: AIClient, meeting: Meeting): Promise<Analysis> {
  const chunks = chunkEntries(meeting.entries);
  if (chunks.length <= 1) return completeAnalysis(client, buildUserPrompt(meeting));

  const parts: Analysis[] = [];
  let lastError: unknown;
  for (let i = 0; i < chunks.length; i += ANALYZE_CONCURRENCY) {
    const batch = chunks.slice(i, i + ANALYZE_CONCURRENCY);
    const settled = await Promise.all(
      batch.map((entries, k) =>
        completeAnalysis(
          client,
          buildUserPrompt(
            { ...meeting, entries },
            { index: i + k, total: chunks.length },
          ),
        ).then(
          (a) => a,
          (e) => {
            lastError = e;
            return null;
          },
        ),
      ),
    );
    for (const a of settled) if (a) parts.push(a);
  }
  if (!parts.length) throw lastError;

  const merged = mergeAnalyses(parts);
  if (parts.length < 2) return merged;
  try {
    merged.executiveSummary = await reduceSummary(client, parts);
  } catch {
    /* keep the concatenated per-chunk summaries */
  }
  return merged;
}
