import { useEffect, useState } from 'react';
import type { SessionRow } from '@meetcc/store';
import type { CarryOver } from '@meetcc/meeting';
import { carryOver, db, getSession, listProjects } from '../lib/db';
import { locale, t } from '@meetcc/shared/i18n';

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

  useEffect(() => {
    let alive = true;
    setFailed(false);
    Promise.all([getSession(sessionId), carryOver(sessionId), listProjects()])
      .then(([s, c, p]) => {
        if (!alive) return;
        setSession(s);
        setAgenda(s?.agenda ?? '');
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
        <input
          className="mh-agenda"
          value={agenda}
          placeholder={t('ext.header.agendaPlaceholder')}
          aria-label={t('ext.header.agenda')}
          onChange={(e) => setAgenda(e.target.value)}
          onBlur={() => {
            if (agenda === (session.agenda ?? '')) return;
            void db('set-session-agenda', { id: sessionId, agenda }).catch(() => undefined);
          }}
        />
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
          <span dangerouslySetInnerHTML={{ __html: t('ext.header.carryOpen', { count: openCount }) }} />
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
