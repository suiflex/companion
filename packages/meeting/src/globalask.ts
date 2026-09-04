import { AIError, formatEntryLine, verifyEvidence, type AIClient } from '@meetcc/ai';
import { locale, t } from '@meetcc/shared/i18n';
import type { AskIntent, AskResult, Entry, EvidenceSpan } from '@meetcc/shared';
import type { CompanionStore, SearchHit } from '@meetcc/store';

// P1.8 — Ask across every meeting, still without embeddings (§23). The planner
// turns the question into a *structured* query (entity, kind, time range); the
// store answers it with SQL over the meeting memory plus FTS5 over the
// transcripts; only the resulting evidence windows reach the model.

export const GLOBAL_PLANNER_PROMPT = `Kamu perencana pencarian untuk arsip rapat.
Balas HANYA satu objek JSON valid:
{
  "intent": "recall" | "explain" | "analyze" | "advise",
  "kind": "decision" | "action" | "question" | "any",
  "entity": string,          // topik/proyek/aplikasi/orang yang ditanyakan, boleh ""
  "keywords": [string],
  "months": number           // rentang waktu ke belakang dalam bulan, 0 = tanpa batas
}
Gunakan bahasa yang sama dengan pertanyaan.`;

export interface GlobalPlan {
  intent: AskIntent;
  kind: 'decision' | 'action' | 'question' | 'any';
  entity: string;
  keywords: string[];
  months: number;
}

const INTENTS: AskIntent[] = ['recall', 'explain', 'analyze', 'advise'];
const KINDS: GlobalPlan['kind'][] = ['decision', 'action', 'question', 'any'];

const words = (q: string): string[] =>
  q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 2);

export function fallbackGlobalPlan(question: string): GlobalPlan {
  const q = question.toLowerCase();
  const months = /tahun|year/.test(q) ? 12 : /bulan|month/.test(q) ? 3 : 0;
  return {
    intent: /kenapa|mengapa|alasan/.test(q) ? 'explain' : 'recall',
    kind: /keputusan|decision/.test(q)
      ? 'decision'
      : /action|tugas|task/.test(q)
        ? 'action'
        : /pertanyaan|question/.test(q)
          ? 'question'
          : 'any',
    entity: '',
    keywords: words(question),
    months,
  };
}

export function parseGlobalPlan(raw: string, question: string): GlobalPlan {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return fallbackGlobalPlan(question);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return fallbackGlobalPlan(question);
  }
  const base = fallbackGlobalPlan(question);
  const keywords = Array.isArray(obj.keywords)
    ? obj.keywords.filter((k): k is string => typeof k === 'string' && !!k.trim()).slice(0, 8)
    : [];
  const entity = typeof obj.entity === 'string' ? obj.entity.trim() : '';
  return {
    intent: INTENTS.includes(obj.intent as AskIntent) ? (obj.intent as AskIntent) : base.intent,
    kind: KINDS.includes(obj.kind as GlobalPlan['kind']) ? (obj.kind as GlobalPlan['kind']) : base.kind,
    entity,
    keywords: keywords.length ? keywords : entity ? [entity] : base.keywords,
    months: Number.isFinite(obj.months) ? Math.max(0, Math.min(60, Number(obj.months))) : base.months,
  };
}

export interface GlobalEvidence {
  sessionId: string;
  sessionTitle: string;
  startedAt: string | null;
  entries: Entry[];
}

const MONTH_MS = 30 * 24 * 60 * 60_000;

/** Lines around a hit, so the model sees the exchange and not one caption. */
export const GLOBAL_WINDOW = 3;
/** Meetings a single global answer may draw on. */
export const MAX_SOURCE_MEETINGS = 6;

/**
 * Structured retrieval: filter the memory tables by kind/entity/date, then pull
 * the transcript window around each hit. Falls back to the cross-meeting FTS
 * index when the structured filter finds nothing.
 */
export function collectGlobalEvidence(
  store: CompanionStore,
  plan: GlobalPlan,
  question: string,
): GlobalEvidence[] {
  const since = plan.months ? new Date(Date.now() - plan.months * MONTH_MS).toISOString() : undefined;
  const query = [plan.entity, ...plan.keywords].filter(Boolean).join(' ') || question;

  const bySession = new Map<string, Set<number>>();
  const note = (sessionId: string, seq: number): void => {
    const set = bySession.get(sessionId) ?? new Set<number>();
    set.add(seq);
    bySession.set(sessionId, set);
  };

  const hits: SearchHit[] = store.search(query, { limit: 60 });
  const wanted =
    plan.kind === 'any'
      ? hits
      : hits.filter((h) => h.kind === plan.kind || h.kind === 'transcript');

  const sessions = new Map(store.listSessions().map((s) => [s.id, s]));
  for (const hit of wanted) {
    const session = sessions.get(hit.sessionId);
    if (!session) continue;
    if (since && session.startedAt && session.startedAt < since) continue;
    if (hit.kind === 'transcript') {
      const entries = store.getEntries(hit.sessionId);
      const idx = entries.findIndex((e) => e.text === hit.text);
      if (idx >= 0) note(hit.sessionId, idx);
    } else {
      const table =
        hit.kind === 'decision' ? 'decisions' : hit.kind === 'action' ? 'action_items' : 'open_questions';
      const evidence = store.evidenceFor(table, hit.entityId);
      const entries = store.getEntries(hit.sessionId);
      for (const e of evidence) {
        const idx = entries.findIndex((x) => x.id === e.id);
        if (idx >= 0) note(hit.sessionId, idx);
      }
      // an entity with no linked evidence still marks its meeting as relevant
      if (!evidence.length) note(hit.sessionId, 0);
    }
  }

  const out: GlobalEvidence[] = [];
  for (const [sessionId, seqs] of bySession) {
    const session = sessions.get(sessionId);
    const entries = store.getEntries(sessionId);
    if (!entries.length) continue;
    const keep = new Set<number>();
    for (const seq of seqs) {
      for (let i = Math.max(0, seq - GLOBAL_WINDOW); i <= Math.min(entries.length - 1, seq + GLOBAL_WINDOW); i++) {
        keep.add(i);
      }
    }
    out.push({
      sessionId,
      sessionTitle: session?.title || sessionId,
      startedAt: session?.startedAt ?? null,
      entries: [...keep].sort((a, b) => a - b).map((i) => entries[i]),
    });
  }
  return out
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
    .slice(0, MAX_SOURCE_MEETINGS);
}

export const GLOBAL_ASK_PROMPT = `Kamu asisten yang menjawab pertanyaan berdasarkan beberapa rapat sekaligus.
Setiap baris berformat [ID][jam] Pembicara: ucapan, dikelompokkan per rapat.

Balas HANYA satu objek JSON valid:
{
  "answer": string,          // jawaban ringkas; sebutkan rapat mana bila relevan
  "answerability": "explicit" | "partial" | "inferred" | "not_found",
  "confidence": number,
  "evidence": [string],      // ID baris yang mendukung
  "missing": [string],
  "followUps": [string]
}
Aturan: susun kronologi bila keputusan berubah antar rapat. Jangan mengarang ID atau fakta.
Gunakan bahasa yang sama dengan transcript.`;

export function buildGlobalPrompt(evidence: GlobalEvidence[], question: string): string {
  const blocks = evidence.map((g) => {
    const when = g.startedAt ? new Date(g.startedAt).toLocaleDateString(locale()) : '—';
    const lines = g.entries.map((e, i) => formatEntryLine(e, i)).join('\n');
    return `## ${g.sessionTitle} (${when}) [${g.sessionId}]\n${lines}`;
  });
  return `${blocks.join('\n\n')}\n\nPertanyaan: ${question}`;
}

/**
 * Evidence ids are only unique within a meeting, so verification runs per
 * meeting and the spans are merged — a cited id that exists in no meeting is
 * dropped exactly as in single-meeting Ask. Unlike single-meeting Ask, the
 * global result knows WHICH meeting every span came from (§32.1 G3 counts
 * distinct `sessionId`s as `meetingsCited`).
 */
export interface GlobalEvidenceSpan extends EvidenceSpan {
  sessionId: string;
}

export function verifyGlobalEvidence(evidence: GlobalEvidence[], ids: string[]): GlobalEvidenceSpan[] {
  return evidence.flatMap((g) =>
    verifyEvidence(g.entries, ids).map((span) => ({ ...span, sessionId: g.sessionId })),
  );
}

export interface GlobalAskResult extends AskResult {
  sessions: { id: string; title: string; startedAt: string | null }[];
  /** Same spans as `AskResult.evidence`, each tagged with its source meeting. */
  evidence: GlobalEvidenceSpan[];
}

export async function askMeetings(
  client: AIClient,
  store: CompanionStore,
  question: string,
): Promise<GlobalAskResult> {
  const q = question.trim();
  if (!q) throw new AIError(t('pkg.ai.emptyQuestion'), false);

  let plan: GlobalPlan;
  try {
    plan = parseGlobalPlan(
      await client.complete({ system: GLOBAL_PLANNER_PROMPT, user: `Pertanyaan: ${q}`, json: true }),
      q,
    );
  } catch {
    plan = fallbackGlobalPlan(q);
  }

  const evidence = collectGlobalEvidence(store, plan, q);
  const sessions = evidence.map((g) => ({ id: g.sessionId, title: g.sessionTitle, startedAt: g.startedAt }));
  if (!evidence.length) {
    return {
      answer: t('pkg.ask.noRelevantMeeting'),
      answerability: 'not_found',
      intent: plan.intent,
      confidence: 0.2,
      evidence: [],
      missing: [],
      followUps: [],
      sessions: [],
    };
  }

  const req = {
    system: GLOBAL_ASK_PROMPT,
    user: buildGlobalPrompt(evidence, q),
    json: true,
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { ...parseGlobalResult(await client.complete(req), evidence, plan), sessions };
    } catch (e) {
      lastError = e;
      if (e instanceof AIError && !e.retryable) break;
    }
  }
  throw lastError;
}

const ANSWERABILITY = ['explicit', 'partial', 'inferred', 'not_found'] as const;

/** Parse + ground a global answer. Same contract as single-meeting Ask: a
 *  citation that verifies against no stored meeting simply does not exist.
 *  Every surviving span is tagged with its source meeting (GlobalEvidenceSpan). */
export function parseGlobalResult(
  raw: string,
  evidence: GlobalEvidence[],
  plan: GlobalPlan,
): Omit<GlobalAskResult, 'sessions'> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AIError('Respons AI bukan JSON', true);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AIError(t('pkg.ai.badJson'), true);
  }
  const answer = typeof obj.answer === 'string' ? obj.answer.trim() : '';
  if (!answer) throw new AIError(t('pkg.ai.emptyAnswer'), true);

  const ids = Array.isArray(obj.evidence)
    ? obj.evidence.filter((x): x is string => typeof x === 'string')
    : [];
  const spans = verifyGlobalEvidence(evidence, ids);
  const strArr = (v: unknown, max: number): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [];

  let answerability = ANSWERABILITY.includes(obj.answerability as (typeof ANSWERABILITY)[number])
    ? (obj.answerability as AskResult['answerability'])
    : 'partial';
  if (!spans.length && answerability === 'explicit') answerability = 'inferred';

  const conf = typeof obj.confidence === 'number' ? Math.min(1, Math.max(0, obj.confidence)) : 0.6;
  return {
    answer,
    answerability,
    intent: plan.intent,
    confidence: spans.length ? conf : Math.min(conf, 0.4),
    evidence: spans,
    missing: strArr(obj.missing, 6),
    followUps: strArr(obj.followUps, 3),
  };
}
