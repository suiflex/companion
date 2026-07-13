import { describe, expect, it } from 'vitest';
import type { Analysis } from './types';
import { migrateAnalysis, normalizeDecisions, normalizeDiagrams } from './migrate';

describe('normalizeDecisions', () => {
  it('upgrades old string decisions to the enriched shape', () => {
    expect(normalizeDecisions(['Pakai Redis', '  '])).toEqual([
      { what: 'Pakai Redis', why: '', rejected: [], topic: '' },
    ]);
  });

  it('keeps object decisions and drops ones without `what`', () => {
    const out = normalizeDecisions([
      { what: 'A', why: 'b', rejected: ['x', ''], topic: 'core' },
      { why: 'orphan' },
    ]);
    expect(out).toEqual([{ what: 'A', why: 'b', rejected: ['x'], topic: 'core' }]);
  });

  it('handles non-arrays', () => {
    expect(normalizeDecisions(null)).toEqual([]);
  });
});

describe('normalizeDiagrams', () => {
  it('keeps well-formed diagrams and defaults blank titles', () => {
    const out = normalizeDiagrams([
      { title: 'Alur', type: 'flowchart', mermaid: 'flowchart TB\nA-->B' },
      { title: '', type: 'sequenceDiagram', mermaid: 'sequenceDiagram\nA->>B: hi' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].title).toBe('Diagram');
  });

  it('drops invalid type, empty source, and non-arrays', () => {
    expect(normalizeDiagrams(undefined)).toEqual([]);
    expect(normalizeDiagrams('nope')).toEqual([]);
    expect(
      normalizeDiagrams([
        { title: 'x', type: 'gantt', mermaid: 'gantt' }, // type not allowed
        { title: 'y', type: 'flowchart', mermaid: '' }, // empty source
        { title: 'z', type: 'flowchart', mermaid: 'flowchart TB\nA-->B' }, // ok
      ]),
    ).toHaveLength(1);
  });

  it('caps at 3 diagrams', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      title: `d${i}`,
      type: 'flowchart' as const,
      mermaid: 'flowchart TB\nA-->B',
    }));
    expect(normalizeDiagrams(many)).toHaveLength(3);
  });
});

describe('migrateAnalysis', () => {
  it('backfills diagrams and upgrades string decisions on an old record', () => {
    const old = { executiveSummary: 'ok', decisions: ['x'] } as unknown as Analysis;
    const m = migrateAnalysis(old);
    expect(m.diagrams).toEqual([]);
    expect(m.decisions).toEqual([{ what: 'x', why: '', rejected: [], topic: '' }]);
  });

  it('preserves valid diagrams already present', () => {
    const a = {
      executiveSummary: 'ok',
      diagrams: [{ title: 'A', type: 'flowchart', mermaid: 'flowchart TB\nA-->B' }],
    } as unknown as Analysis;
    expect(migrateAnalysis(a).diagrams).toHaveLength(1);
  });
});
