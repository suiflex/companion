import { useCallback, useEffect, useMemo, useState } from 'react';
import { locale, t } from '@meetcc/shared/i18n';
import {
  getMiniContexts,
  saveMiniContexts,
  watchStorage,
  MINI_CONTEXTS_KEY,
  type AskResult,
  type MiniContext,
} from '@meetcc/shared';
import type { ActionRow } from '@meetcc/store';
import { weeklyDigest, type Chronology } from '@meetcc/meeting';
import { chronology, listActions, setActionStatus } from '../lib/db';
import { db } from '../lib/db';
import { useToast } from '../toast';

// Knowledge base: Mini Context & Glossary manager (for quick meeting injection)
// alongside cross-meeting thread, chronology, and action items.

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
  const [activeTab, setActiveTab] = useState<'contexts' | 'insights'>('contexts');

  // Mini contexts state
  const [contexts, setContexts] = useState<MiniContext[]>([]);
  const [activeTag, setActiveTag] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTerm, setFormTerm] = useState('');
  const [formDef, setFormDef] = useState('');
  const [formSelectedTags, setFormSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');

  // Cross-meeting insights state
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<GlobalAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [story, setStory] = useState<Chronology | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [pushing, setPushing] = useState(0);
  const [syncingIssues, setSyncingIssues] = useState(false);
  const toast = useToast();

  const loadContexts = useCallback(async () => {
    const list = await getMiniContexts();
    setContexts(list);
  }, []);

  useEffect(() => {
    void loadContexts();
    return watchStorage(() => void loadContexts(), [MINI_CONTEXTS_KEY]);
  }, [loadContexts]);

  const refreshInsights = useCallback(() => {
    void chronology().then(setStory).catch(() => undefined);
    void listActions().then(setActions).catch(() => undefined);
  }, []);

  useEffect(refreshInsights, [refreshInsights]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (let i = 0; i < contexts.length; i++) {
      const tags = contexts[i].tags;
      for (let j = 0; j < tags.length; j++) {
        tagSet.add(tags[j].toLowerCase());
      }
    }
    return Array.from(tagSet).sort();
  }, [contexts]);

  const filteredContexts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tagFilter = activeTag === 'all' ? null : activeTag.toLowerCase();
    const results: MiniContext[] = [];

    for (let i = 0; i < contexts.length; i++) {
      const c = contexts[i];
      if (tagFilter) {
        let tagMatches = false;
        for (let j = 0; j < c.tags.length; j++) {
          if (c.tags[j].toLowerCase() === tagFilter) {
            tagMatches = true;
            break;
          }
        }
        if (!tagMatches) continue;
      }

      if (q) {
        const inTerm = c.term.toLowerCase().includes(q);
        const inDef = c.definition.toLowerCase().includes(q);
        let inTag = false;
        if (!inTerm && !inDef) {
          for (let j = 0; j < c.tags.length; j++) {
            if (c.tags[j].toLowerCase().includes(q)) {
              inTag = true;
              break;
            }
          }
        }
        if (!inTerm && !inDef && !inTag) continue;
      }

      results.push(c);
    }
    return results;
  }, [contexts, activeTag, search]);

  const selectedTagSet = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < formSelectedTags.length; i++) {
      s.add(formSelectedTags[i].toLowerCase());
    }
    return s;
  }, [formSelectedTags]);

  const toggleTag = useCallback((tag: string) => {
    const lower = tag.toLowerCase();
    setFormSelectedTags((prev) => {
      let found = false;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].toLowerCase() === lower) {
          found = true;
          break;
        }
      }
      if (found) {
        return prev.filter((t) => t.toLowerCase() !== lower);
      }
      return [...prev, tag];
    });
  }, []);

  const addCustomTag = useCallback(() => {
    const trimmed = customTagInput.trim().replace(/^#/, '');
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    setFormSelectedTags((prev) => {
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].toLowerCase() === lower) return prev;
      }
      return [...prev, trimmed];
    });
    setCustomTagInput('');
  }, [customTagInput]);

  const removeTag = useCallback((tagToRemove: string) => {
    const lower = tagToRemove.toLowerCase();
    setFormSelectedTags((prev) => prev.filter((t) => t.toLowerCase() !== lower));
  }, []);

  const handleSaveContext = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = formTerm.trim();
    const definition = formDef.trim();
    if (!term || !definition) return;

    const extra = customTagInput.trim().replace(/^#/, '');
    const tags = [...formSelectedTags];
    if (extra) {
      const extraLower = extra.toLowerCase();
      let exists = false;
      for (let i = 0; i < tags.length; i++) {
        if (tags[i].toLowerCase() === extraLower) {
          exists = true;
          break;
        }
      }
      if (!exists) tags.push(extra);
    }

    const now = new Date().toISOString();
    let updated: MiniContext[];

    if (editingId) {
      updated = contexts.map((c) =>
        c.id === editingId ? { ...c, term, definition, tags, updatedAt: now } : c,
      );
    } else {
      const newCtx: MiniContext = {
        id: `ctx_${Date.now()}`,
        term,
        definition,
        tags,
        createdAt: now,
        updatedAt: now,
      };
      updated = [newCtx, ...contexts];
    }

    await saveMiniContexts(updated);
    setContexts(updated);
    setFormTerm('');
    setFormDef('');
    setFormSelectedTags([]);
    setCustomTagInput('');
    setEditingId(null);
    setIsEditing(false);
    toast('success', t('ext.kb.contextSaved'));
  };

  const handleEdit = (ctx: MiniContext) => {
    setEditingId(ctx.id);
    setFormTerm(ctx.term);
    setFormDef(ctx.definition);
    setFormSelectedTags([...ctx.tags]);
    setCustomTagInput('');
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    const updated = contexts.filter((c) => c.id !== id);
    await saveMiniContexts(updated);
    setContexts(updated);
    if (editingId === id) {
      setEditingId(null);
      setIsEditing(false);
    }
    toast('info', t('ext.kb.contextDeleted'));
  };

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

  useEffect(() => {
    if (seedQuestion) {
      setActiveTab('insights');
      setQuestion(seedQuestion);
      void ask(seedQuestion);
    }
  }, [seedQuestion, ask]);

  const toggle = async (action: ActionRow, status: 'open' | 'done') => {
    setActions((list) => list.map((a) => (a.id === action.id ? { ...a, status } : a)));
    try {
      await setActionStatus(action.id, status);
      refreshInsights();
    } catch (e) {
      toast('error', (e as Error).message);
      refreshInsights();
    }
  };

  const push = async (action: ActionRow) => {
    setPushing(action.id);
    try {
      const res = await db<{ ref: string; alreadyPushed: boolean }>('push-issue', { id: action.id });
      toast('info', res.alreadyPushed ? t('ext.kb.alreadyPushed', { ref: res.ref }) : t('ext.kb.created', { ref: res.ref }));
      refreshInsights();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setPushing(0);
    }
  };

  const refreshIssues = async () => {
    setSyncingIssues(true);
    try {
      const res = await db<{ checked: number; changed: number; failed: string[] }>('refresh-issues');
      toast(
        res.failed.length ? 'error' : 'success',
        `${res.checked} issue dicek, ${res.changed} status diperbarui` +
          (res.failed.length ? `, ${res.failed.length} gagal` : ''),
      );
      refreshInsights();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSyncingIssues(false);
    }
  };

  const visibleActions = showDone ? actions : actions.filter((a) => a.status === 'open');

  return (
    <div className="kb">
      <nav className="kb-header-nav" aria-label={t('ext.kb.contextTitle')}>
        <button
          type="button"
          className={`kb-tab-btn ${activeTab === 'contexts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contexts')}
        >
          {t('ext.kb.tabContexts')}
        </button>
        <button
          type="button"
          className={`kb-tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          {t('ext.kb.tabInsights')}
        </button>
      </nav>

      {activeTab === 'contexts' ? (
        <section className="kb-contexts-section">
          <div className="kb-contexts-header">
            <div>
              <h2 className="section-label">{t('ext.kb.contextTitle')}</h2>
              <p className="hint">{t('ext.kb.contextDesc')}</p>
            </div>
            <button
              type="button"
              className={isEditing ? 'kb-add-btn dim' : 'kb-add-btn primary'}
              onClick={() => {
                if (isEditing) {
                  setIsEditing(false);
                  setEditingId(null);
                } else {
                  setFormTerm('');
                  setFormDef('');
                  setFormSelectedTags([]);
                  setCustomTagInput('');
                  setEditingId(null);
                  setIsEditing(true);
                }
              }}
            >
              {isEditing ? t('ext.kb.cancel') : t('ext.kb.addContext')}
            </button>
          </div>

          {isEditing && (
            <form className="kb-context-form" onSubmit={handleSaveContext}>
              <h3 className="form-title">
                {editingId ? t('ext.kb.editContext') : t('ext.kb.addContext')}
              </h3>
              <label className="field">
                <span>{t('ext.kb.term')}</span>
                <input
                  type="text"
                  required
                  value={formTerm}
                  placeholder={t('ext.kb.termPlaceholder')}
                  onChange={(e) => setFormTerm(e.target.value)}
                />
              </label>

              <div className="field kb-tag-selector">
                <span>{t('ext.kb.tags')}</span>

                {allTags.length > 0 && (
                  <div className="kb-ref-tags-box">
                    <span className="kb-ref-tags-hint">{t('ext.kb.selectExistingTags')}</span>
                    <div className="kb-ref-tag-pills">
                      {allTags.map((tag) => {
                        const selected = selectedTagSet.has(tag.toLowerCase());
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`ref-tag-pill ${selected ? 'selected' : ''}`}
                            onClick={() => toggleTag(tag)}
                          >
                            <span>#{tag}</span>
                            {selected && <span className="ref-tag-check">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="kb-tag-input-row">
                  <input
                    type="text"
                    className="kb-new-tag-input"
                    value={customTagInput}
                    placeholder={t('ext.kb.tagsPlaceholder')}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addCustomTag();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="kb-add-tag-btn"
                    onClick={addCustomTag}
                  >
                    {t('ext.kb.addTag')}
                  </button>
                </div>

                {formSelectedTags.length > 0 && (
                  <div className="kb-selected-tags-row">
                    <span className="kb-selected-tags-label">{t('ext.kb.selectedTags')}:</span>
                    <div className="kb-selected-pills">
                      {formSelectedTags.map((tag) => (
                        <span key={tag} className="selected-tag-pill">
                          #{tag}
                          <button
                            type="button"
                            className="remove-tag-btn"
                            onClick={() => removeTag(tag)}
                            aria-label={t('ext.kb.removeTag', { tag })}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <label className="field">
                <span>{t('ext.kb.definition')}</span>
                <textarea
                  required
                  rows={3}
                  value={formDef}
                  placeholder={t('ext.kb.definitionPlaceholder')}
                  onChange={(e) => setFormDef(e.target.value)}
                />
              </label>
              <div className="subbar">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditingId(null);
                  }}
                >
                  {t('ext.kb.cancel')}
                </button>
                <button className="primary" type="submit">
                  {t('ext.kb.saveContext')}
                </button>
              </div>
            </form>
          )}

          <div className="kb-filter-row">
            <div className="kb-tag-pills">
              <button
                type="button"
                className={`tag-pill ${activeTag === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTag('all')}
              >
                #{t('ext.kb.allTags')}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`tag-pill ${activeTag === tag ? 'active' : ''}`}
                  onClick={() => setActiveTag(activeTag === tag ? 'all' : tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="kb-search-input"
              value={search}
              placeholder={t('ext.kb.searchContexts')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredContexts.length === 0 ? (
            <p className="section-empty">
              {contexts.length === 0 ? t('ext.kb.noContexts') : t('ext.kb.noMatchingContexts')}
            </p>
          ) : (
            <div className="kb-context-grid">
              {filteredContexts.map((ctx) => (
                <article
                  key={ctx.id}
                  className="kb-context-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleEdit(ctx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEdit(ctx);
                    }
                  }}
                >
                  <div className="ctx-card-head">
                    <div className="ctx-term-wrap">
                      <span className="ctx-term">{ctx.term}</span>
                      <span className="ctx-hover-hint">
                        <span>✎</span>
                        <span>{t('ext.kb.clickToEdit')}</span>
                      </span>
                    </div>
                    <div className="ctx-tags">
                      {ctx.tags.map((tg) => (
                        <span key={tg} className="ctx-tag-pill">
                          #{tg}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="ctx-def">{ctx.definition}</p>
                  <div className="ctx-card-actions">
                    <button
                      type="button"
                      className="ctx-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(ctx);
                      }}
                    >
                      {t('ext.kb.edit')}
                    </button>
                    <button
                      type="button"
                      className="ctx-btn danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(ctx.id);
                      }}
                    >
                      {t('ext.kb.deleteContext')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="kb-insights-wrap">
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
                {story?.overdueActions?.length
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
              {story?.revisions?.length ? (
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
              {story?.events?.length ? (
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
      )}
    </div>
  );
}
