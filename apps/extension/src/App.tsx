import { useCallback, useEffect, useMemo, useState } from 'react';
import { onLangChange, t } from '@meetcc/shared/i18n';
import {
  ANALYSIS_PREFIX,
  META_PREFIX,
  TITLE_PREFIX,
  TRANSCRIPT_PREFIX,
  clearMeeting,
  displayMeetingId,
  isLive,
  loadDashboard,
  saveTitle,
  watchStorage,
  type AnalysisRecord,
  type Meeting,
} from '@meetcc/shared';
import { Sidebar } from './components/Sidebar';
import { Transcript } from './components/Transcript';
import { SummaryView } from './components/SummaryView';
import { DiagramView } from './components/DiagramView';
import { AskView } from './components/AskView';
import { DocGen } from './components/DocGen';
import { CommandPalette } from './components/CommandPalette';
import { KnowledgeView } from './components/KnowledgeView';
import { MeetingHeader } from './components/MeetingHeader';
import { DecisionLog } from './components/DecisionLog';
import { SettingsView } from './components/SettingsView';
import { UpdateBanner } from './components/UpdateBanner';
import { ToastProvider, useToast } from './toast';

type Tab = 'summary' | 'transcript' | 'diagram' | 'ask' | 'docs';

const TAB_LABELS: Record<Tab, Parameters<typeof t>[0]> = {
  summary: 'ext.tab.summary',
  transcript: 'ext.tab.transcript',
  diagram: 'ext.tab.diagram',
  ask: 'ext.tab.ask',
  docs: 'ext.tab.docs',
};
const TABS = Object.keys(TAB_LABELS) as Tab[];

/**
 * Meeting name in the toolbar. Auto-derived from the AI summary when the
 * analysis lands; click to rename. Clearing the field drops the override and
 * falls back to the raw meeting id.
 */
function MeetingTitle({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    setDraft(title);
    setEditing(false);
  }, [id, title]);

  if (editing) {
    const commit = () => {
      setEditing(false);
      void saveTitle(id, draft);
    };
    return (
      <input
        className="title-input"
        autoFocus
        value={draft}
        placeholder={displayMeetingId(id)}
        aria-label={t('ext.meeting.nameLabel')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(title);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <h1>
      <button className="title-btn" title={t('ext.meeting.rename', { id })} onClick={() => setEditing(true)}>
        {title || displayMeetingId(id)}
      </button>
    </h1>
  );
}

function Shell({ initialMeeting }: { initialMeeting: string | null }) {
  // `t()` reads a module-level language, which React cannot see changing, so
  // one subscription at the root re-renders the tree when it does.
  const [, setLangTick] = useState(0);
  useEffect(() => onLangChange(() => setLangTick((n) => n + 1)), []);

  const [meetings, setMeetings] = useState<Meeting[] | null>(null); // null = loading
  const [records, setRecords] = useState<Record<string, AnalysisRecord>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(initialMeeting);
  const [tab, setTab] = useState<Tab>('summary');
  const [showSettings, setShowSettings] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [seedQuestion, setSeedQuestion] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();

  const refresh = useCallback(() => {
    void loadDashboard().then((d) => {
      setMeetings(d.meetings);
      setRecords(d.records);
      setTitles(d.titles);
    });
  }, []);

  useEffect(() => {
    refresh();
    const unwatch = watchStorage(refresh, [
      TRANSCRIPT_PREFIX,
      META_PREFIX,
      ANALYSIS_PREFIX,
      TITLE_PREFIX,
    ]);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    // ⌘K / Ctrl-K opens search from anywhere, including while typing in a view
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      unwatch();
      clearInterval(tick);
      removeEventListener('keydown', onKey);
    };
  }, [refresh]);

  const openMeeting = useCallback((id: string) => {
    setSelectedId(id);
    setShowSettings(false);
    setShowDecisions(false);
    setShowKnowledge(false);
  }, []);

  const selected = useMemo(() => {
    const list = meetings ?? [];
    return (
      list.find((m) => m.id === selectedId) ??
      list.find((m) => isLive(m, now)) ??
      list[0] ??
      null
    );
  }, [meetings, selectedId, now]);

  const selectedRecord = selected ? (records[selected.id] ?? null) : null;
  const analysis = selectedRecord?.status === 'done' ? selectedRecord.analysis : null;

  // Deleting wipes transcript, notulen, chat and documents with no undo, so it
  // always goes through an explicit confirmation naming what is about to go.
  const handleDelete = async (id: string) => {
    const m = (meetings ?? []).find((x) => x.id === id);
    const label = titles[id] || id;
    const lines = m
      ? t('ext.meeting.transcriptLines', { count: m.entries.length })
      : t('ext.meeting.transcriptGeneric');
    const ok = window.confirm(t('ext.meeting.confirmDelete', { label, lines }));
    if (!ok) return;
    await clearMeeting(id);
    // the search index is rebuilt from storage on the next sweep anyway; doing
    // it now means a deleted meeting stops showing up in ⌘K immediately
    void chrome.runtime.sendMessage({ type: 'db', op: 'sync-index' }).catch(() => undefined);
    if (selectedId === id) setSelectedId(null);
    toast('info', t('ext.meeting.deleted', { label }));
  };

  const handleClear = async () => {
    if (selected) await handleDelete(selected.id);
  };

  return (
    <div className="app">
      <Sidebar
        meetings={meetings ?? []}
        loading={meetings === null}
        records={records}
        titles={titles}
        now={now}
        selectedId={selected?.id ?? null}
        onSelect={openMeeting}
        onSettings={() => {
          setShowSettings(true);
          setShowDecisions(false);
          setShowKnowledge(false);
        }}
        onDecisions={() => {
          setShowDecisions(true);
          setShowSettings(false);
          setShowKnowledge(false);
        }}
        onKnowledge={() => {
          setShowKnowledge(true);
          setShowSettings(false);
          setShowDecisions(false);
        }}
        onSearch={() => setPaletteOpen(true)}
        onDelete={(id) => void handleDelete(id)}
      />
      <main className="main">
        <UpdateBanner />
        {showKnowledge ? (
          <KnowledgeView onOpenMeeting={openMeeting} seedQuestion={seedQuestion} />
        ) : showSettings ? (
          <SettingsView onClose={() => setShowSettings(false)} selectedMeeting={selected?.id ?? null} />
        ) : showDecisions ? (
          <DecisionLog
            onClose={() => setShowDecisions(false)}
            onOpenMeeting={(id) => {
              setSelectedId(id);
              setShowDecisions(false);
            }}
          />
        ) : selected ? (
          <>
            <header className="toolbar">
              <div className="toolbar-title">
                <MeetingTitle id={selected.id} title={titles[selected.id] ?? ''} />
                {isLive(selected, now) && (
                  <span className="live-pill">
                    <span className="live-dot" />
                    LIVE
                  </span>
                )}
              </div>
              <nav className="tabs" role="tablist" aria-label={t('ext.meeting.views')}>
                {TABS.map((id) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    className={`tab ${tab === id ? 'active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {t(TAB_LABELS[id])}
                  </button>
                ))}
              </nav>
            </header>
            <MeetingHeader sessionId={selected.id} onOpenMeeting={openMeeting} />
            {tab === 'transcript' ? (
              <Transcript
                meeting={selected}
                live={isLive(selected, now)}
                onClear={handleClear}
              />
            ) : tab === 'diagram' ? (
              <DiagramView
                meeting={selected}
                diagrams={analysis?.diagrams ?? []}
                analysisReady={!!analysis}
              />
            ) : tab === 'ask' ? (
              <AskView meeting={selected} live={isLive(selected, now)} />
            ) : tab === 'docs' ? (
              <DocGen meeting={selected} />
            ) : (
              <SummaryView
                meeting={selected}
                record={selectedRecord}
                live={isLive(selected, now)}
              />
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-glyph">CC</div>
            <p>{t('ext.empty.title')}</p>
            <p className="empty-hint">{t('ext.empty.hint')}</p>
          </div>
        )}
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenMeeting={openMeeting}
        onAskAll={(question) => {
          setSeedQuestion(question);
          setShowKnowledge(true);
          setShowSettings(false);
          setShowDecisions(false);
        }}
      />
    </div>
  );
}

export function App({ initialMeeting }: { initialMeeting: string | null }) {
  return (
    <ToastProvider>
      <Shell initialMeeting={initialMeeting} />
    </ToastProvider>
  );
}
