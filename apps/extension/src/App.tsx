import { useCallback, useEffect, useMemo, useState } from 'react';
import { onLangChange, t } from '@meetcc/shared/i18n';
import {
  ANALYSIS_PREFIX,
  CONTEXT_PREFIX,
  META_PREFIX,
  TITLE_PREFIX,
  TRANSCRIPT_PREFIX,
  clearMeeting,
  displayMeetingId,
  isLive,
  loadDashboard,
  mergeStoredMeetings,
  parseMeetingMergeSelection,
  saveTitle,
  watchStorage,
  type AnalysisRecord,
  type Meeting,
} from '@meetcc/shared';
import { ToastProvider, useToast } from '@meetcc/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Segmented } from './components/Segmented';
import { FileText, MessageSquare, PanelRightClose, PanelRightOpen, Pencil, Video, Workflow } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Transcript } from './components/Transcript';
import { SummaryView } from './components/SummaryView';
import { DiagramView } from './components/DiagramView';
import { AskView } from './components/AskView';
import { DocumentOutputs } from './components/DocGen';
import { CommandPalette } from './components/CommandPalette';
import { KnowledgeView } from './components/KnowledgeView';
import { MeetingHeader } from './components/MeetingHeader';
import { DecisionLog } from './components/DecisionLog';
import { SettingsView } from './components/SettingsView';
import { UpdateBanner } from './components/UpdateBanner';
import { useGenerationScope } from './lib/generationScope';
import { deliverMeetingsToDesktop } from './lib/desktopBulkExport';
import { db } from './lib/db';

type Tab = 'summary' | 'diagram' | 'ask';

const TAB_LABELS: Record<Tab, Parameters<typeof t>[0]> = {
  summary: 'ext.tab.summary',
  diagram: 'ext.tab.diagram',
  ask: 'ext.tab.ask',
};
const TAB_ICONS = {
  summary: FileText,
  diagram: Workflow,
  ask: MessageSquare,
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
      <Input
        className="title-input h-8 max-w-xs text-sm font-semibold"
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
      <Button
        variant="ghost"
        size="sm"
        className="title-btn h-8 px-2 font-bold text-base hover:bg-muted/80 group"
        title={t('ext.meeting.rename', { id })}
        onClick={() => setEditing(true)}
      >
        <span className="title-text truncate max-w-[200px] sm:max-w-xs md:max-w-md">{title || displayMeetingId(id)}</span>
        <Pencil className="size-3.5 text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity ml-1.5 shrink-0" />
      </Button>
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
  const [transcriptOpen, setTranscriptOpen] = useState(true);
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
      CONTEXT_PREFIX,
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
  const timeline = analysis?.timeline ?? [];
  const {
    excludedEntries,
    selectedEntries,
    selectedTimeline,
    indeterminateTimeline,
    toggleEntry,
    toggleTimeline,
  } = useGenerationScope(selected, timeline);

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
  const handleDeleteMeetings = async (ids: string[]): Promise<string[] | null> => {
    const selectedIds = new Set(ids);
    const selectedMeetings = (meetings ?? []).filter((meeting) => selectedIds.has(meeting.id));
    const lines = selectedMeetings.reduce((count, meeting) => count + meeting.entries.length, 0);
    const names = ids
      .map((id) => titles[id] || displayMeetingId(id))
      .slice(0, 5)
      .join('\n');
    const more = ids.length > 5 ? `\n${t('ext.sidebar.moreMeetingNames', { count: ids.length - 5 })}` : '';
    const confirmed = window.confirm(
      t('ext.sidebar.confirmBulkDelete', { count: ids.length, lines, meetingNames: names + more }),
    );
    if (!confirmed) return null;

    const failed: string[] = [];
    let deleted = 0;
    for (const id of ids) {
      try {
        await clearMeeting(id);
        deleted++;
        if (selectedId === id) setSelectedId(null);
      } catch {
        failed.push(id);
      }
    }
    if (deleted) {
      void chrome.runtime.sendMessage({ type: 'db', op: 'sync-index' }).catch(() => undefined);
    }
    if (failed.length) {
      toast('error', t('ext.sidebar.meetingsDeletePartial', { deleted, total: ids.length, failed: failed.length }));
    } else {
      toast('success', t('ext.sidebar.meetingsDeleted', { count: deleted }));
    }
    return failed;
  };
  const handleMergeMeetings = async (ids: string[], targetId: string): Promise<boolean> => {
    try {
      const result = await mergeStoredMeetings(parseMeetingMergeSelection(ids, targetId));
      await db('sync-index');
      setSelectedId(targetId);
      refresh();
      toast(
        'success',
        t('ext.sidebar.meetingsMerged', {
          sources: result.sourceIds.length,
          entries: result.entries,
        }),
      );
      return true;
    } catch (error) {
      toast('error', (error as Error).message);
      return false;
    }
  };
  const handleExportMeetings = async (ids: string[]): Promise<string[]> => {
    const failedIds = await deliverMeetingsToDesktop(ids, (message) =>
      chrome.runtime.sendMessage(message),
    );
    const failed = failedIds.length;
    if (failed) {
      toast(
        'error',
        t('ext.sidebar.meetingsExportPartial', {
          sent: ids.length - failed,
          total: ids.length,
          failed,
        }),
      );
    } else {
      toast('success', t('ext.sidebar.meetingsExported', { count: ids.length }));
    }
    return failedIds;
  };

  const handleClear = async () => {
    if (selected) await handleDelete(selected.id);
  };

  const activeView: 'meeting' | 'knowledge' | 'decisions' | 'settings' =
    showKnowledge
      ? 'knowledge'
      : showSettings
      ? 'settings'
      : showDecisions
      ? 'decisions'
      : 'meeting';

  return (
    <div className="app">
      <Sidebar
        meetings={meetings ?? []}
        loading={meetings === null}
        records={records}
        titles={titles}
        now={now}
        selectedId={activeView === 'meeting' ? (selected?.id ?? null) : null}
        activeView={activeView}
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
        onExportMeetings={handleExportMeetings}
        onDeleteMeetings={handleDeleteMeetings}
        onMergeMeetings={handleMergeMeetings}
      />
      <main className="main">
        <UpdateBanner />
        {showKnowledge ? (
          <KnowledgeView
            onOpenMeeting={openMeeting}
            onClose={() => setShowKnowledge(false)}
            seedQuestion={seedQuestion}
          />
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
              <div className="toolbar-title flex items-center gap-2 min-w-0 flex-1">
                <MeetingTitle id={selected.id} title={titles[selected.id] ?? ''} />
                {isLive(selected, now) && (
                  <Badge
                    variant="outline"
                    className="live-pill gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 text-xs uppercase shrink-0"
                  >
                    <span className="live-dot size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </Badge>
                )}
              </div>
              <nav className="tabs shrink-0">
                <Segmented
                  ariaLabel={t('ext.meeting.views')}
                  role="tablist"
                  options={TABS.map((id) => ({
                    value: id,
                    label: t(TAB_LABELS[id]),
                    icon: TAB_ICONS[id],
                  }))}
                  value={tab}
                  onChange={(value) => setTab(value as typeof tab)}
                />
              </nav>
            </header>
            <MeetingHeader sessionId={selected.id} onOpenMeeting={openMeeting} />
            <div className="meeting-content">
              <div className="meeting-view">
                {tab === 'diagram' ? (
                  <DiagramView
                    meeting={selected}
                    diagrams={analysis?.diagrams ?? []}
                    analysisReady={!!analysis}
                  />
                ) : tab === 'ask' ? (
                  <AskView meeting={selected} live={isLive(selected, now)} />
                ) : (
                  <>
                    <DocumentOutputs
                      meeting={selected}
                      analysis={analysis}
                      selectedTimeline={selectedTimeline}
                      indeterminateTimeline={indeterminateTimeline}
                      onToggleTimeline={toggleTimeline}
                      live={isLive(selected, now)}
                      excludedEntries={excludedEntries}
                    />
                    <SummaryView
                      meeting={selected}
                      record={selectedRecord}
                      live={isLive(selected, now)}
                    />
                  </>
                )}
              </div>
              <aside
                className={`transcript-sidebar ${transcriptOpen ? '' : 'collapsed'}`}
                id="meeting-transcript-sidebar"
              >
                {transcriptOpen ? (
                  <>
                    <div className="transcript-sidebar-header">
                      <strong>{t('ext.tab.transcript')}</strong>
                      <Button
                        type="button"
                        className="transcript-collapse-btn"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('ext.transcript.collapse')}
                        title={t('ext.transcript.collapse')}
                        aria-expanded="true"
                        aria-controls="meeting-transcript-content"
                        onClick={() => setTranscriptOpen(false)}
                      >
                        <PanelRightClose className="size-4" />
                      </Button>
                    </div>
                    <div className="transcript-sidebar-content" id="meeting-transcript-content">
                      <Transcript
                        meeting={selected}
                        live={isLive(selected, now)}
                        onClear={handleClear}
                        selectedEntries={selectedEntries}
                        onToggleEntry={toggleEntry}
                      />
                    </div>
                  </>
                ) : (
                  <Button
                    type="button"
                    className="transcript-expand"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('ext.transcript.expand')}
                    title={t('ext.transcript.expand')}
                    aria-expanded="false"
                    aria-controls="meeting-transcript-content"
                    onClick={() => setTranscriptOpen(true)}
                  >
                    <PanelRightOpen className="size-4" />
                  </Button>
                )}
              </aside>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-glyph">
              <Video className="size-10 text-primary/70" />
            </div>
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
