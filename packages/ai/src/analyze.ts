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

export function buildUserPrompt(m: Meeting): string {
  return `Meeting: ${m.id}\nTranscript:\n${formatTranscript(m)}`;
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

/** Full analysis with one retry on retryable failures. */
export async function analyzeMeeting(client: AIClient, meeting: Meeting): Promise<Analysis> {
  const req = { system: SYSTEM_PROMPT, user: buildUserPrompt(meeting), json: true };
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
