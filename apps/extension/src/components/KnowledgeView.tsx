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
import { Button, SegmentedControl, TextArea, TextInput, useToast } from '@meetcc/ui';

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
      <Button className="kb-push" disabled={busy} onClick={onPush} title={t('ext.kb.pushToTracker')}>
          Kirim ke tracker
      </Button>
      )}
    </li>
  );
}

function ContextCardItem({
  ctx,
  onEdit,
  onDelete,
}: {
  ctx: MiniContext;
  onEdit: (ctx: MiniContext) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article
      className="kb-context-card"
      role="button"
      tabIndex={0}
      onClick={() => onEdit(ctx)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(ctx);
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
        <Button
          type="button"
          className="ctx-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(ctx);
          }}
        >
          {t('ext.kb.edit')}
        </Button>
        <Button
          type="button"
          variant="danger"
          className="ctx-btn"
          onClick={(e) => {
            e.stopPropagation();
            void onDelete(ctx.id);
          }}
        >
          {t('ext.kb.deleteContext')}
        </Button>
      </div>
    </article>
  );
}

function RevisionTopicItem({
  topic,
  decisions,
  onOpenMeeting,
}: {
  topic: string;
  decisions: Chronology['revisions'][number]['decisions'];
  onOpenMeeting: (id: string) => void;
}) {
  return (
    <li className="kb-revision">
      <span className="kb-topic">{topic}</span>
      {decisions.map((d, i) => (
        <Button
          key={d.id}
          className={`kb-rev-step ${d.supersededBy ? 'superseded' : ''}`}
          onClick={() => onOpenMeeting(d.sessionId)}
        >
          <span className="kb-rev-index">{i + 1}</span>
          <span>{d.decision}</span>
          {d.reason && <em className="dim"> — {d.reason}</em>}
          {!d.supersededBy && <span className="kb-standing">{t('ext.kb.standing')}</span>}
        </Button>
      ))}
    </li>
  );
}

function appendTagsToSet(set: Set<string>, tags: string[]): void {
  for (let j = 0; j < tags.length; j++) {
    set.add(tags[j].toLowerCase());
  }
}

function extractAllTags(contexts: MiniContext[]): string[] {
  const tagSet = new Set<string>();
  for (let i = 0; i < contexts.length; i++) {
    appendTagsToSet(tagSet, contexts[i].tags);
  }
  return Array.from(tagSet).sort();
}

function hasMatchingTag(tags: string[], target: string): boolean {
  for (let j = 0; j < tags.length; j++) {
    if (tags[j].toLowerCase() === target) return true;
  }
  return false;
}

function tagMatchesQuery(tags: string[], q: RegExp): boolean {
  for (let j = 0; j < tags.length; j++) {
    if (q.test(tags[j])) return true;
  }
  return false;
}

function contextMatchesSearch(c: MiniContext, q: RegExp): boolean {
  if (q.test(c.term)) return true;
  if (q.test(c.definition)) return true;
  return tagMatchesQuery(c.tags, q);
}

function filterContexts(contexts: MiniContext[], tagFilter: string | null, q: RegExp | null): MiniContext[] {
  const results: MiniContext[] = [];
  for (let i = 0; i < contexts.length; i++) {
    const c = contexts[i];
    if (tagFilter && !hasMatchingTag(c.tags, tagFilter)) continue;
    if (q && !contextMatchesSearch(c, q)) continue;
    results.push(c);
  }
  return results;
}

export function KnowledgeView({
  onOpenMeeting,
  onClose,
  seedQuestion,
}: {
  onOpenMeeting: (id: string) => void;
  onClose?: () => void;
  seedQuestion?: string;
}) {
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

  const allTags = useMemo(() => extractAllTags(contexts), [contexts]);

  const filteredContexts = useMemo(() => {
    const rawQ = search.trim();
    const q = rawQ ? new RegExp(rawQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const tagFilter = activeTag === 'all' ? null : activeTag.toLowerCase();
    return filterContexts(contexts, tagFilter, q);
  }, [contexts, activeTag, search]);

  const selectedTagSet = useMemo(() => {
    return new Set(formSelectedTags.map((t) => t.toLowerCase()));
  }, [formSelectedTags]);

  const toggleTag = useCallback((tag: string) => {
    const lower = tag.toLowerCase();
    setFormSelectedTags((prev) =>
      prev.some((t) => t.toLowerCase() === lower)
        ? prev.filter((t) => t.toLowerCase() !== lower)
        : [...prev, tag],
    );
  }, []);

  const addCustomTag = useCallback(() => {
    const trimmed = customTagInput.trim().replace(/^#/, '');
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    setFormSelectedTags((prev) =>
      prev.some((t) => t.toLowerCase() === lower) ? prev : [...prev, trimmed],
    );
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
      if (!tags.some((t) => t.toLowerCase() === extraLower)) {
        tags.push(extra);
      }
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

  // a question handed over from ⌘K runs immediately
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
      <header className="toolbar">
        <div className="toolbar-title">
          <h1>{t('ext.kb.contextTitle')}</h1>
        </div>
        <nav className="tabs">
          <SegmentedControl
            ariaLabel={t('ext.kb.contextTitle')}
            role="tablist"
            options={[
              { value: 'contexts', label: t('ext.kb.tabContexts') },
              { value: 'insights', label: t('ext.kb.tabInsights') },
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as typeof activeTab)}
          />
        </nav>
        {onClose && (
          <Button type="button" onClick={onClose} aria-label={t('ext.header.close')}>
            ✕
          </Button>
        )}
      </header>

      {activeTab === 'contexts' ? (
        <section className="kb-contexts-section">
          <div className="kb-contexts-header">
            <p className="hint">{t('ext.kb.contextDesc')}</p>
            <Button
              type="button"
              variant={isEditing ? 'default' : 'primary'}
              className={isEditing ? 'kb-add-btn dim' : 'kb-add-btn'}
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
            </Button>
          </div>

          {isEditing && (
            <form className="kb-context-form" onSubmit={handleSaveContext}>
              <h3 className="form-title">
                {editingId ? t('ext.kb.editContext') : t('ext.kb.addContext')}
              </h3>
              <label className="field">
                <span>{t('ext.kb.term')}</span>
                <TextInput
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
                          <Button
                            key={tag}
                            type="button"
                            className={`ref-tag-pill ${selected ? 'selected' : ''}`}
                            onClick={() => toggleTag(tag)}
                          >
                            <span>#{tag}</span>
                            {selected && <span className="ref-tag-check">✓</span>}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="kb-tag-input-row">
                  <TextInput
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
                  <Button
                    type="button"
                    className="kb-add-tag-btn"
                    onClick={addCustomTag}
                  >
                    {t('ext.kb.addTag')}
                  </Button>
                </div>

                {formSelectedTags.length > 0 && (
                  <div className="kb-selected-tags-row">
                    <span className="kb-selected-tags-label">{t('ext.kb.selectedTags')}:</span>
                    <div className="kb-selected-pills">
                      {formSelectedTags.map((tag) => (
                        <span key={tag} className="selected-tag-pill">
                          #{tag}
                          <Button
                            type="button"
                            className="remove-tag-btn"
                            onClick={() => removeTag(tag)}
                            aria-label={t('ext.kb.removeTag', { tag })}
                          >
                            ×
                          </Button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <label className="field">
                <span>{t('ext.kb.definition')}</span>
                <TextArea
                  required
                  rows={3}
                  value={formDef}
                  placeholder={t('ext.kb.definitionPlaceholder')}
                  onChange={(e) => setFormDef(e.target.value)}
                />
              </label>
              <div className="subbar">
                <Button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditingId(null);
                  }}
                >
                  {t('ext.kb.cancel')}
                </Button>
                <Button variant="primary" type="submit">
                  {t('ext.kb.saveContext')}
                </Button>
              </div>
            </form>
          )}

            <div className="kb-tag-pills">
              <Button
                type="button"
                className={`tag-pill ${activeTag === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTag('all')}
              >
                #{t('ext.kb.allTags')}
              </Button>
              {allTags.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  className={`tag-pill ${activeTag === tag ? 'active' : ''}`}
                  onClick={() => setActiveTag(activeTag === tag ? 'all' : tag)}
                >
                  #{tag}
                </Button>
              ))}
            </div>
            <TextInput
              type="search"
              className="kb-search-input"
              value={search}
              placeholder={t('ext.kb.searchContexts')}
              onChange={(e) => setSearch(e.target.value)}
            />

          {filteredContexts.length === 0 ? (
            <p className="section-empty">
              {contexts.length === 0 ? t('ext.kb.noContexts') : t('ext.kb.noMatchingContexts')}
            </p>
          ) : (
            <div className="kb-context-grid">
              {filteredContexts.map((ctx) => (
                <ContextCardItem
                  key={ctx.id}
                  ctx={ctx}
                  onEdit={handleEdit}
                  onDelete={(id) => void handleDelete(id)}
                />
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
              <TextArea
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
              <Button variant="primary" type="submit" disabled={asking || !question.trim()}>
                {asking ? '…' : t('ext.kb.ask')}
              </Button>
            </form>

            {answer && (
              <article className="kb-answer">
                <div className="ask-grades">
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
            <Button
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
            </Button>
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
                  <Button className="kb-refresh" disabled={syncingIssues} onClick={() => void refreshIssues()}>
                    {syncingIssues ? t('ext.kb.checkingTracker') : t('ext.kb.pullTracker')}
                  </Button>
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
                    <RevisionTopicItem
                      key={r.topic}
                      topic={r.topic}
                      decisions={r.decisions}
                      onOpenMeeting={onOpenMeeting}
                    />
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
                      <Button className="kb-event" onClick={() => onOpenMeeting(e.sessionId)}>
                        <span className={`kb-event-kind kind-${e.kind}`}>{t(EVENT_LABEL[e.kind])}</span>
                        <span className="kb-event-text">{e.text}</span>
                        <span className="dim">
                          {e.sessionTitle} · {fmtDate(e.at)}
                        </span>
                      </Button>
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
