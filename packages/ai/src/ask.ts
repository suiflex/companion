import {
  entriesById,
  withEntryIds,
  type Analysis,
  type Answerability,
  type AskIntent,
  type AskResult,
  type ChatMessage,
  type Entry,
  type EvidenceSpan,
  type Meeting,
} from '@meetcc/shared';
import { AIError, type AIClient } from './client';
import { renderSpans, selectContext, tokenize, type QueryPlan, type Span } from './retrieval';

// Ask Engine v2 — "chat with transcript" as retrieval + reasoning + verified
// grounding instead of context stuffing:
//
//   question -> query plan -> multi-pass lexical retrieval -> conversation
//   windows -> LLM -> evidence verification -> structured AskResult
//
// Still no embeddings and no vector store; see retrieval.ts for why.

/** Only the last few turns are replayed — enough for follow-ups, bounded cost. */
export const MAX_HISTORY_TURNS = 8;

/** Characters of transcript the answering prompt may carry. A meeting that
 *  fits goes in whole; a longer one is narrowed by retrieval, never by
 *  cutting its middle out (the old head+tail truncation, P0.10). */
export const ASK_BUDGET_CHARS = 60_000;

// -- P0.6: query planner (LLM understands the question; it stores nothing) --

export const PLANNER_SYSTEM_PROMPT = `Kamu perencana pencarian untuk transcript rapat.
Balas HANYA satu objek JSON valid (tanpa markdown fence, tanpa teks lain):
{
  "intent": "recall" | "explain" | "analyze" | "advise",
  "keywords": [string],      // kata kunci inti dari pertanyaan, apa adanya
  "relatedTerms": [string]   // sinonim / istilah yang mungkin dipakai peserta rapat
}
intent: recall = menanyakan fakta yang disebut, explain = menanyakan alasan,
analyze = minta kesimpulan dari pembahasan, advise = minta saran/opini.
Gunakan bahasa yang sama dengan pertanyaan. Maksimal 8 keywords dan 8 relatedTerms.`;

const INTENTS: AskIntent[] = ['recall', 'explain', 'analyze', 'advise'];

const strArr = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean))].slice(
        0,
        max,
      )
    : [];

/** Heuristic plan used when the planner call fails or answers badly — the ask
 *  must never fail just because the *planning* step did. */
export function fallbackPlan(question: string): QueryPlan {
  const q = question.toLowerCase();
  const intent: AskIntent = /saran|sebaiknya|menurut|rekomendasi|advis/.test(q)
    ? 'advise'
    : /kenapa|mengapa|alasan|why/.test(q)
      ? 'explain'
      : /analisa|analisis|masalah utama|kesimpulan|rangkum/.test(q)
        ? 'analyze'
        : 'recall';
  return { intent, keywords: tokenize(question), relatedTerms: [] };
}

export function parsePlan(raw: string, question: string): QueryPlan {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return fallbackPlan(question);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return fallbackPlan(question);
  }
  const base = fallbackPlan(question);
  const intent = INTENTS.includes(obj.intent as AskIntent) ? (obj.intent as AskIntent) : base.intent;
  const keywords = strArr(obj.keywords, 8);
  return {
    intent,
    // an empty plan is worse than no plan: keep the question's own terms
    keywords: keywords.length ? keywords : base.keywords,
    relatedTerms: strArr(obj.relatedTerms, 8),
  };
}

export async function planQuery(client: AIClient, question: string): Promise<QueryPlan> {
  try {
    const raw = await client.complete({
      system: PLANNER_SYSTEM_PROMPT,
      user: `Pertanyaan: ${question}`,
      json: true,
    });
    return parsePlan(raw, question);
  } catch {
    return fallbackPlan(question);
  }
}

// -- P0.5 / P0.12: answering with graded answerability --

export const ASK_SYSTEM_PROMPT = `Kamu asisten yang menjawab pertanyaan tentang satu rapat, berdasarkan potongan transcript yang diberikan.
Setiap baris transcript berformat [ID][jam] Pembicara: ucapan. ID itulah rujukan bukti.

Balas HANYA satu objek JSON valid (tanpa markdown fence, tanpa teks lain):
{
  "answer": string,            // jawaban untuk pengguna, bahasa sama dengan transcript
  "answerability": "explicit" | "partial" | "inferred" | "not_found",
  "confidence": number,        // 0..1
  "evidence": [string],        // daftar ID baris transcript yang mendukung, mis. ["E12","E13"]
  "missing": [string],         // hal penting yang BELUM diputuskan/disebut di rapat
  "followUps": [string]        // maksimal 3 pertanyaan lanjutan yang berguna
}

Aturan answerability:
- explicit: jawaban dinyatakan langsung di transcript.
- partial: rapat membahas topiknya tapi belum tuntas/belum diputuskan. Tetap jelaskan opsi atau arah pembahasan yang ada, jangan menolak menjawab.
- inferred: jawaban tidak dinyatakan langsung tapi dapat disimpulkan dari rangkaian percakapan. Katakan bahwa ini simpulan.
- not_found: HANYA jika benar-benar tidak ada satu pun baris yang relevan.

Aturan lain:
- Dilarang menjawab "Tidak disebutkan dalam rapat." ketika masih ada pembahasan yang berkaitan; gunakan partial atau inferred dan jelaskan sejauh mana rapat membahasnya.
- "evidence" wajib berisi ID yang benar-benar ada pada transcript di atas. Jangan mengarang ID, jam, atau nama.
- Jangan mengarang fakta. Jika diminta saran (intent advise), pisahkan dengan jelas mana isi rapat dan mana saranmu.`;

function historyBlock(history: ChatMessage[]): string {
  const recent = history.slice(-MAX_HISTORY_TURNS);
  if (!recent.length) return '';
  const lines = recent.map((m) => `${m.role === 'user' ? 'Pengguna' : 'Asisten'}: ${m.content}`);
  return `\n\nPercakapan sebelumnya:\n${lines.join('\n')}`;
}

/** `context` is the retrieved transcript text; omitted, the whole meeting is
 *  rendered (used by the back-compat `askTranscript` path and by tests). */
export function buildAskPrompt(
  meeting: Meeting,
  analysis: Analysis | null,
  history: ChatMessage[],
  question: string,
  context?: string,
): string {
  const entries = withEntryIds(meeting.entries);
  const text =
    context ??
    renderSpans(entries, entries.length ? [{ start: 0, end: entries.length - 1, score: 1 }] : []);
  const summary = analysis?.executiveSummary
    ? `\n\nRingkasan rapat:\n${analysis.executiveSummary}`
    : '';
  return (
    `Rapat: ${meeting.id}\n\nTranscript:\n${text}` +
    summary +
    historyBlock(history) +
    `\n\nPertanyaan: ${question}`
  );
}

const ANSWERABILITY: Answerability[] = ['explicit', 'partial', 'inferred', 'not_found'];

const DEFAULT_CONFIDENCE: Record<Answerability, number> = {
  explicit: 0.9,
  partial: 0.6,
  inferred: 0.5,
  not_found: 0.2,
};

/** Pull the ids out of whatever shape the model used: ["E1"], [{entryIds:[…]}],
 *  or prose containing ids. Unknown ids are dropped by the caller. */
function rawEvidenceIds(v: unknown): string[] {
  const out: string[] = [];
  const push = (s: unknown): void => {
    if (typeof s !== 'string') return;
    for (const m of s.matchAll(/\bE\d+\b/g)) out.push(m[0]);
  };
  if (Array.isArray(v)) {
    for (const item of v) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        const o = item as { entryIds?: unknown; id?: unknown };
        if (Array.isArray(o.entryIds)) o.entryIds.forEach(push);
        else push(o.id);
      }
    }
  } else push(v);
  return [...new Set(out)];
}

/**
 * P0.9 — turn cited ids into verified evidence. Ids that do not exist in the
 * transcript are silently dropped, so a hallucinated citation can never reach
 * the UI; consecutive ids collapse into one span with real timestamps taken
 * from the transcript rather than from the model.
 */
export function verifyEvidence(entries: Entry[], ids: string[]): EvidenceSpan[] {
  const byId = entriesById(entries);
  const indexOf = new Map<string, number>();
  entries.forEach((e, i) => indexOf.set(e.id ?? `E${i + 1}`, i));
  const known = ids.filter((id) => byId.has(id));
  const idx = [...new Set(known.map((id) => indexOf.get(id)!))].sort((a, b) => a - b);
  const spans: EvidenceSpan[] = [];
  let run: number[] = [];
  const flush = (): void => {
    if (!run.length) return;
    const rows = run.map((i) => entries[i]);
    spans.push({
      entryIds: rows.map((e, k) => e.id ?? `E${run[k] + 1}`),
      startTime: rows[0].time,
      endTime: rows[rows.length - 1].time,
      speakers: [...new Set(rows.map((e) => e.speaker))],
      preview: rows[0].text.slice(0, 160),
    });
    run = [];
  };
  for (const i of idx) {
    if (run.length && i !== run[run.length - 1] + 1) flush();
    run.push(i);
  }
  flush();
  return spans;
}

/** Parse + ground the model's answer. `entries` must be the ones that were in
 *  the prompt, so verification checks exactly what the model could see. */
export function parseAskResult(raw: string, entries: Entry[], plan: QueryPlan): AskResult {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AIError('Respons AI bukan JSON', true);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AIError('JSON dari AI tidak valid', true);
  }
  const answer = typeof obj.answer === 'string' ? obj.answer.trim() : '';
  if (!answer) throw new AIError('Jawaban kosong dari AI', true);

  let answerability = ANSWERABILITY.includes(obj.answerability as Answerability)
    ? (obj.answerability as Answerability)
    : 'partial';
  const evidence = verifyEvidence(entries, rawEvidenceIds(obj.evidence));
  // "explicit" is a claim about a specific line; without one that survives
  // verification the honest grade is "inferred".
  if (!evidence.length && answerability === 'explicit') answerability = 'inferred';

  const rawConf = typeof obj.confidence === 'number' ? obj.confidence : NaN;
  let confidence = Number.isFinite(rawConf)
    ? Math.min(1, Math.max(0, rawConf))
    : DEFAULT_CONFIDENCE[answerability];
  if (!evidence.length && answerability !== 'not_found') confidence = Math.min(confidence, 0.4);

  return {
    answer,
    answerability,
    intent: plan.intent,
    confidence,
    evidence,
    missing: strArr(obj.missing, 6),
    followUps: strArr(obj.followUps, 3),
  };
}

function contextEntries(entries: Entry[], spans: Span[]): Entry[] {
  const out: Entry[] = [];
  for (const s of spans) for (let i = s.start; i <= s.end; i++) out.push(entries[i]);
  return out;
}

/**
 * Answer a question about one meeting and return the structured, grounded
 * result. One retry on transient failure, same as the rest of the AI layer.
 */
export async function askMeeting(
  client: AIClient,
  meeting: Meeting,
  analysis: Analysis | null,
  history: ChatMessage[],
  question: string,
): Promise<AskResult> {
  const q = question.trim();
  if (!q) throw new AIError('Pertanyaan kosong', false);

  const entries = withEntryIds(meeting.entries);
  const plan = await planQuery(client, q);
  const { text, spans, retrieval } = selectContext(entries, plan, q, ASK_BUDGET_CHARS);

  // Nothing matched after all three passes: answer without burning a call.
  if (!spans.length) {
    return {
      answer: 'Tidak ada bagian rapat yang membahas hal ini.',
      answerability: 'not_found',
      intent: plan.intent,
      confidence: 0.2,
      evidence: [],
      missing: [],
      followUps: [],
    };
  }

  const visible = contextEntries(entries, spans);
  const header =
    retrieval.pass === 0
      ? ''
      : `\n\n(Transcript panjang: yang ditampilkan adalah bagian paling relevan dari rapat, bukan keseluruhan.)`;
  const req = {
    system: ASK_SYSTEM_PROMPT,
    user: buildAskPrompt(meeting, analysis, history, q, text) + header,
    json: true,
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseAskResult(await client.complete(req), visible, plan);
    } catch (e) {
      lastError = e;
      if (e instanceof AIError && !e.retryable) break;
    }
  }
  throw lastError;
}

/** Text-only wrapper kept for callers that just want the answer string. */
export async function askTranscript(
  client: AIClient,
  meeting: Meeting,
  analysis: Analysis | null,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  return (await askMeeting(client, meeting, analysis, history, question)).answer;
}
