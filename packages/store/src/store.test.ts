import { beforeEach, describe, expect, it } from 'vitest';
import type { Analysis, AnalysisRecord, Entry } from '@meetcc/shared';
import { CompanionStore } from './store';
import { openDatabase } from './wasm';
import { migrateSchema, schemaVersion, SCHEMA_VERSION } from './schema';
import { ftsQuery } from './sql';
import { ingestAll, migrationStatus } from './ingest';

const T0 = Date.parse('2026-08-24T07:00:00Z');
const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();
const line = (speaker: string, text: string, sec: number): Entry => ({ speaker, text, time: at(sec) });

const ENTRIES: Entry[] = [
  line('Akbar', 'Ada beberapa aplikasi yang terdampak insiden Freeport', 0),
  line('Widi', 'Solusinya dishare atau dibuat terpisah per aplikasi?', 30),
  line('Akbar', 'Belum diputuskan, kita pakai shared service dulu', 60),
];

const analysis = (over: Partial<Analysis> = {}): Analysis => ({
  executiveSummary: 'Rapat insiden Freeport.',
  timeline: [],
  keyDiscussions: [],
  decisions: [{ what: 'Pakai shared service', why: 'Lebih cepat', rejected: ['service terpisah'], topic: 'arsitektur' }],
  actionItems: [{ task: 'Implement fix ticket 2', owner: 'Akbar', due: '2026-08-28' }],
  risks: ['Data Freeport bisa tidak konsisten'],
  openQuestions: ['Apakah solusi dishare atau terpisah?'],
  nextSteps: [],
  diagrams: [],
  ...over,
});

async function freshStore(): Promise<CompanionStore> {
  const { driver } = await openDatabase();
  return CompanionStore.open(driver);
}

describe('schema', () => {
  it('migrates a fresh database and is idempotent', async () => {
    const { driver } = await openDatabase();
    expect(migrateSchema(driver)).toEqual({ from: 0, to: SCHEMA_VERSION });
    expect(migrateSchema(driver)).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
    expect(schemaVersion(driver)).toBe(SCHEMA_VERSION);
    driver.close();
  });
});

describe('ftsQuery', () => {
  it('quotes every term so operators in user input cannot change the query', () => {
    expect(ftsQuery('freeport shared')).toBe('"freeport"* OR "shared"*');
    expect(ftsQuery('a" OR x MATCH')).toBe('"or"* OR "match"*');
    expect(ftsQuery('  ')).toBe('');
  });
});

describe('sessions', () => {
  let store: CompanionStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('derives room, platform and participants; keeps recurring sessions apart', () => {
    store.upsertSession({ id: 'xdr-fdbe-zqz#1000' });
    store.upsertSession({ id: 'xdr-fdbe-zqz#2000' });
    store.replaceEntries('xdr-fdbe-zqz#1000', 'raw', ENTRIES);

    const list = store.listSessions();
    expect(list).toHaveLength(2);
    const first = store.getSession('xdr-fdbe-zqz#1000')!;
    expect(first.roomId).toBe('xdr-fdbe-zqz');
    expect(first.platform).toBe('google-meet');
    expect(first.entryCount).toBe(3);
    expect(first.participants.sort()).toEqual(['Akbar', 'Widi']);
    expect(first.startedAt).toBe(at(0));
    expect(first.durationMs).toBe(60_000);
  });

  it('detects Teams from the room id', () => {
    store.upsertSession({ id: 'tms-abc123#1000' });
    expect(store.getSession('tms-abc123#1000')!.platform).toBe('teams');
  });

  it('never overwrites a title with an empty one', () => {
    store.upsertSession({ id: 's#1', title: 'Incident Freeport' });
    store.upsertSession({ id: 's#1' });
    expect(store.getSession('s#1')!.title).toBe('Incident Freeport');
  });

  it('replaceEntries is idempotent and keeps the index in step', () => {
    store.upsertSession({ id: 's#1' });
    store.replaceEntries('s#1', 'raw', ENTRIES);
    store.replaceEntries('s#1', 'raw', ENTRIES);
    expect(store.countEntries('s#1')).toBe(3);
    expect(store.search('aplikasi').length).toBeGreaterThan(0);
    expect(store.getEntries('s#1')[0].id).toBe('E1');
  });

  it('keeps the cleaned transcript beside the raw one', () => {
    store.upsertSession({ id: 's#1' });
    store.replaceEntries('s#1', 'raw', ENTRIES);
    store.replaceEntries('s#1', 'clean', [line('Akbar', 'Aplikasi terdampak insiden Freeport.', 0)]);
    expect(store.countEntries('s#1', 'raw')).toBe(3);
    expect(store.countEntries('s#1', 'clean')).toBe(1);
  });

  it('deletes a session and everything hanging off it', () => {
    store.upsertSession({ id: 's#1' });
    store.replaceEntries('s#1', 'raw', ENTRIES);
    store.indexAnalysis('s#1', analysis());
    store.deleteSession('s#1');
    expect(store.getSession('s#1')).toBeNull();
    expect(store.countEntries('s#1')).toBe(0);
    expect(store.decisions()).toEqual([]);
    expect(store.search('aplikasi')).toEqual([]);
  });
});

describe('structured memory', () => {
  let store: CompanionStore;
  beforeEach(async () => {
    store = await freshStore();
    store.upsertSession({ id: 's#1' });
    store.replaceEntries('s#1', 'raw', ENTRIES);
  });

  it('extracts decisions, actions, questions and risks with evidence', () => {
    store.indexAnalysis('s#1', analysis(), (text) => (text.includes('shared') ? ['E3'] : []));

    const [d] = store.decisions();
    expect(d.decision).toBe('Pakai shared service');
    expect(d.rejected).toEqual(['service terpisah']);
    expect(store.evidenceFor('decisions', d.id).map((e) => e.id)).toEqual(['E3']);

    expect(store.actions({ status: 'open' })[0].owner).toBe('Akbar');
    expect(store.questions({ status: 'open' })).toHaveLength(1);
  });

  it('re-indexing replaces rows instead of duplicating them', () => {
    store.indexAnalysis('s#1', analysis());
    store.indexAnalysis('s#1', analysis());
    expect(store.decisions()).toHaveLength(1);
    expect(store.search('shared service').filter((h) => h.kind === 'decision')).toHaveLength(1);
  });

  it('keeps a question resolved across a re-analysis', () => {
    store.indexAnalysis('s#1', analysis());
    const q = store.questions()[0];
    store.resolveQuestion(q.id, 's#2');
    store.indexAnalysis('s#1', analysis());
    expect(store.questions()[0].status).toBe('resolved');
    expect(store.questions()[0].resolvedIn).toBe('s#2');
  });

  it('tracks the action item lifecycle', () => {
    store.indexAnalysis('s#1', analysis());
    const a = store.actions()[0];
    expect(a.status).toBe('open');
    store.setActionStatus(a.id, 'done');
    expect(store.actions({ status: 'done' })[0].doneAt).toBeTruthy();
    expect(store.actions({ status: 'open' })).toEqual([]);
    store.setActionExternalRef(a.id, 'JIRA-12');
    expect(store.actions()[0].externalRef).toBe('JIRA-12');
  });

  // §18 SUPERSEDES: the newest decision on a topic is the one that stands
  it('links an older decision to the one that replaced it', () => {
    store.upsertSession({ id: 's#2', startedAt: at(100_000) });
    store.indexAnalysis('s#1', analysis());
    store.indexAnalysis(
      's#2',
      analysis({ decisions: [{ what: 'Pakai service terpisah', why: 'shared berisiko', rejected: [], topic: 'arsitektur' }] }),
    );

    const byId = new Map(store.decisions().map((d) => [d.id, d]));
    const older = [...byId.values()].find((d) => d.sessionId === 's#1')!;
    const newer = [...byId.values()].find((d) => d.sessionId === 's#2')!;
    expect(older.supersededBy).toBe(newer.id);
    expect(newer.supersededBy).toBeNull();
  });

  it('drops a supersession link when the replacing decision is re-analysed away', () => {
    store.upsertSession({ id: 's#2', startedAt: at(100_000) });
    store.indexAnalysis('s#1', analysis());
    store.indexAnalysis('s#2', analysis({ decisions: [{ what: 'Ganti arah', why: '', rejected: [], topic: 'arsitektur' }] }));
    store.indexAnalysis('s#2', analysis({ decisions: [] })); // rapat kedua ternyata tidak memutuskan apa pun
    store.relinkSupersessions(['arsitektur']);

    expect(store.decisions()[0].supersededBy).toBeNull();
  });

  it('filters decisions by topic and date range', () => {
    store.upsertSession({ id: 's#2', startedAt: at(100_000) });
    store.indexAnalysis('s#1', analysis());
    store.indexAnalysis('s#2', analysis({ decisions: [{ what: 'Tunda rilis', why: '', rejected: [], topic: 'jadwal' }] }));
    expect(store.decisions({ topic: 'jadwal' })).toHaveLength(1);
    expect(store.decisions({ since: at(50_000) })).toHaveLength(1);
  });
});

describe('search across every index', () => {
  let store: CompanionStore;
  beforeEach(async () => {
    store = await freshStore();
    store.upsertSession({ id: 's#1', title: 'Incident Freeport' });
    store.replaceEntries('s#1', 'raw', ENTRIES);
    store.indexAnalysis('s#1', analysis());
  });

  it('finds transcript lines and carries the meeting title', () => {
    const hits = store.search('freeport');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sessionTitle).toBe('Incident Freeport');
  });

  // §27: the open question phrases the topic better than any caption line
  it('matches structured memory, not only the transcript', () => {
    const kinds = new Set(store.search('solusi terpisah').map((h) => h.kind));
    expect(kinds.has('question')).toBe(true);
  });

  it('can be narrowed to one meeting', () => {
    store.upsertSession({ id: 's#2' });
    store.replaceEntries('s#2', 'raw', [line('Rina', 'Freeport lagi dibahas di sini', 0)]);
    expect(store.search('freeport').map((h) => h.sessionId)).toContain('s#2');
    expect(store.search('freeport', { sessionId: 's#1' }).every((h) => h.sessionId === 's#1')).toBe(true);
  });

  it('returns nothing for a blank query instead of everything', () => {
    expect(store.search('  ')).toEqual([]);
  });

  it('indexes generated documents too', () => {
    store.saveDoc('s#1', 'prd', { content: 'PRD tentang integrasi pembayaran', generatedAt: at(0), provider: 'x' });
    expect(store.search('pembayaran').some((h) => h.kind === 'document')).toBe(true);
    expect(store.docs('s#1').prd?.content).toContain('integrasi');
  });
});

describe('chat, projects, highlights, templates', () => {
  let store: CompanionStore;
  beforeEach(async () => {
    store = await freshStore();
    store.upsertSession({ id: 's#1' });
  });

  it('round-trips chat including the structured ask result', () => {
    store.appendChat('s#1', { role: 'user', content: 'kapan?', time: at(0) });
    store.appendChat('s#1', {
      role: 'assistant',
      content: 'Jumat',
      time: at(1),
      result: {
        answer: 'Jumat',
        answerability: 'explicit',
        intent: 'recall',
        confidence: 0.9,
        evidence: [],
        missing: [],
        followUps: [],
      },
    });
    const chat = store.chat('s#1');
    expect(chat).toHaveLength(2);
    expect(chat[1].result?.answerability).toBe('explicit');
    store.clearChat('s#1');
    expect(store.chat('s#1')).toEqual([]);
  });

  it('groups meetings into projects and releases them on delete', () => {
    store.upsertProject('p1', 'Freeport Integration');
    store.setSessionField('s#1', 'project_id', 'p1');
    expect(store.listSessions({ projectId: 'p1' })).toHaveLength(1);
    store.deleteProject('p1');
    expect(store.projects()).toEqual([]);
    expect(store.getSession('s#1')!.projectId).toBeNull();
  });

  it('stores highlights once per line and kind', () => {
    store.addHighlight('s#1', 3, 'decision', 'pakai shared service');
    store.addHighlight('s#1', 3, 'decision', 'pakai shared service');
    expect(store.highlights('s#1')).toHaveLength(1);
  });

  it('stores custom templates by kind', () => {
    store.saveTemplate({ id: 't1', name: 'Retro', kind: 'analysis', instructions: 'fokus retro', sections: ['a'] });
    expect(store.templates('analysis')[0].sections).toEqual(['a']);
    store.deleteTemplate('t1');
    expect(store.templates()).toEqual([]);
  });
});

describe('pruning deleted meetings', () => {
  // a meeting the user deleted must stop appearing in search, Global Ask,
  // continuity and MCP snapshots — not just in chrome.storage
  it('drops a captured meeting once it is gone from storage', async () => {
    const store = await freshStore();
    const dump: Record<string, unknown> = {
      'transcript:s#1': ENTRIES,
      'transcript:s#2': [line('Rina', 'rapat kedua soal Freeport', 0)],
    };
    ingestAll(store, dump);
    expect(store.listSessions()).toHaveLength(2);

    delete dump['transcript:s#2'];
    const report = ingestAll(store, dump);

    expect(report.pruned).toEqual(['s#2']);
    expect(store.getSession('s#2')).toBeNull();
    expect(store.search('freeport').every((h) => h.sessionId === 's#1')).toBe(true);
  });

  it('never prunes a meeting that arrived by sync or share', async () => {
    const store = await freshStore();
    store.upsertSession({ id: 'remote#1', title: 'Dari rekan', source: 'remote' });
    store.replaceEntries('remote#1', 'raw', ENTRIES);

    const report = ingestAll(store, { 'transcript:s#1': ENTRIES });

    expect(report.pruned).toEqual([]);
    expect(store.getSession('remote#1')).not.toBeNull();
    expect(store.getSession('remote#1')!.source).toBe('remote');
  });
});

describe('ingest from chrome.storage.local', () => {
  it('rebuilds the index, verifies counts, and records the migration', async () => {
    const store = await freshStore();
    const record: AnalysisRecord = {
      status: 'done',
      analysis: analysis(),
      generatedAt: at(0),
      provider: 'openai',
    };
    const dump: Record<string, unknown> = {
      'transcript:xdr-fdbe-zqz#1000': ENTRIES,
      'meta:xdr-fdbe-zqz#1000': { id: 'xdr-fdbe-zqz#1000', startedAt: at(0), lastSeenAt: at(60) },
      'title:xdr-fdbe-zqz#1000': 'Incident Freeport',
      'analysis:xdr-fdbe-zqz#1000': record,
      'resolved:xdr-fdbe-zqz#1000': ['Apakah solusi dishare atau terpisah?'],
      'chat:xdr-fdbe-zqz#1000': [{ role: 'user', content: 'halo', time: at(1) }],
      'docs:xdr-fdbe-zqz#1000': { prd: { content: 'isi prd', generatedAt: at(2), provider: 'openai' } },
      settings: { provider: 'openai' },
    };

    const report = ingestAll(store, dump);
    expect(report).toMatchObject({ sessions: 1, entries: 3, analyses: 1, chats: 1, documents: 1 });
    expect(report.mismatched).toEqual([]);

    const session = store.getSession('xdr-fdbe-zqz#1000')!;
    expect(session.title).toBe('Incident Freeport');
    expect(store.decisions()).toHaveLength(1);
    expect(store.questions()[0].status).toBe('resolved');
    expect(store.chat('xdr-fdbe-zqz#1000')).toHaveLength(1);
    expect(migrationStatus(store)?.entries).toBe(3);
  });

  // the sweep re-ingests every minute: unchanged meetings must not be rewritten
  it('skips a meeting whose index already matches storage', async () => {
    const store = await freshStore();
    const dump: Record<string, unknown> = { 'transcript:s#1': ENTRIES };
    ingestAll(store, dump);
    const firstIds = store.driver.all<{ id: number }>('SELECT id FROM transcript_entries ORDER BY seq');
    ingestAll(store, dump);
    const secondIds = store.driver.all<{ id: number }>('SELECT id FROM transcript_entries ORDER BY seq');
    expect(secondIds).toEqual(firstIds); // untouched rows keep their rowids
  });

  it('re-indexes as soon as a live meeting gains or extends a line', async () => {
    const store = await freshStore();
    const dump: Record<string, unknown> = { 'transcript:s#1': ENTRIES };
    ingestAll(store, dump);
    const grown = [...ENTRIES.slice(0, 2), { ...ENTRIES[2], text: ENTRIES[2].text + ' dan sudah final' }];
    dump['transcript:s#1'] = grown;
    ingestAll(store, dump);
    expect(store.getEntries('s#1')[2].text).toContain('sudah final');
  });

  it('re-running after new captures updates instead of duplicating', async () => {
    const store = await freshStore();
    const dump: Record<string, unknown> = { 'transcript:s#1': ENTRIES };
    ingestAll(store, dump);
    dump['transcript:s#1'] = [...ENTRIES, line('Rina', 'satu hal lagi', 90)];
    const report = ingestAll(store, dump);
    expect(report.entries).toBe(4);
    expect(store.countEntries('s#1')).toBe(4);
    expect(store.listSessions()).toHaveLength(1);
  });
});

describe('speaker rename', () => {
  async function imported(): Promise<CompanionStore> {
    const store = await freshStore();
    store.upsertSession({ id: 's#1', title: 'Rekaman rapat', startedAt: at(0) });
    store.replaceEntries('s#1', 'raw', [
      line('Speaker 1', 'Ada beberapa aplikasi yang terdampak insiden Freeport', 0),
      line('Speaker 2', 'Solusinya dishare atau dibuat terpisah?', 30),
      line('Speaker 1', 'Kita pakai shared service dulu', 60),
    ]);
    return store;
  }

  it('renames every line of one speaker and leaves the others alone', async () => {
    const store = await imported();
    expect(store.renameSpeaker('s#1', 'Speaker 1', 'Akbar')).toBe(2);
    expect(store.getEntries('s#1').map((e) => e.speaker)).toEqual(['Akbar', 'Speaker 2', 'Akbar']);
  });

  it('rebuilds the participant list, including when two labels are merged', async () => {
    const store = await imported();
    store.renameSpeaker('s#1', 'Speaker 1', 'Akbar');
    expect(store.getSession('s#1')?.participants.sort()).toEqual(['Akbar', 'Speaker 2']);

    store.renameSpeaker('s#1', 'Speaker 2', 'Akbar');
    expect(store.getSession('s#1')?.participants).toEqual(['Akbar']);
  });

  it('keeps full-text search in step with the new name', async () => {
    const store = await imported();
    store.renameSpeaker('s#1', 'Speaker 1', 'Akbar');
    const hits = store.search(ftsQuery('Akbar'));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.speaker !== 'Speaker 1')).toBe(true);
  });

  it('does nothing for an unknown, empty or unchanged name', async () => {
    const store = await imported();
    expect(store.renameSpeaker('s#1', 'Tidak Ada', 'Akbar')).toBe(0);
    expect(store.renameSpeaker('s#1', 'Speaker 1', '   ')).toBe(0);
    expect(store.renameSpeaker('s#1', 'Speaker 1', 'Speaker 1')).toBe(0);
    expect(store.getEntries('s#1').map((e) => e.speaker)).toEqual(['Speaker 1', 'Speaker 2', 'Speaker 1']);
  });
});
