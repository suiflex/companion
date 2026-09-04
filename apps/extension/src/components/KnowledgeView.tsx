import { useCallback, useEffect, useState } from 'react';
import { locale, t } from '@meetcc/shared/i18n';
import type { AskResult } from '@meetcc/shared';
import type { ActionRow } from '@meetcc/store';
import { weeklyDigest, type Chronology } from '@meetcc/meeting';
import { chronology, listActions, setActionStatus } from '../lib/db';
import { db } from '../lib/db';
import { useToast } from '../toast';

// P1.8 / P1.9 / P1.10 in one place: ask across every meeting, read the thread
// between meetings, and work the action items that came out of them.

interface GlobalAnswer extends AskResult {
  sessions: { id: string; title: string; startedAt: string | null }[];
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Keys, not text: resolved at render time so the labels follow the language. */
const EVENT_LABEL: Record<Chronology['events'][number]['kind'], Parameters<typeof t>[0]> = {
  decision: 'ext.kind.decision',
  action: 'ext.kind.action',
  question: 'ext.kind.question',
  'question-resolved': 'ext.kind.questionResolved',
};

function ActionRowView({
  action,
  onChange,
  onPush,
  busy,
}: {
  action: ActionRow;
  onChange: (status: 'open' | 'done') => void;
  onPush: () => void;
  busy: boolean;
}) {
  return (
    <li className={`kb-action ${action.status === 'done' ? 'done' : ''}`}>
      <label className="kb-check">
        <input
          type="checkbox"
          checked={action.status === 'done'}
          onChange={(e) => onChange(e.target.checked ? 'done' : 'open')}
          aria-label={`Tandai selesai: ${action.task}`}
        />
        <span className="kb-task">{action.task}</span>
      </label>
      <span className="kb-action-meta dim">
        {[action.owner, action.dueAt].filter(Boolean).join(' · ') || t('ext.kb.noOwner')}
      </span>
      {action.externalRef ? (
        <span className="kb-ref">{action.externalRef}</span>
      ) : (
        <button className="kb-push" disabled={busy} onClick={onPush} title={t('ext.kb.pushToTracker')}>
          Kirim ke tracker
        </button>
      )}
    </li>
  );
}

export function KnowledgeView({ onOpenMeeting, seedQuestion }: { onOpenMeeting: (id: string) => void; seedQuestion?: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<GlobalAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [story, setStory] = useState<Chronology | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [pushing, setPushing] = useState(0);
  const [syncingIssues, setSyncingIssues] = useState(false);
  const toast = useToast();

  const refresh = useCallback(() => {
    void chronology().then(setStory).catch(() => undefined);
    void listActions().then(setActions).catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  const ask = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || asking) return;
      setAsking(true);
      setAnswer(null);
      try {
        const res = await chrome.runtime.sendMessage({ type: 'global-ask', question: q });
        if (res?.ok) setAnswer(res.result as GlobalAnswer);
        else toast('error', t('ext.failed', { error: res?.error ?? t('ext.unknownError') }));
      } catch (e) {
        toast('error', t('ext.failed', { error: (e as Error).message }));
      } finally {
        setAsking(false);
      }
    },
    [asking, toast],
  );

  // a question handed over from ⌘K runs immediately
  useEffect(() => {
    if (seedQuestion) {
      setQuestion(seedQuestion);
      void ask(seedQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuestion]);

  const toggle = async (action: ActionRow, status: 'open' | 'done') => {
    setActions((list) => list.map((a) => (a.id === action.id ? { ...a, status } : a)));
    try {
      await setActionStatus(action.id, status);
      refresh();
    } catch (e) {
      toast('error', (e as Error).message);
      refresh();
    }
  };

  const push = async (action: ActionRow) => {
    setPushing(action.id);
    try {
      const res = await db<{ ref: string; alreadyPushed: boolean }>('push-issue', { id: action.id });
      toast('info', res.alreadyPushed ? t('ext.kb.alreadyPushed', { ref: res.ref }) : t('ext.kb.created', { ref: res.ref }));
      refresh();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setPushing(0);
    }
  };

  // the tracker is where the team actually closes work, so its status wins
  const refreshIssues = async () => {
    setSyncingIssues(true);
    try {
      const res = await db<{ checked: number; changed: number; failed: string[] }>('refresh-issues');
      toast(
        res.failed.length ? 'error' : 'success',
        `${res.checked} issue dicek, ${res.changed} status diperbarui` +
          (res.failed.length ? `, ${res.failed.length} gagal` : ''),
      );
      refresh();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSyncingIssues(false);
    }
  };

  const visibleActions = showDone ? actions : actions.filter((a) => a.status === 'open');

  return (
    <div className="kb">
      <section className="kb-ask">
        <form
          className="ask-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <textarea
            className="ask-input"
            rows={1}
            value={question}
            placeholder={t('ext.kb.askPlaceholder')}
            aria-label={t('ext.kb.askLabel')}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
          />
          <button className="primary" type="submit" disabled={asking || !question.trim()}>
            {asking ? '…' : t('ext.kb.ask')}
          </button>
        </form>

        {answer && (
          <article className="kb-answer">
            <p className="kb-answer-text">{answer.answer}</p>
            <div className="ask-grades">
              <span className={`ask-grade ask-grade-${answer.answerability}`}>{answer.answerability}</span>
              {answer.sessions.map((s) => (
                <button key={s.id} className="ask-chip" onClick={() => onOpenMeeting(s.id)}>
                  {s.title || s.id} · {fmtDate(s.startedAt)}
                </button>
              ))}
            </div>
            {answer.evidence.length > 0 && (
              <ul className="kb-evidence">
                {answer.evidence.map((e, i) => (
                  <li key={i}>
                    <span className="ask-ev-who">{e.speakers.join(', ')}</span>
                    <span className="ask-ev-text">{e.preview}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </section>

      <div className="kb-digest">
        <button
          className="kb-refresh"
          disabled={!story}
          title={t('ext.kb.copyDigest')}
          onClick={async () => {
            if (!story) return;
            await navigator.clipboard.writeText(weeklyDigest(story));
            toast('success', t('ext.kb.digestCopied'));
          }}
        >
          Salin digest mingguan
        </button>
      </div>

      <div className="kb-cols">
        <section className="kb-col">
          <h2 className="section-label">
            {t('ext.kb.actionItems')}{' '}
            {story?.overdueActions.length
              ? t('ext.kb.overdue', { count: story.overdueActions.length })
              : ''}
          </h2>
          <div className="kb-toggle-row">
            <label className="kb-toggle">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              {t('ext.kb.showDone')}
            </label>
            {actions.some((a) => a.externalRef) && (
              <button className="kb-refresh" disabled={syncingIssues} onClick={() => void refreshIssues()}>
                {syncingIssues ? t('ext.kb.checkingTracker') : t('ext.kb.pullTracker')}
              </button>
            )}
          </div>
          {visibleActions.length ? (
            <ul className="kb-list">
              {visibleActions.map((a) => (
                <ActionRowView
                  key={a.id}
                  action={a}
                  busy={pushing === a.id}
                  onChange={(status) => void toggle(a, status)}
                  onPush={() => void push(a)}
                />
              ))}
            </ul>
          ) : (
            <p className="section-empty">{t('ext.kb.noOpenActions')}</p>
          )}
        </section>

        <section className="kb-col">
          <h2 className="section-label">{t('ext.kb.changedDecisions')}</h2>
          {story?.revisions.length ? (
            <ul className="kb-list">
              {story.revisions.map((r) => (
                <li key={r.topic} className="kb-revision">
                  <span className="kb-topic">{r.topic}</span>
                  {r.decisions.map((d, i) => (
                    <button
                      key={d.id}
                      className={`kb-rev-step ${d.supersededBy ? 'superseded' : ''}`}
                      onClick={() => onOpenMeeting(d.sessionId)}
                    >
                      <span className="kb-rev-index">{i + 1}</span>
                      <span>{d.decision}</span>
                      {d.reason && <em className="dim"> — {d.reason}</em>}
                      {!d.supersededBy && <span className="kb-standing">{t('ext.kb.standing')}</span>}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-empty">{t('ext.kb.noRepeatedTopics')}</p>
          )}

          <h2 className="section-label">{t('ext.kb.chronology')}</h2>
          {story?.events.length ? (
            <ol className="kb-timeline">
              {story.events.slice(-40).map((e, i) => (
                <li key={`${e.kind}-${e.entityId}-${i}`}>
                  <button className="kb-event" onClick={() => onOpenMeeting(e.sessionId)}>
                    <span className={`kb-event-kind kind-${e.kind}`}>{t(EVENT_LABEL[e.kind])}</span>
                    <span className="kb-event-text">{e.text}</span>
                    <span className="dim">
                      {e.sessionTitle} · {fmtDate(e.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="section-empty">{t('ext.kb.noAnalysed')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
