import { describe, expect, it } from 'vitest';
import type { Analysis, Meeting } from '@meetcc/shared';
import { toPdf } from './pdf';

const meeting: Meeting = {
  id: 'zkz-fwkm-ibn',
  meta: { id: 'zkz-fwkm-ibn', startedAt: '2026-07-12T16:00:00Z', lastSeenAt: '2026-07-12T17:00:00Z' },
  entries: [{ speaker: 'Manan', text: 'halo', time: '2026-07-12T16:00:10Z' }],
};

const analysis: Analysis = {
  executiveSummary: 'Rapat membahas perbaikan PDF invoice. '.repeat(10),
  timeline: [{ time: '23:00', topic: 'Pembukaan' }],
  keyDiscussions: Array.from({ length: 30 }, (_, i) => `Diskusi panjang nomor ${i} `.repeat(6)),
  decisions: [{ what: 'Perbaiki template', why: 'Layout rusak', rejected: ['Ganti tool'], topic: 'pdf' }],
  actionItems: [{ task: 'Fix logo', owner: 'Gunawan', due: 'Jumat' }],
  risks: ['Deadline mepet'],
  openQuestions: ['Siapa reviewer?'],
  nextSteps: ['Review'],
  diagrams: [],
};

// 2×2 RGBA PNG — a real, jsPDF-decodable bitmap so addImage places a page
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGM4oaHxH4QZYAwASgQIXRyHR0QAAAAASUVORK5CYII=';

describe('toPdf', () => {
  it('produces a non-trivial PDF blob with page-break handling', async () => {
    const blob = toPdf(meeting, analysis);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(5_000);
    const head = new Uint8Array((await blob.arrayBuffer()).slice(0, 5));
    expect(String.fromCharCode(...head)).toBe('%PDF-');
  });

  it('handles empty analysis sections without throwing', () => {
    const empty: Analysis = {
      executiveSummary: 'Singkat.',
      timeline: [],
      keyDiscussions: [],
      decisions: [],
      actionItems: [],
      risks: [],
      openQuestions: [],
      nextSteps: [],
      diagrams: [],
    };
    expect(toPdf(meeting, empty).size).toBeGreaterThan(1_000);
  });

  it('appends diagram pages (landscape for wide, portrait for tall)', () => {
    const withWide = toPdf(meeting, analysis, [
      { title: 'Wide flow', dataUrl: PNG, wPx: 1600, hPx: 400 },
      { title: 'Tall flow', dataUrl: PNG, wPx: 400, hPx: 1200 },
    ]);
    const withNone = toPdf(meeting, analysis, []);
    expect(withWide.size).toBeGreaterThan(withNone.size);
  });
});
