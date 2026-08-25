import type { ActionRow, CompanionStore, DecisionRow, QuestionRow, SessionRow } from '@meetcc/store';

// P1.9 — meeting continuity. The differentiator is not one meeting's notes but
// the thread between them: a decision revised three weeks later, a question
// that stayed open for four meetings, an action that is now overdue.

export interface TimelineEvent {
  at: string;
  sessionId: string;
  sessionTitle: string;
  kind: 'decision' | 'action' | 'question' | 'question-resolved';
  text: string;
  detail: string;
  entityId: number;
}

export interface Chronology {
  events: TimelineEvent[];
  /** Decisions on the same topic, oldest first — a changed decision is a pair. */
  revisions: { topic: string; decisions: DecisionRow[] }[];
  openQuestions: QuestionRow[];
  openActions: ActionRow[];
  overdueActions: ActionRow[];
}

function titleOf(sessions: SessionRow[], id: string): string {
  return sessions.find((s) => s.id === id)?.title || id;
}

function startOf(sessions: SessionRow[], id: string): string {
  return sessions.find((s) => s.id === id)?.startedAt ?? '';
}

/** A due date is overdue when it is a real past date. Free-text dues ("minggu
 *  depan") are left alone rather than guessed into a deadline. */
export function isOverdue(due: string, now: number): boolean {
  const t = Date.parse(due);
  return Number.isFinite(t) && t < now;
}

/**
 * Build the story of a project (or of the whole archive when `projectId` is
 * omitted): every decision, action and question in time order, plus the
 * unfinished business that the next meeting should pick up.
 */
export function buildChronology(
  store: CompanionStore,
  opts: { projectId?: string; now?: number } = {},
): Chronology {
  const now = opts.now ?? Date.now();
  const sessions = store.listSessions(opts.projectId ? { projectId: opts.projectId } : {});
  const ids = new Set(sessions.map((s) => s.id));
  const mine = <T extends { sessionId: string }>(rows: T[]): T[] =>
    rows.filter((r) => ids.has(r.sessionId));

  const decisions = mine(store.decisions());
  const actions = mine(store.actions());
  const questions = mine(store.questions());

  const events: TimelineEvent[] = [];
  for (const d of decisions) {
    events.push({
      at: startOf(sessions, d.sessionId) || d.createdAt,
      sessionId: d.sessionId,
      sessionTitle: titleOf(sessions, d.sessionId),
      kind: 'decision',
      text: d.decision,
      detail: d.reason,
      entityId: d.id,
    });
  }
  for (const a of actions) {
    events.push({
      at: startOf(sessions, a.sessionId) || a.createdAt,
      sessionId: a.sessionId,
      sessionTitle: titleOf(sessions, a.sessionId),
      kind: 'action',
      text: a.task,
      detail: [a.owner, a.dueAt].filter(Boolean).join(' · '),
      entityId: a.id,
    });
  }
  for (const q of questions) {
    events.push({
      at: startOf(sessions, q.sessionId) || q.createdAt,
      sessionId: q.sessionId,
      sessionTitle: titleOf(sessions, q.sessionId),
      kind: 'question',
      text: q.question,
      detail: '',
      entityId: q.id,
    });
    if (q.status === 'resolved' && q.resolvedIn) {
      events.push({
        at: startOf(sessions, q.resolvedIn) || q.createdAt,
        sessionId: q.resolvedIn,
        sessionTitle: titleOf(sessions, q.resolvedIn),
        kind: 'question-resolved',
        text: q.question,
        detail: `dibuka di ${titleOf(sessions, q.sessionId)}`,
        entityId: q.id,
      });
    }
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const byTopic = new Map<string, DecisionRow[]>();
  for (const d of decisions) {
    const key = (d.topic || '').toLowerCase().trim();
    if (!key) continue;
    byTopic.set(key, [...(byTopic.get(key) ?? []), d]);
  }
  const revisions = [...byTopic.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([topic, list]) => ({
      topic,
      decisions: [...list].sort((a, b) =>
        startOf(sessions, a.sessionId).localeCompare(startOf(sessions, b.sessionId)),
      ),
    }));

  const openActions = actions.filter((a) => a.status === 'open');
  return {
    events,
    revisions,
    openQuestions: questions.filter((q) => q.status === 'open'),
    openActions,
    overdueActions: openActions.filter((a) => isOverdue(a.dueAt, now)),
  };
}

export interface CarryOver {
  openActions: ActionRow[];
  openQuestions: QuestionRow[];
  fromSessions: string[];
}

/**
 * What is still unfinished from *earlier* meetings in the same room or project
 * — the "3 action items dari meeting sebelumnya masih terbuka" banner (§25).
 */
export function carryOverFor(
  store: CompanionStore,
  sessionId: string,
  opts: { limitSessions?: number } = {},
): CarryOver {
  const session = store.getSession(sessionId);
  if (!session) return { openActions: [], openQuestions: [], fromSessions: [] };

  const related = store
    .listSessions()
    .filter(
      (s) =>
        s.id !== sessionId &&
        (s.roomId === session.roomId ||
          (!!session.projectId && s.projectId === session.projectId)) &&
        (!session.startedAt || !s.startedAt || s.startedAt < session.startedAt),
    )
    .slice(0, opts.limitSessions ?? 10);

  const ids = new Set(related.map((s) => s.id));
  const openActions = store.actions({ status: 'open' }).filter((a) => ids.has(a.sessionId));
  const openQuestions = store.questions({ status: 'open' }).filter((q) => ids.has(q.sessionId));
  return {
    openActions,
    openQuestions,
    fromSessions: [...new Set([...openActions, ...openQuestions].map((r) => r.sessionId))],
  };
}
