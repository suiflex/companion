import { describe, expect, it } from 'vitest';
import type { Analysis, AnalysisRecord, Entry } from '@meetcc/shared';
import { callTool, loadSnapshot, TOOL_DEFINITIONS } from './tools';

const T0 = Date.parse('2026-08-24T07:00:00Z');
const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();
const line = (speaker: string, text: string, sec: number): Entry => ({ speaker, text, time: at(sec) });

const analysis: Analysis = {
  executiveSummary: 'Rapat insiden Freeport.',
  timeline: [],
  keyDiscussions: [],
  decisions: [{ what: 'Pakai shared service', why: 'lebih cepat', rejected: [], topic: 'arsitektur' }],
  actionItems: [{ task: 'Implement fix ticket 2', owner: 'Akbar', due: '2026-08-28' }],
  risks: [],
  openQuestions: ['Apakah solusi dishare atau terpisah?'],
  nextSteps: [],
  diagrams: [],
};

const record: AnalysisRecord = { status: 'done', analysis, generatedAt: at(100), provider: 'openai' };

const SNAPSHOT: Record<string, unknown> = {
  'transcript:room#1000': [
    line('Rina', 'Kita bahas insiden Freeport hari ini', 0),
    line('Akbar', 'Ada beberapa aplikasi yang terdampak', 30),
    line('Widi', 'Solusinya dishare atau dibuat terpisah?', 60),
    line('Akbar', 'Kita putuskan pakai shared service dulu', 90),
  ],
  'meta:room#1000': { id: 'room#1000', startedAt: at(0), lastSeenAt: at(90) },
  'title:room#1000': 'Incident Freeport',
  'analysis:room#1000': record,
};

const parse = (result: { content: { text: string }[] }): any => JSON.parse(result.content[0].text);

const store = await loadSnapshot({ read: async () => SNAPSHOT });

describe('MCP tool surface', () => {
  it('exposes exactly the documented tools', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'list_meetings',
      'search_meetings',
      'get_meeting',
      'get_transcript',
      'ask_meeting',
      'ask_meetings',
      'get_decisions',
      'get_action_items',
      'get_open_questions',
    ]);
  });

  it('lists meetings from the exported snapshot', () => {
    const rows = parse(callTool(store, 'list_meetings', {}));
    expect(rows[0].title).toBe('Incident Freeport');
    expect(rows[0].participants).toContain('Akbar');
  });

  it('searches across transcript and structured memory', () => {
    const hits = parse(callTool(store, 'search_meetings', { query: 'shared service' }));
    expect(hits.length).toBeGreaterThan(0);
    expect(new Set(hits.map((h: { kind: string }) => h.kind)).size).toBeGreaterThan(0);
  });

  it('returns one meeting with its structured memory', () => {
    const m = parse(callTool(store, 'get_meeting', { sessionId: 'room#1000' }));
    expect(m.summary).toContain('Freeport');
    expect(m.decisions).toHaveLength(1);
    expect(m.actionItems[0].owner).toBe('Akbar');
  });

  it('reports a missing meeting as an error instead of empty data', () => {
    const res = callTool(store, 'get_meeting', { sessionId: 'nope' });
    expect(res.isError).toBe(true);
  });

  it('returns the transcript with citable ids', () => {
    const entries = parse(callTool(store, 'get_transcript', { sessionId: 'room#1000' }));
    expect(entries[0].id).toBe('E1');
    expect(entries).toHaveLength(4);
  });

  it('ask_meeting returns evidence windows, not a fabricated answer', () => {
    const res = parse(callTool(store, 'ask_meeting', { sessionId: 'room#1000', question: 'solusi aplikasi terdampak?' }));
    expect(res.evidence[0].sessionId).toBe('room#1000');
    const texts = res.evidence[0].lines.map((l: { text: string }) => l.text).join(' ');
    expect(texts).toContain('terdampak');
    expect(res.answer).toBeUndefined();
  });

  it('ask_meetings says so when nothing matches', () => {
    const res = parse(callTool(store, 'ask_meetings', { question: 'kubernetes node' }));
    expect(res.evidence).toEqual([]);
    expect(res.note).toBeTruthy();
  });

  it('filters action items by status', () => {
    expect(parse(callTool(store, 'get_action_items', { status: 'done' }))).toEqual([]);
    expect(parse(callTool(store, 'get_action_items', { status: 'open' }))).toHaveLength(1);
  });

  it('rejects an unknown tool', () => {
    expect(callTool(store, 'drop_everything', {}).isError).toBe(true);
  });
});
