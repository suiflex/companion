import { entryId, type AskIntent, type Entry } from '@meetcc/shared';

// P0.3 / P0.7 / P0.8 — lexical + structural retrieval, deliberately without
// embeddings or a vector store. Meeting questions carry strong lexical signal
// (names, apps, decisions, dates), so BM25 over caption lines plus phrase,
// prefix and speaker matching finds the discussion; conversation-window
// expansion then hands the model the surrounding turns instead of one line,
// because a meeting answer is almost never contained in a single caption.

/** Words that carry no retrieval signal in ID/EN meeting talk. */
const STOPWORDS = new Set(
  (
    'yang di ke dari dan atau untuk pada dengan itu ini ada adalah akan bisa dapat ' +
    'kita kami saya anda dia mereka nya apa apakah bagaimana gimana kenapa mengapa ' +
    'kapan siapa mana sudah belum tidak bukan juga saja lagi biar agar kalau jika ' +
    'per oleh dalam tentang seperti sangat lebih paling harus perlu mau ingin ' +
    'the a an of to in for on with is are was were be been it this that and or ' +
    'what how why when who which do does did can could should would will'
  ).split(' '),
);

/** Below this length a prefix match is noise ("ap" would match everything). */
const MIN_PREFIX_LEN = 4;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface LexicalIndex {
  docs: string[][];
  df: Map<string, number>;
  avgdl: number;
}

export function buildIndex(entries: Entry[]): LexicalIndex {
  const docs = entries.map((e) => tokenize(e.text));
  const df = new Map<string, number>();
  for (const tokens of docs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const total = docs.reduce((n, d) => n + d.length, 0);
  return { docs, df, avgdl: docs.length ? total / docs.length : 0 };
}

const K1 = 1.5;
const B = 0.75;

/** Exact-token BM25 plus, when `fuzzy`, prefix matches at a reduced weight. */
export function bm25(index: LexicalIndex, terms: string[], fuzzy = false): number[] {
  const n = index.docs.length;
  const scores = new Array<number>(n).fill(0);
  if (!n) return scores;
  const query = [...new Set(terms.flatMap((t) => tokenize(t)))];
  for (const term of query) {
    for (let i = 0; i < n; i++) {
      const doc = index.docs[i];
      if (!doc.length) continue;
      let tf = 0;
      let weight = 1;
      for (const t of doc) {
        if (t === term) tf += 1;
        else if (
          fuzzy &&
          term.length >= MIN_PREFIX_LEN &&
          (t.startsWith(term) || term.startsWith(t.slice(0, MIN_PREFIX_LEN)))
        ) {
          tf += 0.5;
          weight = 0.6;
        }
      }
      if (!tf) continue;
      // df is exact-only; an unseen fuzzy term falls back to the rarest idf
      const df = index.df.get(term) ?? 1;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      const norm = tf * (K1 + 1);
      const denom = tf + K1 * (1 - B + (B * doc.length) / (index.avgdl || 1));
      scores[i] += weight * idf * (norm / denom);
    }
  }
  return scores;
}

/** Whole-question phrase hits and speaker mentions are strong, cheap signals
 *  BM25 misses: they survive when individual terms are common. */
export function boostScores(entries: Entry[], scores: number[], question: string): number[] {
  const q = question.toLowerCase();
  const qTokens = new Set(tokenize(question));
  const phrase = tokenize(question).join(' ');
  return scores.map((s, i) => {
    const e = entries[i];
    let bonus = 0;
    if (phrase.length > 8 && tokenize(e.text).join(' ').includes(phrase)) bonus += 4;
    else if (q.length > 12 && e.text.toLowerCase().includes(q)) bonus += 4;
    if (tokenize(e.speaker).some((t) => qTokens.has(t))) bonus += 1.5;
    return s + bonus;
  });
}

// -- conversation windows --

/** Turns of context kept on each side of a hit. */
export const WINDOW_TURNS = 4;
/** A silence this long means the topic moved on — stop widening there. */
export const SEGMENT_GAP_MS = 90_000;

export interface Span {
  start: number; // inclusive entry index
  end: number; // inclusive
  score: number;
}

/** Widen a hit into the conversation around it, stopping at a topic gap. */
export function expandWindow(
  entries: Entry[],
  hit: number,
  turns = WINDOW_TURNS,
  gapMs = SEGMENT_GAP_MS,
): { start: number; end: number } {
  const at = (i: number): number => Date.parse(entries[i]?.time ?? '');
  let start = hit;
  for (let k = 0; k < turns && start > 0; k++) {
    const gap = at(start) - at(start - 1);
    if (Number.isFinite(gap) && gap > gapMs) break;
    start--;
  }
  let end = hit;
  for (let k = 0; k < turns && end < entries.length - 1; k++) {
    const gap = at(end + 1) - at(end);
    if (Number.isFinite(gap) && gap > gapMs) break;
    end++;
  }
  return { start, end };
}

/** Merge overlapping/adjacent windows, keeping the best score. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + 1) {
      last.end = Math.max(last.end, s.end);
      last.score = Math.max(last.score, s.score);
    } else out.push({ ...s });
  }
  return out;
}

// -- multi-pass retrieval --

export interface QueryPlan {
  intent: AskIntent;
  keywords: string[];
  relatedTerms: string[];
}

/** A pass with fewer distinct hits than this is "weak" — broaden and retry. */
export const MIN_HITS = 3;

/** …except on a short transcript, where three hits may not exist at all: a
 *  pass that lit up a fifth of the meeting has clearly found the discussion. */
export function enoughHits(hits: number, total: number): boolean {
  return hits >= MIN_HITS || (hits > 0 && hits >= Math.ceil(total * 0.2));
}

export interface Retrieval {
  spans: Span[];
  /** 0 = whole transcript fit the budget, 1-3 = the pass that produced hits. */
  pass: 0 | 1 | 2 | 3;
  hits: number;
}

function hitsOf(scores: number[]): number[] {
  return scores
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.i);
}

/**
 * PASS 1 exact keywords -> PASS 2 + related terms -> PASS 3 fuzzy + question
 * terms. Each pass is a superset of the last, so escalating can only add
 * evidence; we stop at the first pass that is not weak.
 */
export function retrieve(entries: Entry[], plan: QueryPlan, question: string): Retrieval {
  if (!entries.length) return { spans: [], pass: 3, hits: 0 };
  const index = buildIndex(entries);
  const passes: { terms: string[]; fuzzy: boolean }[] = [
    { terms: plan.keywords, fuzzy: false },
    { terms: [...plan.keywords, ...plan.relatedTerms], fuzzy: false },
    { terms: [...plan.keywords, ...plan.relatedTerms, question], fuzzy: true },
  ];
  let best: { scores: number[]; hits: number[]; pass: 1 | 2 | 3 } | null = null;
  for (let p = 0; p < passes.length; p++) {
    const scores = boostScores(entries, bm25(index, passes[p].terms, passes[p].fuzzy), question);
    const hits = hitsOf(scores);
    best = { scores, hits, pass: (p + 1) as 1 | 2 | 3 };
    if (enoughHits(hits.length, entries.length)) break;
  }
  if (!best || !best.hits.length) {
    return { spans: [], pass: best?.pass ?? 3, hits: 0 };
  }
  const spans = best.hits.map((i) => ({ ...expandWindow(entries, i), score: best!.scores[i] }));
  return { spans: mergeSpans(spans), pass: best.pass, hits: best.hits.length };
}

// -- transcript rendering with citable ids --

function clockOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** `[E12][14:47] Akbar: ...` — the id is what the model cites and we verify. */
export function formatEntryLine(e: Entry, index: number): string {
  return `[${e.id ?? entryId(index)}][${clockOf(e.time)}] ${e.speaker}: ${e.text}`;
}

export function renderSpans(entries: Entry[], spans: Span[]): string {
  const parts: string[] = [];
  let prevEnd = -1;
  for (const s of spans) {
    if (prevEnd >= 0 && s.start > prevEnd + 1) parts.push('[... bagian lain rapat ...]');
    for (let i = s.start; i <= s.end; i++) parts.push(formatEntryLine(entries[i], i));
    prevEnd = s.end;
  }
  return parts.join('\n');
}

/** Drop the lowest-scoring spans until the rendered text fits the budget.
 *  P0.10: nothing is ever cut out of the *middle* of a kept span. */
export function fitBudget(entries: Entry[], spans: Span[], budget: number): Span[] {
  let kept = spans;
  while (kept.length > 1 && renderSpans(entries, kept).length > budget) {
    const worst = kept.reduce((w, s, i) => (s.score < kept[w].score ? i : w), 0);
    kept = kept.filter((_, i) => i !== worst);
  }
  return kept;
}

/**
 * The context the Ask prompt gets. Small meetings go in whole — the old
 * head+tail truncation could delete exactly the middle where the answer was
 * (P0.10). Only when the transcript genuinely exceeds the budget do we fall
 * back to retrieved conversation windows.
 */
export function selectContext(
  entries: Entry[],
  plan: QueryPlan,
  question: string,
  budget: number,
): { text: string; spans: Span[]; retrieval: Retrieval } {
  const whole: Span[] = [{ start: 0, end: entries.length - 1, score: 1 }];
  if (entries.length && renderSpans(entries, whole).length <= budget) {
    return {
      text: renderSpans(entries, whole),
      spans: whole,
      retrieval: { spans: whole, pass: 0, hits: entries.length },
    };
  }
  const retrieval = retrieve(entries, plan, question);
  const spans = fitBudget(entries, retrieval.spans, budget);
  return { text: renderSpans(entries, spans), spans, retrieval };
}
