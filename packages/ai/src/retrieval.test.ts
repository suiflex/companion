import { describe, expect, it } from 'vitest';
import { withEntryIds, type Entry } from '@meetcc/shared';
import {
  bm25,
  buildIndex,
  expandWindow,
  fitBudget,
  mergeSpans,
  renderSpans,
  retrieve,
  selectContext,
  tokenize,
  WINDOW_TURNS,
} from './retrieval';

const T0 = Date.parse('2026-08-24T07:00:00Z');
const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();

const line = (speaker: string, text: string, sec: number): Entry => ({ speaker, text, time: at(sec) });

describe('tokenize', () => {
  it('drops stopwords and punctuation', () => {
    expect(tokenize('Bagaimana solusi dari aplikasi yang terdampak?')).toEqual([
      'solusi',
      'aplikasi',
      'terdampak',
    ]);
  });
});

describe('bm25', () => {
  const entries = [
    line('A', 'kita bahas jadwal rilis', 0),
    line('B', 'aplikasi terdampak ada tiga', 30),
    line('C', 'makan siang dulu', 60),
  ];

  it('scores the matching line highest', () => {
    const scores = bm25(buildIndex(entries), ['aplikasi', 'terdampak']);
    expect(scores[1]).toBeGreaterThan(scores[0]);
    expect(scores[2]).toBe(0);
  });

  it('finds a near-miss spelling only in fuzzy mode', () => {
    const index = buildIndex(entries);
    expect(bm25(index, ['aplikasinya'])[1]).toBe(0);
    expect(bm25(index, ['aplikasinya'], true)[1]).toBeGreaterThan(0);
  });
});

describe('expandWindow', () => {
  const entries = Array.from({ length: 20 }, (_, i) => line('A', `baris ${i}`, i * 10));

  it('takes turns on both sides of the hit', () => {
    expect(expandWindow(entries, 10)).toEqual({ start: 10 - WINDOW_TURNS, end: 10 + WINDOW_TURNS });
  });

  it('stops at a long silence — the topic moved on', () => {
    const gapped = [...entries];
    gapped[8] = line('A', 'baris 8', 8 * 10 - 300); // 5 min of silence before 9
    expect(expandWindow(gapped, 10).start).toBe(9);
  });

  it('never runs past the transcript', () => {
    expect(expandWindow(entries, 0).start).toBe(0);
    expect(expandWindow(entries, 19).end).toBe(19);
  });
});

describe('mergeSpans', () => {
  it('merges overlapping and adjacent windows, keeping the best score', () => {
    expect(mergeSpans([{ start: 5, end: 9, score: 2 }, { start: 8, end: 12, score: 7 }])).toEqual([
      { start: 5, end: 12, score: 7 },
    ]);
    expect(mergeSpans([{ start: 0, end: 2, score: 1 }, { start: 9, end: 10, score: 1 }])).toHaveLength(2);
  });
});

describe('retrieve', () => {
  const entries = withEntryIds([
    line('Akbar', 'Ada beberapa aplikasi yang terdampak insiden ini', 0),
    line('Widi', 'Solusinya nanti dishare atau dibuat terpisah per aplikasi?', 20),
    line('Akbar', 'Belum diputuskan, dua-duanya masih dipertimbangkan', 40),
    line('Rina', 'Oke lanjut agenda berikutnya soal budget', 600),
    line('Rina', 'Budget kuartal depan naik sedikit', 620),
  ]);

  it('finds the discussion on exact keywords (pass 1)', () => {
    const r = retrieve(entries, { intent: 'analyze', keywords: ['aplikasi', 'terdampak'], relatedTerms: [] }, 'solusi aplikasi terdampak');
    expect(r.pass).toBe(1);
    expect(r.spans[0].start).toBe(0);
  });

  it('escalates to related terms when the exact keywords are too rare', () => {
    const r = retrieve(entries, { intent: 'analyze', keywords: ['mekanisme'], relatedTerms: ['shared', 'terpisah'] }, 'mekanisme penanganan');
    expect(r.pass).toBeGreaterThan(1);
    expect(r.hits).toBeGreaterThan(0);
  });

  it('reports no hits rather than inventing them', () => {
    const r = retrieve(entries, { intent: 'recall', keywords: ['kubernetes'], relatedTerms: [] }, 'kubernetes');
    expect(r.hits).toBe(0);
    expect(r.spans).toEqual([]);
  });
});

describe('selectContext', () => {
  const long = withEntryIds([
    ...Array.from({ length: 300 }, (_, i) => line('Rina', `pembahasan rutin nomor ${i} soal operasional harian`, i * 10)),
    line('Akbar', 'Ada beberapa aplikasi yang terdampak', 3000),
    line('Widi', 'Solusinya dishare atau dibuat terpisah?', 3020),
    ...Array.from({ length: 300 }, (_, i) => line('Rina', `penutup nomor ${i} soal administrasi`, 4000 + i * 10)),
  ]);

  it('sends a short meeting whole rather than retrieving', () => {
    const short = withEntryIds([line('A', 'halo', 0), line('B', 'hai', 10)]);
    const c = selectContext(short, { intent: 'recall', keywords: ['halo'], relatedTerms: [] }, 'halo?', 10_000);
    expect(c.retrieval.pass).toBe(0);
    expect(c.text).toContain('halo');
    expect(c.text).toContain('hai');
  });

  // P0.10 regression: the old head+tail truncation deleted the middle of long
  // transcripts, so a mid-meeting answer was invisible to the model.
  it('keeps the middle of a long transcript when that is where the answer is', () => {
    const c = selectContext(
      long,
      { intent: 'analyze', keywords: ['aplikasi', 'terdampak'], relatedTerms: ['shared', 'terpisah'] },
      'gimana solusi aplikasi yang terdampak?',
      3_000,
    );
    expect(c.retrieval.pass).toBeGreaterThan(0);
    expect(c.text).toContain('aplikasi yang terdampak');
    expect(c.text).toContain('dishare atau dibuat terpisah');
    expect(c.text.length).toBeLessThanOrEqual(3_000);
  });

  it('fitBudget drops the weakest spans first', () => {
    const spans = [
      { start: 0, end: 0, score: 1 },
      { start: 10, end: 10, score: 9 },
    ];
    const kept = fitBudget(long, spans, renderSpans(long, [spans[1]]).length);
    expect(kept).toHaveLength(1);
    expect(kept[0].score).toBe(9);
  });
});

describe('renderSpans', () => {
  it('labels every line with its citable id and marks skipped stretches', () => {
    const entries = withEntryIds(Array.from({ length: 10 }, (_, i) => line('A', `baris ${i}`, i * 10)));
    const text = renderSpans(entries, [
      { start: 0, end: 1, score: 1 },
      { start: 6, end: 7, score: 1 },
    ]);
    expect(text).toContain('[E1]');
    expect(text).toContain('[E7]');
    expect(text).toContain('bagian lain rapat');
    expect(text).not.toContain('baris 3');
  });
});

describe('bm25 fuzzy weighting', () => {
  it('does not penalise a doc that matched exactly and also has a prefix hit', () => {
    const entries = [
      { speaker: 'A', text: 'deploy deployment', time: '2026-01-01T00:00:00.000Z' },
      { speaker: 'A', text: 'deploy sekali', time: '2026-01-01T00:00:10.000Z' },
    ];
    const scores = bm25(buildIndex(entries), ['deploy'], true);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });
});
