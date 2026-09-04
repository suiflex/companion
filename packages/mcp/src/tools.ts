import { CompanionStore, ingestAll, openDatabase, type SearchHit } from '@meetcc/store';

// P2.4 — expose the local meeting knowledge base to coding agents over MCP.
//
// The extension's database lives in Chrome's OPFS, which no outside process
// can open, so the bridge is an explicit export: the user saves a snapshot
// from Settings and points this server at that file. Nothing is read from the
// browser behind the user's back, and the server is read-only.
//
// Retrieval here is the same FTS5 + structured memory the extension uses. The
// answering half is deliberately absent: the MCP client *is* an LLM, so the
// ask tools return grounded evidence for it to reason over rather than making
// a second model call from inside this process.

export interface SnapshotSource {
  read(): Promise<Record<string, unknown>>;
}

export async function loadSnapshot(source: SnapshotSource): Promise<CompanionStore> {
  const { driver } = await openDatabase();
  const store = CompanionStore.open(driver);
  ingestAll(store, await source.read());
  return store;
}

/** Shaped for the MCP SDK's `ServerResult`, which allows extra fields. */
export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
};

const text = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

export const TOOL_DEFINITIONS = [
  {
    name: 'list_meetings',
    description: 'Stored meetings, newest first, with participants and duration.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of meetings (default 30)' },
        projectId: { type: 'string' },
      },
    },
  },
  {
    name: 'search_meetings',
    description:
      'Search across meetings over transcripts, decisions, action items, open questions and documents (FTS5/BM25).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
  },
  {
    name: 'get_meeting',
    description: 'One meeting: metadata, summary and structured memory.',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] },
  },
  {
    name: 'get_transcript',
    description: 'The transcript of one meeting. variant "clean" returns the AI-cleaned version.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        variant: { type: 'string', enum: ['raw', 'clean'] },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'ask_meeting',
    description:
      'Retrieve the transcript passages relevant to a question from ONE meeting, with line ids as evidence. The caller composes the answer from that evidence.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string' }, question: { type: 'string' } },
      required: ['sessionId', 'question'],
    },
  },
  {
    name: 'ask_meetings',
    description:
      'Like ask_meeting but across the whole archive: returns evidence per meeting.',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string' }, limit: { type: 'number' } },
      required: ['question'],
    },
  },
  {
    name: 'get_decisions',
    description: 'Extracted decisions, filterable by meeting or by topic.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string' }, topic: { type: 'string' } },
    },
  },
  {
    name: 'get_action_items',
    description: 'Action items, filterable by meeting, owner or status.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        owner: { type: 'string' },
        status: { type: 'string', enum: ['open', 'done'] },
      },
    },
  },
  {
    name: 'get_open_questions',
    description: 'Open questions, including which meeting each one was answered in.',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } },
  },
] as const;

/** Group search hits into per-meeting evidence with the surrounding turns. */
function evidenceFor(store: CompanionStore, hits: SearchHit[], window = 3) {
  const bySession = new Map<string, Set<number>>();
  for (const hit of hits) {
    const entries = store.getEntries(hit.sessionId);
    const idx =
      hit.kind === 'transcript'
        ? entries.findIndex((e) => e.text === hit.text)
        : entries.findIndex((e) =>
            store
              .evidenceFor(
                hit.kind === 'decision' ? 'decisions' : hit.kind === 'action' ? 'action_items' : 'open_questions',
                hit.entityId,
              )
              .some((x) => x.id === e.id),
          );
    if (idx < 0) continue;
    const set = bySession.get(hit.sessionId) ?? new Set<number>();
    for (let i = Math.max(0, idx - window); i <= Math.min(entries.length - 1, idx + window); i++) {
      set.add(i);
    }
    bySession.set(hit.sessionId, set);
  }
  return [...bySession.entries()].map(([sessionId, seqs]) => {
    const session = store.getSession(sessionId);
    const entries = store.getEntries(sessionId);
    return {
      sessionId,
      title: session?.title ?? '',
      startedAt: session?.startedAt ?? null,
      lines: [...seqs]
        .sort((a, b) => a - b)
        .map((i) => ({ id: entries[i].id, time: entries[i].time, speaker: entries[i].speaker, text: entries[i].text })),
    };
  });
}

export function callTool(store: CompanionStore, name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case 'list_meetings':
      return text(
        store
          .listSessions(args.projectId ? { projectId: str(args.projectId) } : {})
          .slice(0, num(args.limit, 30)),
      );

    case 'search_meetings':
      return text(store.search(str(args.query), { limit: num(args.limit, 20) }));

    case 'get_meeting': {
      const id = str(args.sessionId);
      const session = store.getSession(id);
      if (!session) return { ...text(`Rapat ${id} tidak ditemukan.`), isError: true };
      const record = store.getAnalysis(id);
      return text({
        session,
        summary: record?.status === 'done' ? record.analysis.executiveSummary : null,
        decisions: store.decisions({ sessionId: id }),
        actionItems: store.actions({ sessionId: id }),
        openQuestions: store.questions({ sessionId: id }),
        highlights: store.highlights(id),
      });
    }

    case 'get_transcript': {
      const id = str(args.sessionId);
      const variant = str(args.variant, 'raw') === 'clean' ? 'clean' : 'raw';
      const entries = store.getEntries(id, variant);
      if (!entries.length) return { ...text(`Tidak ada transcript untuk ${id}.`), isError: true };
      return text(entries);
    }

    case 'ask_meeting': {
      const id = str(args.sessionId);
      const hits = store.search(str(args.question), { sessionId: id, limit: 12 });
      if (!hits.length) return text({ evidence: [], note: 'No part of the meeting is relevant.' });
      return text({ question: str(args.question), evidence: evidenceFor(store, hits) });
    }

    case 'ask_meetings': {
      const hits = store.search(str(args.question), { limit: num(args.limit, 24) });
      if (!hits.length) return text({ evidence: [], note: 'No meeting covers this.' });
      return text({ question: str(args.question), evidence: evidenceFor(store, hits) });
    }

    case 'get_decisions':
      return text(
        store.decisions({
          sessionId: args.sessionId ? str(args.sessionId) : undefined,
          topic: args.topic ? str(args.topic) : undefined,
        }),
      );

    case 'get_action_items':
      return text(
        store.actions({
          sessionId: args.sessionId ? str(args.sessionId) : undefined,
          owner: args.owner ? str(args.owner) : undefined,
          status: args.status === 'done' || args.status === 'open' ? args.status : undefined,
        }),
      );

    case 'get_open_questions':
      return text(store.questions({ sessionId: args.sessionId ? str(args.sessionId) : undefined }));

    default:
      return { ...text(`Tool tidak dikenal: ${name}`), isError: true };
  }
}
