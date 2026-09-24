import { useEffect, useMemo, useState } from 'react';
import type { SessionRow } from '@meetcc/store';
import type { CarryOver } from '@meetcc/meeting';
import { carryOver, db, getSession, listProjects } from '../lib/db';
import {
  getContext,
  getMiniContexts,
  saveContext,
  watchStorage,
  MINI_CONTEXTS_KEY,
  type MiniContext,
} from '@meetcc/shared';
import { locale, t } from '@meetcc/shared/i18n';
import { useToast } from '../toast';

// P1.5 — a meeting is more than a room code: date, duration, participants and
// platform (§21). P1.9/P2.3 ride along here because this is where they matter
// to the user: what is still open from last time, and which project this
// meeting belongs to.

function duration(ms: number | null): string {
  if (!ms || ms < 60_000) return '';
  const mins = Math.round(ms / 60_000);
  return mins < 60 ? `${mins} menit` : `${Math.floor(mins / 60)}j ${mins % 60}m`;
}

const PLATFORM_LABEL: Record<string, string> = {
  'google-meet': 'Google Meet',
  teams: 'Microsoft Teams',
  unknown: '',
};

export function MeetingHeader({
  sessionId,
  onOpenMeeting,
}: {
  sessionId: string;
  onOpenMeeting: (id: string) => void;
}) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [carry, setCarry] = useState<CarryOver | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const [agenda, setAgenda] = useState('');
  const [availableContexts, setAvailableContexts] = useState<MiniContext[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const toast = useToast();

  const loadMiniContextsList = () => {
    void getMiniContexts().then(setAvailableContexts).catch(() => undefined);
  };

  useEffect(() => {
    loadMiniContextsList();
    return watchStorage(loadMiniContextsList, [MINI_CONTEXTS_KEY]);
  }, []);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < availableContexts.length; i++) {
      const tags = availableContexts[i].tags;
      for (let j = 0; j < tags.length; j++) {
        set.add(tags[j].toLowerCase());
      }
    }
    return Array.from(set).sort();
  }, [availableContexts]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < availableContexts.length; i++) {
      const tags = availableContexts[i].tags;
      for (let j = 0; j < tags.length; j++) {
        const tg = tags[j].toLowerCase();
        map.set(tg, (map.get(tg) ?? 0) + 1);
      }
    }
    return map;
  }, [availableContexts]);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    Promise.all([
      getSession(sessionId),
      carryOver(sessionId),
      listProjects(),
      getContext(sessionId),
    ])
      .then(([s, c, p, ctx]) => {
        if (!alive) return;
        setSession(s);
        setAgenda(ctx || s?.agenda || '');
        setCarry(c);
        setProjects(p);
      })
      // the index is derived data: a meeting captured seconds ago may not be
      // in it yet, and that must not break the meeting view
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [sessionId]);

  if (failed || !session) return null;

  const meta = [
    session.startedAt
      ? new Date(session.startedAt).toLocaleString(locale(), {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    duration(session.durationMs),
    session.participants.length ? `${session.participants.length} peserta` : '',
    PLATFORM_LABEL[session.platform] ?? session.platform,
  ].filter(Boolean);

  const assign = async (projectId: string) => {
    setSession({ ...session, projectId: projectId || null });
    await db('set-session-project', { id: sessionId, projectId }).catch(() => undefined);
  };

  const insertSingle = (ctx: MiniContext) => {
    const snippet = `[${ctx.term}]: ${ctx.definition}`;
    const nextAgenda = agenda ? `${agenda}\n${snippet}` : snippet;
    setAgenda(nextAgenda);
    void saveContext(sessionId, nextAgenda).catch(() => undefined);
    void db('set-session-agenda', { id: sessionId, agenda: nextAgenda }).catch(() => undefined);
    toast('success', t('ext.header.contextInserted'));
    setPopoverOpen(false);
  };

  const insertTag = (tag: string) => {
    const target = tag.toLowerCase();
    const snippets: string[] = [];
    for (let i = 0; i < availableContexts.length; i++) {
      const c = availableContexts[i];
      for (let j = 0; j < c.tags.length; j++) {
        if (c.tags[j].toLowerCase() === target) {
          snippets.push(`[${c.term}]: ${c.definition}`);
          break;
        }
      }
    }
    if (!snippets.length) return;
    const added = snippets.join('\n');
    const nextAgenda = agenda ? `${agenda}\n${added}` : added;
    setAgenda(nextAgenda);
    void saveContext(sessionId, nextAgenda).catch(() => undefined);
    void db('set-session-agenda', { id: sessionId, agenda: nextAgenda }).catch(() => undefined);
    toast('success', t('ext.header.contextInserted'));
    setPopoverOpen(false);
  };

  const openCount = (carry?.openActions.length ?? 0) + (carry?.openQuestions.length ?? 0);

  return (
    <div className="meeting-header">
      <div className="mh-meta">
        <span className="dim">{meta.join(' · ')}</span>
        {session.participants.length > 0 && (
          <span className="mh-people" title={session.participants.join(', ')}>
            {session.participants.slice(0, 5).join(', ')}
            {session.participants.length > 5 ? ` +${session.participants.length - 5}` : ''}
          </span>
        )}
        <span className="spacer" />
        <div className="mh-agenda-wrap">
          <input
            className="mh-agenda"
            value={agenda}
            placeholder={t('ext.header.contextPlaceholder')}
            aria-label={t('ext.header.context')}
            title={t('ext.header.context')}
            onChange={(e) => setAgenda(e.target.value)}
            onBlur={() => {
              void saveContext(sessionId, agenda).catch(() => undefined);
              if (agenda === (session.agenda ?? '')) return;
              void db('set-session-agenda', { id: sessionId, agenda }).catch(() => undefined);
            }}
          />
          <button
            type="button"
            className="mh-insert-btn"
            title={t('ext.header.insertContext')}
            onClick={() => setPopoverOpen((v) => !v)}
          >
            ✦
          </button>
          {popoverOpen && (
            <div className="mh-context-popover">
              <div className="mh-popover-head">
                <span className="mh-popover-title">{t('ext.header.contextPopoverTitle')}</span>
                <button
                  type="button"
                  className="mh-popover-close"
                  onClick={() => setPopoverOpen(false)}
                  aria-label={t('ext.header.close')}
                >
                  ✕
                </button>
              </div>
              {availableContexts.length === 0 ? (
                <p className="section-empty">{t('ext.header.noContextsAvailable')}</p>
              ) : (
                <div className="mh-popover-body">
                  {uniqueTags.length > 0 && (
                    <div className="mh-popover-group">
                      <span className="dim">{t('ext.header.insertByTag')}</span>
                      <div className="mh-popover-tag-row">
                        {uniqueTags.map((tg) => {
                          const count = tagCounts.get(tg) ?? 0;
                          return (
                            <button
                              key={tg}
                              type="button"
                              className="mh-tag-insert-btn"
                              onClick={() => insertTag(tg)}
                            >
                              {t('ext.header.insertAllWithTag', { tag: tg, count })}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="mh-popover-group">
                    <span className="dim">{t('ext.header.insertSingle')}</span>
                    <div className="mh-popover-item-list">
                      {availableContexts.map((ctx) => (
                        <button
                          key={ctx.id}
                          type="button"
                          className="mh-ctx-item-btn"
                          onClick={() => insertSingle(ctx)}
                        >
                          <span className="ctx-item-term">{ctx.term}</span>
                          <span className="dim ctx-item-def">{ctx.definition}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <label className="mh-project">
          Proyek
          <select value={session.projectId ?? ''} onChange={(e) => void assign(e.target.value)}>
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {openCount > 0 && (
        <div className="mh-carry">
          {t('ext.header.carryOpen', { count: '\u0000' })
            .split('\u0000')
            .flatMap((part, idx) =>
              idx === 0 ? [part] : [<strong key={idx}>{openCount}</strong>, part],
            )}
          {carry!.openActions.length > 0 && (
            <span className="dim">{t('ext.header.openActions', { count: carry!.openActions.length })}</span>
          )}
          {carry!.openQuestions.length > 0 && (
            <span className="dim">{t('ext.header.openQuestions', { count: carry!.openQuestions.length })}</span>
          )}
          {carry!.fromSessions.slice(0, 3).map((id) => (
            <button key={id} className="ask-chip" onClick={() => onOpenMeeting(id)}>
              {t('ext.header.openPrevious')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
