import { useCallback, useEffect, useMemo, useState } from 'react';
import { locale, t } from '@meetcc/shared/i18n';
import {
  ANALYSIS_PREFIX,
  RESOLVED_PREFIX,
  buildAgenda,
  collectDecisions,
  collectOpenQuestions,
  decisionTopics,
  loadAllResolved,
  loadAnalyses,
  toggleResolved,
  watchStorage,
  type AnalysisRecord,
} from '@meetcc/shared';
import { useToast } from '../toast';

interface Props {
  onClose: () => void;
  onOpenMeeting: (id: string) => void;
}

export function DecisionLog({ onClose, onOpenMeeting }: Props) {
  const [records, setRecords] = useState<Record<string, AnalysisRecord>>({});
  const [resolved, setResolved] = useState<Record<string, string[]>>({});
  const [topic, setTopic] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(() => {
    void loadAnalyses().then(setRecords);
    void loadAllResolved().then(setResolved);
  }, []);

  useEffect(() => {
    refresh();
    return watchStorage(refresh, [ANALYSIS_PREFIX, RESOLVED_PREFIX]);
  }, [refresh]);

  const decisions = useMemo(() => collectDecisions(records), [records]);
  const topics = useMemo(() => decisionTopics(decisions), [decisions]);
  const shown = useMemo(
    () => (topic ? decisions.filter((d) => d.topic === topic) : decisions),
    [decisions, topic],
  );
  const questions = useMemo(
    () => collectOpenQuestions(records, resolved),
    [records, resolved],
  );
  const openCount = questions.filter((q) => !q.resolved).length;

  const onToggle = async (id: string, question: string) => {
    await toggleResolved(id, question);
    refresh();
  };

  const copyAgenda = async () => {
    await navigator.clipboard.writeText(buildAgenda(questions));
    toast('success', t('ext.decisions.copied'));
  };

  return (
    <div className="settings">
      <header className="toolbar">
        <div className="toolbar-title">
          <h1>Keputusan &amp; Carry-over</h1>
        </div>
        <button onClick={onClose} aria-label={t('ext.decisions.close')}>
          ✕
        </button>
      </header>

      <div className="decisionlog-body">
        <section>
          <div className="dl-head">
            <h2 className="section-label">{t('ext.decisions.heading', { count: decisions.length })}</h2>
            {topics.length > 0 && (
              <div className="dl-filters" role="group" aria-label="Filter topik">
                <button
                  className={`ask-chip ${topic === null ? 'active' : ''}`}
                  onClick={() => setTopic(null)}
                >
                  Semua
                </button>
                {topics.map((t) => (
                  <button
                    key={t}
                    className={`ask-chip ${topic === t ? 'active' : ''}`}
                    onClick={() => setTopic(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {shown.length ? (
            <ul className="dl-list">
              {shown.map((d, i) => (
                <li key={`${d.meetingId}-${i}`} className="dl-card">
                  <div className="decision-what">
                    {d.what}
                    {d.topic && <span className="topic-tag">{d.topic}</span>}
                  </div>
                  {d.why && <div className="decision-why">Alasan: {d.why}</div>}
                  {d.rejected.length > 0 && (
                    <div className="decision-rejected">Ditolak: {d.rejected.join('; ')}</div>
                  )}
                  <button className="dl-link" onClick={() => onOpenMeeting(d.meetingId)}>
                    ↳ {d.meetingId} · {new Date(d.generatedAt).toLocaleDateString(locale())}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-empty">
              {decisions.length ? t('ext.decisions.emptyTopic') : t('ext.decisions.empty')}
            </p>
          )}
        </section>

        <section>
          <div className="dl-head">
            <h2 className="section-label">{t('ext.decisions.carryHeading', { count: openCount })}</h2>
            <button className="ghost" onClick={copyAgenda} disabled={!openCount}>
              ⧉ Copy agenda draft
            </button>
          </div>

          {questions.length ? (
            <ul className="carry-list">
              {questions.map((q, i) => (
                <li key={`${q.meetingId}-${i}`} className={`carry-item ${q.resolved ? 'resolved' : ''}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={q.resolved}
                      onChange={() => void onToggle(q.meetingId, q.question)}
                    />
                    <span className="carry-q">{q.question}</span>
                  </label>
                  <button className="dl-link" onClick={() => onOpenMeeting(q.meetingId)}>
                    {q.meetingId}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-empty">{t('ext.decisions.noOpenQuestions')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
