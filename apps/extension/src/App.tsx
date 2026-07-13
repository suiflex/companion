import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearMeeting,
  isLive,
  loadAnalyses,
  loadMeetings,
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
import { DecisionLog } from './components/DecisionLog';
import { SettingsView } from './components/SettingsView';
import { ToastProvider, useToast } from './toast';

type Tab = 'summary' | 'transcript' | 'diagram' | 'ask' | 'docs';

const TAB_LABELS: Record<Tab, string> = {
  summary: 'Summary',
  transcript: 'Transcript',
  diagram: 'Diagram',
  ask: 'Tanya',
  docs: 'Dokumen',
};
const TABS = Object.keys(TAB_LABELS) as Tab[];

function Shell({ initialMeeting }: { initialMeeting: string | null }) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null); // null = loading
  const [records, setRecords] = useState<Record<string, AnalysisRecord>>({});
  const [selectedId, setSelectedId] = useState<string | null>(initialMeeting);
  const [tab, setTab] = useState<Tab>('summary');
  const [showSettings, setShowSettings] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();

  const refresh = useCallback(() => {
    void loadMeetings().then(setMeetings);
    void loadAnalyses().then(setRecords);
  }, []);

  useEffect(() => {
    refresh();
    const unwatch = watchStorage(refresh);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      unwatch();
      clearInterval(tick);
    };
  }, [refresh]);

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

  const handleDelete = async (id: string) => {
    await clearMeeting(id);
    if (selectedId === id) setSelectedId(null);
    toast('info', `Meeting ${id} dihapus.`);
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
        now={now}
        selectedId={selected?.id ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setShowSettings(false);
          setShowDecisions(false);
        }}
        onSettings={() => {
          setShowSettings(true);
          setShowDecisions(false);
        }}
        onDecisions={() => {
          setShowDecisions(true);
          setShowSettings(false);
        }}
        onDelete={(id) => void handleDelete(id)}
      />
      <main className="main">
        {showSettings ? (
          <SettingsView onClose={() => setShowSettings(false)} />
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
                <h1>{selected.id}</h1>
                {isLive(selected, now) && (
                  <span className="live-pill">
                    <span className="live-dot" />
                    LIVE
                  </span>
                )}
              </div>
              <nav className="tabs" role="tablist" aria-label="Tampilan meeting">
                {TABS.map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    className={`tab ${tab === t ? 'active' : ''}`}
                    onClick={() => setTab(t)}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </nav>
            </header>
            {tab === 'transcript' ? (
              <Transcript
                meeting={selected}
                live={isLive(selected, now)}
                onClear={handleClear}
              />
            ) : tab === 'diagram' ? (
              <DiagramView meeting={selected} diagrams={analysis?.diagrams ?? []} />
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
            <p>Belum ada meeting terekam.</p>
            <p className="empty-hint">
              Join Google Meet — caption nyala otomatis, transcript dan notulen AI
              muncul di sini.
            </p>
          </div>
        )}
      </main>
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
