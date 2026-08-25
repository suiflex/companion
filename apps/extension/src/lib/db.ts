import type {
  ActionRow,
  DecisionRow,
  QuestionRow,
  SearchHit,
  SessionRow,
} from '@meetcc/store';
import type { CarryOver, Chronology } from '@meetcc/meeting';
import type { Entry } from '@meetcc/shared';

// The database lives in the service worker (OPFS is single-writer), so the
// dashboard talks to it by message. One thin call site keeps every view from
// re-implementing the request/response dance.

export async function db<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await chrome.runtime.sendMessage({ type: 'db', op, args });
  if (!res?.ok) throw new Error(res?.error ?? 'Database tidak merespons.');
  return res.data as T;
}

export const listSessions = (projectId?: string) => db<SessionRow[]>('sessions', { projectId });
export const getSession = (id: string) => db<SessionRow | null>('session', { id });
export const search = (query: string, sessionId?: string) =>
  db<SearchHit[]>('search', { query, sessionId });
export const listActions = (args: { sessionId?: string; status?: 'open' | 'done' } = {}) =>
  db<ActionRow[]>('actions', args);
export const setActionStatus = (id: number, status: 'open' | 'done') =>
  db<{ ok: true }>('set-action-status', { id, status });
export const listDecisions = (sessionId?: string) => db<DecisionRow[]>('decisions', { sessionId });
export const listQuestions = (sessionId?: string) => db<QuestionRow[]>('questions', { sessionId });
export const chronology = (projectId?: string) => db<Chronology>('chronology', { projectId });
export const carryOver = (sessionId: string) => db<CarryOver>('carry-over', { sessionId });
export const evidenceFor = (entityType: string, entityId: number) =>
  db<Entry[]>('evidence', { entityType, entityId });
export const listProjects = () => db<{ id: string; name: string }[]>('projects');
export const listHighlights = (sessionId: string) =>
  db<{ id: number; seq: number; kind: string; text: string }[]>('highlights', { sessionId });
