import type { Analysis, Decision, Diagram, DiagramType } from './types';

// Stored analyses from older versions lack fields added later (diagrams, and
// in future the enriched decision shape). Normalize on read so every consumer
// sees the current Analysis shape without scattering `?? []` everywhere.

const DIAGRAM_TYPES: DiagramType[] = ['flowchart', 'sequenceDiagram'];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : [];

/**
 * Decisions were plain strings before F3. Accept both the old shape (string)
 * and the new object shape so stored analyses and weaker models keep working.
 * Drops entries with no `what` (nothing decided).
 */
export function normalizeDecisions(v: unknown): Decision[] {
  if (!Array.isArray(v)) return [];
  const out: Decision[] = [];
  for (const d of v) {
    if (typeof d === 'string') {
      const what = d.trim();
      if (what) out.push({ what, why: '', rejected: [], topic: '' });
      continue;
    }
    const what = str((d as Decision)?.what);
    if (!what) continue;
    out.push({
      what,
      why: str((d as Decision)?.why),
      rejected: strArr((d as Decision)?.rejected),
      topic: str((d as Decision)?.topic),
    });
  }
  return out;
}

/** Keep only well-formed diagrams; drop anything the UI could not render. */
export function normalizeDiagrams(v: unknown): Diagram[] {
  if (!Array.isArray(v)) return [];
  const out: Diagram[] = [];
  for (const d of v) {
    const title = str((d as Diagram)?.title);
    const type = (d as Diagram)?.type;
    const mermaid = str((d as Diagram)?.mermaid);
    if (!mermaid || !DIAGRAM_TYPES.includes(type)) continue;
    out.push({ title: title || 'Diagram', type, mermaid });
  }
  return out.slice(0, 3);
}

/** Bring a possibly-old stored Analysis up to the current shape. */
export function migrateAnalysis(a: Analysis): Analysis {
  return {
    ...a,
    decisions: normalizeDecisions(a.decisions),
    diagrams: normalizeDiagrams(a.diagrams),
  };
}
