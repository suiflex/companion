import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Analysis, Entry } from '@meetcc/shared';
import { CompanionStore, openDatabase } from '@meetcc/store';
import type { AIClient } from '@meetcc/ai';
import {
  askMeetings,
  collectGlobalEvidence,
  fallbackGlobalPlan,
  parseGlobalPlan,
  parseGlobalResult,
} from './globalask';
import { buildChronology, carryOverFor, isOverdue } from './continuity';
import { detectHighlights } from './highlights';
import {
  detectFormat,
  labelSpeakers,
  normalizeImported,
  parseTranscript,
  transcribeAudio,
} from './import';
import { matchEvent, parseIcs } from './calendar';
import {
  buildRequest,
  createIssue,
  draftIssue,
  fetchIssueStatus,
  isoDue,
  validateTracker,
} from './issues';
import {
  applyBundle,
  buildBundle,
  exportShare,
  importShare,
  isAllowedSyncEndpoint,
  runSync,
  validateSync,
} from './sync';

const T0 = Date.parse('2026-08-24T07:00:00Z');
const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();
const line = (speaker: string, text: string, sec: number): Entry => ({ speaker, text, time: at(sec) });

const analysis = (over: Partial<Analysis> = {}): Analysis => ({
  executiveSummary: 'Rapat Freeport.',
  timeline: [],
  keyDiscussions: [],
  decisions: [{ what: 'Pakai shared service', why: 'lebih cepat', rejected: [], topic: 'arsitektur' }],
  actionItems: [{ task: 'Implement fix ticket 2', owner: 'Akbar', due: '2026-08-28' }],
  risks: [],
  openQuestions: ['Apakah solusi dishare atau terpisah?'],
  nextSteps: [],
  diagrams: [],
  ...over,
});

async function seeded(): Promise<CompanionStore> {
  const { driver } = await openDatabase();
  const store = CompanionStore.open(driver);
  store.upsertSession({ id: 'room#1000', title: 'Incident Freeport', startedAt: at(0) });
  store.replaceEntries('room#1000', 'raw', [
    line('Rina', 'Kita mulai bahas insiden Freeport hari ini', 0),
    line('Akbar', 'Ada beberapa aplikasi yang terdampak', 30),
    line('Widi', 'Solusinya dishare atau dibuat terpisah per aplikasi?', 60),
    line('Akbar', 'Kita putuskan pakai shared service dulu', 90),
  ]);
  store.setAnalysis('room#1000', { status: 'done', analysis: analysis(), generatedAt: at(100), provider: 'openai' });
  store.indexAnalysis('room#1000', analysis(), (t) => (t.includes('shared') ? ['E4'] : []));
  return store;
}

const clientOf = (fn: (req: { user: string }) => Promise<string>): AIClient => ({
  provider: 'custom',
  complete: fn as AIClient['complete'],
});

describe('global ask planner', () => {
  it('parses a structured plan', () => {
    const plan = parseGlobalPlan(
      JSON.stringify({ intent: 'recall', kind: 'decision', entity: 'Freeport', keywords: ['freeport'], months: 3 }),
      'apa keputusan Freeport 3 bulan terakhir?',
    );
    expect(plan).toEqual({
      intent: 'recall',
      kind: 'decision',
      entity: 'Freeport',
      keywords: ['freeport'],
      months: 3,
    });
  });

  it('falls back when the model answers garbage', () => {
    const plan = parseGlobalPlan('nope', 'apa keputusan soal Freeport?');
    expect(plan.kind).toBe('decision');
    expect(plan.keywords).toContain('freeport');
  });

  it('clamps an absurd time range instead of trusting it', () => {
    expect(parseGlobalPlan(JSON.stringify({ months: 9999 }), 'x').months).toBe(60);
    expect(fallbackGlobalPlan('apa yang terjadi tahun ini?').months).toBe(12);
  });
});

describe('global evidence collection', () => {
  it('pulls the conversation window around cross-meeting hits', async () => {
    const store = await seeded();
    store.upsertSession({ id: 'other#2000', title: 'Sprint planning', startedAt: at(100_000) });
    store.replaceEntries('other#2000', 'raw', [line('Rina', 'bahas sprint, tidak ada Freeport', 0)]);

    const evidence = collectGlobalEvidence(store, fallbackGlobalPlan('keputusan Freeport?'), 'keputusan Freeport?');
    expect(evidence.map((e) => e.sessionId)).toContain('room#1000');
    const texts = evidence.flatMap((e) => e.entries.map((x) => x.text)).join(' ');
    expect(texts).toContain('shared service');
  });

  it('returns nothing when no meeting mentions the topic', async () => {
    const store = await seeded();
    expect(collectGlobalEvidence(store, fallbackGlobalPlan('kubernetes?'), 'kubernetes?')).toEqual([]);
  });
});

describe('askMeetings', () => {
  it('answers from several meetings and verifies cited ids', async () => {
    const store = await seeded();
    const prompts: string[] = [];
    const client = clientOf(async (req) => {
      prompts.push(req.user);
      return prompts.length === 1
        ? JSON.stringify({ intent: 'recall', kind: 'decision', entity: 'Freeport', keywords: ['freeport'], months: 0 })
        : JSON.stringify({
            answer: 'Tim memutuskan memakai shared service.',
            answerability: 'explicit',
            confidence: 0.9,
            evidence: ['E4', 'E999'],
            missing: [],
            followUps: [],
          });
    });

    const result = await askMeetings(client, store, 'apa keputusan soal Freeport?');
    expect(result.answer).toContain('shared service');
    expect(result.evidence.flatMap((e) => e.entryIds)).toEqual(['E4']);
    expect(result.sessions[0].title).toBe('Incident Freeport');
    expect(prompts[1]).toContain('Incident Freeport');
  });

  it('says not_found without calling the model when nothing matches', async () => {
    const store = await seeded();
    const complete = vi.fn(async () => JSON.stringify({ kind: 'any', keywords: ['kubernetes'], months: 0 }));
    const result = await askMeetings(clientOf(complete), store, 'berapa node kubernetes?');
    expect(result.answerability).toBe('not_found');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('downgrades an unsupported "explicit" claim', () => {
    const plan = fallbackGlobalPlan('x');
    const r = parseGlobalResult(
      JSON.stringify({ answer: 'ya', answerability: 'explicit', evidence: ['E999'] }),
      [{ sessionId: 's', sessionTitle: 's', startedAt: null, entries: [line('A', 'halo', 0)] }],
      plan,
    );
    expect(r.answerability).toBe('inferred');
    expect(r.confidence).toBeLessThanOrEqual(0.4);
  });
});

describe('continuity', () => {
  let store: CompanionStore;
  beforeEach(async () => {
    store = await seeded();
  });

  it('builds a chronology and spots a revised decision', () => {
    store.upsertSession({ id: 'room#5000', title: 'Follow up', startedAt: at(200_000) });
    store.replaceEntries('room#5000', 'raw', [line('Akbar', 'kita ubah ke service terpisah', 0)]);
    store.indexAnalysis(
      'room#5000',
      analysis({ decisions: [{ what: 'Pakai service terpisah', why: 'shared terlalu berisiko', rejected: [], topic: 'arsitektur' }] }),
    );

    const c = buildChronology(store);
    expect(c.events[0].at <= c.events[c.events.length - 1].at).toBe(true);
    expect(c.revisions).toHaveLength(1);
    expect(c.revisions[0].decisions.map((d) => d.decision)).toEqual([
      'Pakai shared service',
      'Pakai service terpisah',
    ]);
  });

  it('records when a question was resolved in a later meeting', () => {
    store.upsertSession({ id: 'room#5000', title: 'Follow up', startedAt: at(200_000) });
    store.resolveQuestion(store.questions()[0].id, 'room#5000');
    const c = buildChronology(store);
    expect(c.events.some((e) => e.kind === 'question-resolved' && e.sessionId === 'room#5000')).toBe(true);
    expect(c.openQuestions).toEqual([]);
  });

  it('flags overdue actions only on real dates', () => {
    expect(isOverdue('2026-08-28', Date.parse('2026-09-01'))).toBe(true);
    expect(isOverdue('minggu depan', Date.parse('2026-09-01'))).toBe(false);
    const c = buildChronology(store, { now: Date.parse('2026-09-01T00:00:00Z') });
    expect(c.overdueActions).toHaveLength(1);
  });

  it('carries unfinished business into the next meeting in the same room', () => {
    store.upsertSession({ id: 'room#9000', title: 'Next week', startedAt: at(600_000) });
    const carry = carryOverFor(store, 'room#9000');
    expect(carry.openActions).toHaveLength(1);
    expect(carry.openQuestions).toHaveLength(1);
    expect(carry.fromSessions).toEqual(['room#1000']);
  });

  it('does not carry over from a later meeting or another room', () => {
    store.upsertSession({ id: 'zzz#500', title: 'Unrelated', startedAt: at(-1000) });
    expect(carryOverFor(store, 'zzz#500').openActions).toEqual([]);
  });
});

describe('live highlights', () => {
  it('flags decisions, actions, deadlines and risks', () => {
    const hits = detectHighlights([
      line('A', 'ya', 0),
      line('A', 'Oke kita putuskan pakai shared service untuk semua aplikasi', 10),
      line('B', 'Tolong siapkan datanya sebelum rapat berikutnya ya', 20),
      line('C', 'Deadline-nya paling lambat Jumat minggu depan', 30),
      line('D', 'Risikonya integrasi Freeport bisa terlambat lagi', 40),
      line('E', 'ngobrol santai soal makan siang di kantin', 50),
    ]);
    expect(hits.map((h) => h.kind)).toEqual(['decision', 'action', 'deadline', 'risk']);
    expect(hits[0].seq).toBe(1);
  });

  it('only scans new lines so a live meeting does not rescan itself', () => {
    const entries = [line('A', 'Oke kita putuskan pakai shared service sekarang', 0), line('B', 'Tolong kirim datanya nanti sore ya', 10)];
    expect(detectHighlights(entries, 1)).toHaveLength(1);
  });
});

describe('transcript import', () => {
  it('detects and parses WebVTT with speaker tags', () => {
    const vtt = `WEBVTT

00:00:05.000 --> 00:00:08.000
<v Akbar>Ada beberapa aplikasi yang terdampak</v>

00:00:09.000 --> 00:00:12.000
<v Widi>Solusinya dishare atau terpisah?</v>
`;
    expect(detectFormat(vtt)).toBe('vtt');
    const entries = parseTranscript(vtt, { startedAt: at(0) });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ speaker: 'Akbar', text: 'Ada beberapa aplikasi yang terdampak' });
    expect(entries[0].time).toBe(at(5));
  });

  it('parses SRT', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Akbar: halo semuanya

2
00:00:05,000 --> 00:00:07,000
Widi: halo juga
`;
    expect(detectFormat(srt)).toBe('srt');
    const entries = parseTranscript(srt, { startedAt: at(0) });
    expect(entries.map((e) => e.speaker)).toEqual(['Akbar', 'Widi']);
  });

  it('parses a Zoom transcript', () => {
    const zoom = `00:00:10 Akbar: aplikasi terdampak\n00:00:20 Widi: solusinya?\n`;
    expect(detectFormat(zoom)).toBe('zoom');
    expect(parseTranscript(zoom, { startedAt: at(0) })[1].time).toBe(at(20));
  });

  it('merges consecutive lines from the same speaker', () => {
    const merged = normalizeImported([
      line('Akbar', 'aplikasi terdampak', 0),
      line('Akbar', 'dan belum diputuskan', 5),
      line('Widi', 'oke', 30),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toBe('aplikasi terdampak dan belum diputuskan');
  });

  it('refuses to transcribe audio without a configured endpoint', async () => {
    await expect(
      transcribeAudio(new Blob(['x']), 'a.mp3', { endpoint: '', apiKey: '', model: '' }),
    ).rejects.toThrow(/Endpoint/);
  });

  it('turns provider segments into a parseable transcript', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ segments: [{ start: 5, text: 'halo semua' }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const text = await transcribeAudio(
      new Blob(['x']),
      'a.mp3',
      { endpoint: 'https://asr.example.com/v1/audio/transcriptions', apiKey: 'k', model: 'whisper-1' },
      fetchImpl,
    );
    expect(detectFormat(text)).toBe('zoom');
    expect(parseTranscript(text, { startedAt: at(0) })[0].text).toBe('halo semua');
  });

  it('uses the diarized speaker when the endpoint provides one', () => {
    const labelled = labelSpeakers([
      { start: 0, text: 'halo semua', speaker: 'Rina' },
      { start: 8, text: 'aplikasi terdampak', speaker: 'Akbar' },
      { start: 20, text: 'setuju', speaker: 'Rina' },
    ]);
    expect(labelled.map((l) => l.speaker)).toEqual(['Rina', 'Akbar', 'Rina']);
  });

  it('advances the speaker on a whisper.cpp turn marker', () => {
    const labelled = labelSpeakers([
      { start: 0, text: 'halo semua [SPEAKER_TURN] aplikasi terdampak' },
      { start: 30, text: 'setuju' },
    ]);
    expect(labelled.map((l) => [l.speaker, l.text])).toEqual([
      ['Speaker 1', 'halo semua'],
      ['Speaker 2', 'aplikasi terdampak'],
      ['Speaker 2', 'setuju'],
    ]);
  });

  it('labels an undiarizable recording as one renameable speaker, not Unknown', () => {
    const labelled = labelSpeakers([
      { start: 0, text: 'halo semua' },
      { start: 30, text: 'aplikasi terdampak' },
    ]);
    expect(labelled.map((l) => l.speaker)).toEqual(['Speaker 1', 'Speaker 1']);
    expect(labelled.some((l) => l.speaker === 'Unknown')).toBe(false);
  });
});

describe('calendar', () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt-1
SUMMARY:Incident Resolution — Freeport
DTSTART:20260824T070000Z
DTEND:20260824T081000Z
LOCATION:https://meet.google.com/room
ATTENDEE:mailto:akbar@example.com
END:VEVENT
END:VCALENDAR`;

  it('parses VEVENTs including the conferencing link', () => {
    const [e] = parseIcs(ics);
    expect(e.title).toContain('Freeport');
    expect(e.start).toBe('2026-08-24T07:00:00.000Z');
    expect(e.conferenceUrl).toBe('https://meet.google.com/room');
    expect(e.attendees).toEqual(['akbar@example.com']);
  });

  it('matches by conferencing link before time', async () => {
    const store = await seeded();
    const session = store.getSession('room#1000')!;
    expect(matchEvent(session, parseIcs(ics))!.id).toBe('evt-1');
  });

  it('does not guess when nothing is close enough', async () => {
    const store = await seeded();
    const session = store.getSession('room#1000')!;
    const far = parseIcs(ics.replace('20260824T070000Z', '20260825T190000Z')).map((e) => ({
      ...e,
      conferenceUrl: undefined,
    }));
    expect(matchEvent(session, far)).toBeNull();
  });
});

describe('issue trackers', () => {
  const action = {
    id: 1,
    sessionId: 'room#1000',
    task: 'Implement fix ticket 2',
    owner: 'Akbar',
    dueAt: '2026-08-28',
    status: 'open' as const,
    createdAt: at(0),
    doneAt: null,
    externalRef: null,
  };

  it('drafts an issue that points back at the meeting', async () => {
    const store = await seeded();
    const draft = draftIssue(action, store.getSession('room#1000'));
    expect(draft.title).toBe('Implement fix ticket 2');
    expect(draft.description).toContain('Incident Freeport');
    expect(draft.dueDate).toBe('2026-08-28');
    expect(isoDue('minggu depan')).toBe('');
  });

  it('rejects an incomplete configuration before touching the network', async () => {
    expect(validateTracker({ provider: 'jira', baseUrl: 'http://x', token: 'a:b', target: 'P' })).toMatch(/https/);
    expect(validateTracker({ provider: 'jira', baseUrl: 'https://x', token: 'nocolon', target: 'P' })).toMatch(/email/);
    expect(validateTracker({ provider: 'linear', baseUrl: '', token: 'k', target: 'T' })).toBeNull();
    const fetchImpl = vi.fn();
    await expect(
      createIssue({ provider: 'notion', baseUrl: '', token: '', target: '' }, draftIssue(action, null), fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/Token/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('builds the right request per provider', () => {
    const draft = draftIssue(action, null);
    const jira = buildRequest({ provider: 'jira', baseUrl: 'https://org.atlassian.net/', token: 'a@b.com:tok', target: 'ENG' }, draft);
    expect(jira.url).toBe('https://org.atlassian.net/rest/api/3/issue');
    expect(jira.headers.Authorization).toMatch(/^Basic /);

    const linear = buildRequest({ provider: 'linear', baseUrl: '', token: 'lin_key', target: 'team' }, draft);
    expect(linear.url).toContain('linear.app');

    const notion = buildRequest({ provider: 'notion', baseUrl: '', token: 'secret', target: 'db' }, draft);
    expect(notion.headers['Notion-Version']).toBeTruthy();
  });

  it('returns the tracker reference so the action can be linked', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ key: 'ENG-42' }), { status: 201 }));
    const ref = await createIssue(
      { provider: 'jira', baseUrl: 'https://org.atlassian.net', token: 'a@b.com:tok', target: 'ENG' },
      draftIssue(action, null),
      fetchImpl as unknown as typeof fetch,
    );
    expect(ref).toBe('ENG-42');
  });

  it('surfaces a tracker rejection instead of pretending it worked', async () => {
    const fetchImpl = vi.fn(async () => new Response('no permission', { status: 403 }));
    await expect(
      createIssue(
        { provider: 'jira', baseUrl: 'https://org.atlassian.net', token: 'a@b.com:tok', target: 'ENG' },
        draftIssue(action, null),
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/403/);
  });

  const jira = { provider: 'jira' as const, baseUrl: 'https://org.atlassian.net', token: 'a@b.com:tok', target: 'ENG' };
  const linear = { provider: 'linear' as const, baseUrl: '', token: 'lin_key', target: 'team' };
  const notion = { provider: 'notion' as const, baseUrl: '', token: 'secret', target: 'db' };
  const answers = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('reads a Jira status back from the workflow-independent category', async () => {
    const done = { fields: { status: { name: 'Rilis', statusCategory: { key: 'done' } } } };
    expect(await fetchIssueStatus(jira, 'ENG-42', answers(done))).toBe('done');

    const wip = { fields: { status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } } };
    expect(await fetchIssueStatus(jira, 'ENG-42', answers(wip))).toBe('open');
  });

  it('treats a completed or cancelled Linear issue as done', async () => {
    expect(await fetchIssueStatus(linear, 'ENG-42', answers({ data: { issue: { state: { type: 'completed' } } } }))).toBe('done');
    expect(await fetchIssueStatus(linear, 'ENG-42', answers({ data: { issue: { state: { type: 'canceled' } } } }))).toBe('done');
    expect(await fetchIssueStatus(linear, 'ENG-42', answers({ data: { issue: { state: { type: 'started' } } } }))).toBe('open');
  });

  it('reads a Notion page from its status, select, checkbox or archive flag', async () => {
    expect(await fetchIssueStatus(notion, 'page', answers({ archived: true }))).toBe('done');
    expect(await fetchIssueStatus(notion, 'page', answers({ properties: { S: { type: 'status', status: { name: 'Selesai' } } } }))).toBe('done');
    expect(await fetchIssueStatus(notion, 'page', answers({ properties: { S: { type: 'status', status: { name: 'Backlog' } } } }))).toBe('open');
    expect(await fetchIssueStatus(notion, 'page', answers({ properties: { D: { type: 'checkbox', checkbox: true } } }))).toBe('done');
  });

  it('returns null rather than guessing when the tracker says nothing useful', async () => {
    expect(await fetchIssueStatus(jira, 'ENG-42', answers({ fields: {} }))).toBeNull();
    expect(await fetchIssueStatus(linear, 'ENG-42', answers({ data: { issue: null } }))).toBeNull();
    expect(await fetchIssueStatus(notion, 'page', answers({ properties: {} }))).toBeNull();
    // a deleted issue must not abort a refresh of the others
    expect(await fetchIssueStatus(jira, 'ENG-9', answers({}, 404))).toBeNull();
  });

  it('still surfaces a real tracker failure', async () => {
    await expect(fetchIssueStatus(jira, 'ENG-42', answers({}, 401))).rejects.toThrow(/401/);
  });
});

describe('sync and sharing', () => {
  it('refuses an unsafe configuration', () => {
    expect(validateSync({ endpoint: 'http://x', token: '', workspaceId: '', passphrase: 'longenough' })).toMatch(/https/);
    expect(validateSync({ endpoint: 'https://x', token: '', workspaceId: '', passphrase: 'short' })).toMatch(/Passphrase/);
    expect(validateSync({ endpoint: 'https://x', token: '', workspaceId: '', passphrase: 'longenough' })).toBeNull();
  });

  it('allows plain http only on loopback, where the token cannot be sniffed', () => {
    expect(isAllowedSyncEndpoint('http://localhost:8787')).toBe(true);
    expect(isAllowedSyncEndpoint('http://127.0.0.1:8787/companion')).toBe(true);
    expect(isAllowedSyncEndpoint('http://[::1]:8787')).toBe(true);
    expect(isAllowedSyncEndpoint('https://sync.example.com')).toBe(true);
    // a LAN address is not a secure context: TLS or nothing
    expect(isAllowedSyncEndpoint('http://192.168.1.10:8787')).toBe(false);
    expect(isAllowedSyncEndpoint('http://localhost.evil.com')).toBe(false);
    expect(isAllowedSyncEndpoint('http://127.0.0.1.evil.com')).toBe(false);
    expect(isAllowedSyncEndpoint('ftp://localhost')).toBe(false);
    expect(isAllowedSyncEndpoint('not a url')).toBe(false);
  });

  it('pushes encrypted bundles and pulls remote ones', async () => {
    const store = await seeded();
    store.queueSync('room#1000', 'upsert');

    const uploaded: { payload: string }[] = [];
    const remoteStore = await seeded();
    const remoteBundle = buildBundle(remoteStore, 'room#1000')!;
    remoteBundle.sessionId = 'remote#1';
    remoteBundle.title = 'Rapat dari rekan';

    const config = { endpoint: 'https://sync.example.com', token: 't', workspaceId: 'w', passphrase: 'passphrase123' };
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        uploaded.push(JSON.parse(String(init.body)) as { payload: string });
        return new Response('{}', { status: 200 });
      }
      const { encryptWithPassphrase } = await import('@meetcc/shared');
      const payload = await encryptWithPassphrase(JSON.stringify(remoteBundle), config.passphrase);
      return new Response(
        JSON.stringify({ sessions: [{ sessionId: 'remote#1', updatedAt: at(10), payload }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const report = await runSync(store, config, fetchImpl);
    expect(report.pushed).toEqual(['room#1000']);
    expect(report.pulled).toEqual(['remote#1']);
    expect(report.failed).toEqual([]);
    // what left the machine must not be readable without the passphrase
    expect(uploaded[0].payload).not.toContain('Freeport');
    expect(store.getSession('remote#1')!.title).toBe('Rapat dari rekan');
    expect(store.pendingSync()).toEqual([]);
    expect(store.get('sync.cursor')).toBe(at(10));
  });

  it('reports a wrong passphrase instead of silently dropping meetings', async () => {
    const store = await seeded();
    const other = await seeded();
    const bundle = buildBundle(other, 'room#1000')!;
    const { encryptWithPassphrase } = await import('@meetcc/shared');
    const payload = await encryptWithPassphrase(JSON.stringify(bundle), 'a-different-passphrase');
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ sessions: [{ sessionId: 'room#1000', updatedAt: at(10), payload }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const report = await runSync(
      store,
      { endpoint: 'https://sync.example.com', token: '', workspaceId: '', passphrase: 'passphrase123' },
      fetchImpl,
    );
    expect(report.pulled).toEqual([]);
    expect(report.failed).toHaveLength(1);
  });

  it('never lets a remote copy shrink a locally captured transcript', async () => {
    const store = await seeded();
    const bundle = buildBundle(store, 'room#1000')!;
    bundle.entries = bundle.entries.slice(0, 1);
    applyBundle(store, bundle);
    expect(store.countEntries('room#1000')).toBe(1); // applyBundle is unconditional…

    const store2 = await seeded();
    const { encryptWithPassphrase } = await import('@meetcc/shared');
    const payload = await encryptWithPassphrase(JSON.stringify(bundle), 'passphrase123');
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ sessions: [{ sessionId: 'room#1000', updatedAt: at(10), payload }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    await runSync(store2, { endpoint: 'https://s.example.com', token: '', workspaceId: '', passphrase: 'passphrase123' }, fetchImpl);
    expect(store2.countEntries('room#1000')).toBe(4); // …but runSync guards it
  });

  it('shares a meeting as an encrypted bundle and imports it back', async () => {
    const store = await seeded();
    const packed = await exportShare(store, 'room#1000', 'share-pass-1');
    expect(packed).not.toContain('Freeport');

    const target = CompanionStore.open((await openDatabase()).driver);
    const id = await importShare(target, packed, 'share-pass-1');
    expect(id).toBe('room#1000');
    expect(target.countEntries('room#1000')).toBe(4);
    expect(target.decisions()).toHaveLength(1);
    await expect(importShare(target, packed, 'wrong-pass')).rejects.toThrow();
  });

  it('can share the summary without the transcript', async () => {
    const store = await seeded();
    const packed = await exportShare(store, 'room#1000', 'share-pass-1', { summaryOnly: true });
    const target = CompanionStore.open((await openDatabase()).driver);
    await importShare(target, packed, 'share-pass-1');
    expect(target.countEntries('room#1000')).toBe(0);
    expect(target.getAnalysis('room#1000')?.status).toBe('done');
  });
});
