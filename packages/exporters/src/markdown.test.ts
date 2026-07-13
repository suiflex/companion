import { describe, expect, it } from 'vitest';
import type { Analysis, Meeting } from '@meetcc/shared';
import { toMarkdown } from './markdown';

const meeting: Meeting = {
  id: 'zkz-fwkm-ibn',
  meta: { id: 'zkz-fwkm-ibn', startedAt: '2026-07-12T16:00:00Z', lastSeenAt: '2026-07-12T17:00:00Z' },
  entries: [
    { speaker: 'Manan', text: 'halo', time: '2026-07-12T16:00:10Z' },
    { speaker: 'Gunawan', text: 'siap', time: '2026-07-12T16:01:00Z' },
    { speaker: 'Manan', text: 'lanjut', time: '2026-07-12T16:02:00Z' },
  ],
};

const analysis: Analysis = {
  executiveSummary: 'Rapat membahas perbaikan PDF invoice.',
  timeline: [{ time: '23:00', topic: 'Pembukaan' }],
  keyDiscussions: ['Logo PDF masih geser'],
  decisions: [
    { what: 'Template PDF diperbaiki minggu ini', why: 'Logo geser', rejected: ['Tunda rilis'], topic: 'pdf' },
  ],
  actionItems: [{ task: 'Fix logo PDF', owner: 'Gunawan', due: 'Jumat' }],
  risks: ['Deadline mepet'],
  openQuestions: [],
  nextSteps: ['Review hasil fix'],
  diagrams: [{ title: 'Alur PDF', type: 'flowchart', mermaid: 'flowchart TB\nA-->B' }],
};

describe('toMarkdown', () => {
  const md = toMarkdown(meeting, analysis);

  it('contains all required sections', () => {
    for (const h of [
      '# Meeting Notes — zkz-fwkm-ibn',
      '## Meeting Information',
      '## Participants',
      '## Timeline',
      '## Executive Summary',
      '## Key Discussion',
      '## Decisions',
      '## Action Items',
      '## Risks',
      '## Next Steps',
    ]) {
      expect(md).toContain(h);
    }
  });

  it('renders action items as a table and dedupes participants', () => {
    expect(md).toContain('| Fix logo PDF | Gunawan | Jumat |');
    expect(md.match(/- Manan/g)).toHaveLength(1);
  });

  it('renders enriched decisions with reason, rejected and topic', () => {
    expect(md).toContain('- **Template PDF diperbaiki minggu ini** `pdf`');
    expect(md).toContain('- Alasan: Logo geser');
    expect(md).toContain('- Ditolak: Tunda rilis');
  });

  it('omits empty sections (open questions)', () => {
    expect(md).not.toContain('## Open Questions');
  });

  it('renders diagrams as fenced mermaid blocks', () => {
    expect(md).toContain('## Diagram');
    expect(md).toContain('### Alur PDF');
    expect(md).toContain('```mermaid\nflowchart TB\nA-->B\n```');
  });

  it('omits the diagram section when there are none', () => {
    expect(toMarkdown(meeting, { ...analysis, diagrams: [] })).not.toContain('## Diagram');
  });
});
