import { describe, expect, it } from 'vitest';
import type { Analysis, AnalysisRecord, Meeting } from '@meetcc/shared';
import { companionIdFor, obsidianPath, obsidianVault, toObsidian } from './obsidian';

const meeting: Meeting = {
  id: 'zkz-fwkm-ibn',
  meta: {
    id: 'zkz-fwkm-ibn',
    startedAt: '2026-07-12T16:00:00Z',
    lastSeenAt: '2026-07-12T17:00:00Z',
  },
  entries: [
    { speaker: 'Manan', text: 'halo', time: '2026-07-12T16:00:10Z' },
    { speaker: 'Gunawan', text: 'siap', time: '2026-07-12T16:01:00Z' },
  ],
};

const analysis: Analysis = {
  executiveSummary: 'Rapat membahas perbaikan PDF invoice.',
  timeline: [{ time: '23:00', topic: 'Pembukaan' }],
  keyDiscussions: ['Logo PDF masih geser'],
  decisions: [
    {
      what: 'Template PDF diperbaiki minggu ini',
      why: 'Logo geser',
      rejected: ['Tunda rilis'],
      topic: 'pdf',
    },
  ],
  actionItems: [{ task: 'Fix logo PDF', owner: 'Gunawan', due: 'Jumat' }],
  risks: ['Deadline mepet'],
  openQuestions: [],
  nextSteps: ['Review hasil fix'],
  diagrams: [],
};

describe('companionIdFor', () => {
  it('is deterministic for the same meeting (idempotent re-export)', () => {
    expect(companionIdFor(meeting)).toBe(companionIdFor(meeting));
  });

  it('is UUIDv7-shaped: 32 hex chars, version 7, RFC variant', () => {
    const id = companionIdFor(meeting);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id[12]).toBe('7');
    expect(parseInt(id[16], 16)).toBeGreaterThanOrEqual(8);
    expect(parseInt(id[16], 16)).toBeLessThanOrEqual(11);
  });

  it('encodes the meeting start as unix-ms in the first 48 bits', () => {
    const id = companionIdFor(meeting);
    const ms = parseInt(id.slice(0, 12), 16);
    expect(ms).toBe(Date.parse('2026-07-12T16:00:00Z'));
  });

  it('differs for two different meetings at the same time', () => {
    const other: Meeting = {
      ...meeting,
      id: 'other-meeting',
      entries: meeting.entries.map((e) => ({ ...e })),
    };
    expect(companionIdFor(other)).not.toBe(companionIdFor(meeting));
  });

  it('falls back to epoch 0 when the meeting has no usable time', () => {
    const undated: Meeting = { id: 'x', meta: null, entries: [] };
    expect(companionIdFor(undated).slice(0, 12)).toBe('000000000000');
  });
});

describe('obsidianPath', () => {
  it('lands in the §13.1 Meetings/ folder with a date prefix', () => {
    expect(obsidianPath(meeting)).toBe('Meetings/2026-07-12 zkz-fwkm-ibn.md');
  });

  it('uses undated when there is no start time', () => {
    expect(obsidianPath({ id: 'x', meta: null, entries: [] })).toBe(
      'Meetings/undated x.md',
    );
  });
});

describe('toObsidian', () => {
  const md = toObsidian(meeting, analysis);

  it('starts with minimal §13.1 frontmatter including companion_id', () => {
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('companion_id: ');
    expect(md).toContain('type: meeting');
    expect(md).toContain('  - companion');
    expect(md).toContain('created: ');
    expect(md).toContain('updated: ');
  });

  it('frontmatter companion_id matches companionIdFor', () => {
    expect(md).toContain(`companion_id: ${companionIdFor(meeting)}`);
  });

  it('wiki-links participants and action-item owners', () => {
    expect(md).toContain('- [[Manan]]');
    expect(md).toContain('- [[Gunawan]]');
    expect(md).toContain('— [[Gunawan]]');
  });

  it('tags decision topics as Obsidian tags', () => {
    expect(md).toContain('**Template PDF diperbaiki minggu ini** #pdf');
  });

  it('keeps required content sections', () => {
    for (const h of [
      '# zkz-fwkm-ibn',
      '## Meeting Information',
      '## Participants',
      '## Executive Summary',
      '## Decisions',
      '## Action Items',
      '## Next Steps',
    ]) {
      expect(md).toContain(h);
    }
  });

  it('sanitizes wiki-target specials so links stay resolvable', () => {
    const weird: Meeting = { ...meeting, entries: [{ speaker: 'A|B#c', text: 'x', time: '2026-07-12T16:00:10Z' }] };
    expect(toObsidian(weird, analysis)).toContain('- [[A B c]]');
  });

  it('normalizes topics into valid tags and falls back to #topic otherwise', () => {
    const spaced = {
      ...analysis,
      decisions: [{ ...analysis.decisions[0], topic: 'API gateway' }],
    };
    expect(toObsidian(meeting, spaced)).toContain('#API-gateway');
    const invalid = {
      ...analysis,
      decisions: [{ ...analysis.decisions[0], topic: '2fast now' }],
    };
    expect(toObsidian(meeting, invalid)).toContain(
      '**Template PDF diperbaiki minggu ini** #topic',
    );
  });
});

describe('obsidianVault', () => {
  const done: AnalysisRecord = {
    status: 'done',
    provider: 'openai',
    generatedAt: '2026-07-12T17:00:00Z',
    analysis,
  };

  it('exports one Meetings/<file> per analyzed meeting plus a README', () => {
    const other: Meeting = { ...meeting, id: 'abc-def-ghi' };
    const files = obsidianVault([meeting, other], {
      [meeting.id]: done,
      [other.id]: done,
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain(obsidianPath(meeting));
    expect(paths).toContain(obsidianPath(other));
    expect(paths.filter((p) => p === 'README.md')).toHaveLength(1);
    // wall-clock timestamps (frontmatter created/updated, footer) differ per
    // call by a few ms — compare everything but them
    const stripStamps = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, 'TS');
    expect(stripStamps(files.find((f) => f.path === obsidianPath(meeting))!.content)).toBe(
      stripStamps(toObsidian(meeting, analysis)),
    );
  });

  it('skips meetings without a done analysis (nothing worth reading yet)', () => {
    const processing = { ...done, status: 'processing', startedAt: 'x' } as unknown as AnalysisRecord;
    const files = obsidianVault([meeting], { [meeting.id]: processing });
    expect(files).toEqual([]);
  });

  it('returns an empty vault for an empty library', () => {
    expect(obsidianVault([], {})).toEqual([]);
  });

  it('keeps Meetings/ paths inside their folder (§13.1 layout)', () => {
    const files = obsidianVault([meeting], { [meeting.id]: done });
    for (const { path } of files) {
      expect(path === 'README.md' || path.startsWith('Meetings/')).toBe(true);
    }
  });
});
