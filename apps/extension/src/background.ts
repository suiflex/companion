// MV3 service worker: detects finished meetings and runs the AI pipeline.
// Business logic lives in @meetcc/meeting; this file only wires chrome.* in.
import {
  askMeeting,
  cleanTranscript,
  createClient,
  createRateLimiter,
  generateDiagrams,
  validateSettings,
} from '@meetcc/ai';
import { asLangPref, resolveLang, setLang, t } from '@meetcc/shared/i18n';
import {
  askMeetings,
  findExpiredMeetings,
  findFinishedMeetings,
  runDocGen,
  runPipeline,
  type DocGenDeps,
  type PipelineDeps,
  type PipelineOptions,
  type PipelineResult,
} from '@meetcc/meeting';
import { GATE_EVENT, describeGate, gateSummary } from '@meetcc/exporters/gate';
import { obsidianVault } from '@meetcc/exporters/obsidian';
import { loadSettingsForAI } from './lib/aiSettings';
import { makeZip } from './lib/zip';
import { toBridgeBatch } from './lib/bridgeBatch';
import { getStore, handleDb, refreshHighlights, syncIndex } from './db';
import {
  appendAudit,
  AUDIT_RING_MAX,
  clearClean,
  clearDocProgress,
  clearMeeting,
  deriveTitle,
  effectiveClean,
  fetchLatestRelease,
  getAnalysis,
  getTitle,
  loadAnalyses,
  loadAudit,
  loadChat,
  loadClean,
  isLive,
  loadMeetings,
  loadSettings,
  resolveSession,
  sanitizeRoomId,
  saveChat,
  saveClean,
  saveDoc,
  saveDocProgress,
  saveTitle,
  setAnalysis,
  UPDATE_KEY,
  type Analysis,
  type AskResult,
  type ChatMessage,
  type DocType,
  type Meeting,
} from '@meetcc/shared';

// 6 AI runs per 10 minutes: a meeting sweep can never stampede a provider
const limiter = createRateLimiter(6, 10 * 60_000);

// Interactive calls (chat, doc generation) get a separate, roomier budget so
// they never starve the auto-analysis pipeline and vice-versa. Same mechanism.
const interactiveLimiter = createRateLimiter(20, 10 * 60_000);

async function makeInteractiveClient() {
  const settings = await loadSettingsForAI();
  const problem = validateSettings(settings);
  if (problem) throw new Error(problem);
  if (!interactiveLimiter.take()) {
    throw new Error(t('ext.err.rateLimited'));
  }
  return createClient(settings);
}

async function analysisOf(id: string): Promise<Analysis | null> {
  const rec = await getAnalysis(id);
  return rec?.status === 'done' ? rec.analysis : null;
}

// Every AI read of the transcript prefers the cleaned version when the user
// has run "Rapikan" — so summaries, chat and docs use the corrected text.
// Transcript is append-only, so when the same meeting link is reused later the
// raw transcript grows past what was cleaned. Merge: cleaned lines for the part
// that was cleaned + raw lines for anything appended since. This never loses
// new content and still uses the corrections where they exist.
async function loadMeetingForAI(id: string): Promise<Meeting | null> {
  const meeting = (await loadMeetings()).find((m) => m.id === id);
  if (!meeting) return null;
  const clean = await loadClean(id);
  if (clean?.status !== 'done' || !clean.entries.length) return meeting;
  // §26: lines the user rejected fall back to the raw capture, and lines
  // captured after the cleanup ran are appended untouched
  return { ...meeting, entries: effectiveClean(meeting.entries, clean) };
}

// The notification id IS the meeting id, so onClicked can open that meeting.
function notify(title: string, message: string, meetingId: string): void {
  chrome.notifications.create(meetingId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
  });
}

const deps: PipelineDeps = {
  getMeeting: loadMeetingForAI,
  getRecord: getAnalysis,
  setRecord: setAnalysis,
  createClient: async () => {
    const settings = await loadSettingsForAI();
    const problem = validateSettings(settings);
    if (problem) throw new Error(problem);
    if (!limiter.take()) throw new Error(t('ext.err.analysisRateLimited'));
    return createClient(settings);
  },
  audit: appendAudit,
  notify,
  now: () => new Date().toISOString(),
};

/** Run the pipeline and, on success, give the meeting a readable name if it
 *  doesn't have one. A user-set title is never overwritten. */
async function analyze(id: string, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const result = await runPipeline(id, deps, opts);
  if (!result.ok) return result;
  if (await getTitle(id)) return result;
  const analysis = await analysisOf(id);
  const title = analysis ? deriveTitle(analysis) : '';
  if (title) await saveTitle(id, title);
  return result;
}

/** Delete meetings past the user's retention window. Opt-in: `retentionDays`
 *  defaults to 0 (keep forever), and deletion here is irreversible. */
async function enforceRetention(meetings: Meeting[]): Promise<void> {
  const { retentionDays } = await loadSettings();
  const expired = findExpiredMeetings(meetings, retentionDays, Date.now());
  for (const m of expired) {
    await clearMeeting(m.id);
    await getStore()
      .then((db) => db.deleteSession(m.id))
      .catch(() => undefined);
    await appendAudit('retention.delete', `${m.id}: > ${retentionDays} hari`);
  }
}

let sweeping = false;

async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const [meetings, records] = await Promise.all([loadMeetings(), loadAnalyses()]);
    for (const m of findFinishedMeetings(meetings, records, Date.now())) {
      await analyze(m.id);
    }
    await enforceRetention(meetings);
    // Opt-in second delivery target: the desktop vault. Only meetings that have
    // ended — a live one would hand over a note body before there is a summary
    // to put in it, and the vault fills the body once.
    if ((await loadSettings()).desktopBridge) {
      for (const m of meetings) {
        if (isLive(m, Date.now())) continue;
        await deliverToDesktop(m).catch((e) =>
          console.warn('[MeetCC] desktop bridge delivery failed:', e),
        );
      }
    }
    // the index is derived data: rebuilding it from storage is cheap and keeps
    // it correct even if a write was missed while the worker was suspended
    await syncIndex().catch((e) => console.warn('[MeetCC] index sync failed:', e));
    for (const m of meetings) {
      if (isLive(m, Date.now())) {
        await refreshHighlights(m.id, m.entries).catch(() => undefined);
      }
    }
  } finally {
    sweeping = false;
  }
}

// Chromium never auto-updates an unpacked extension, so the dashboard has to
// be told a release exists. Once a day is plenty — the user updates by hand
// anyway, and GitHub's unauthenticated API is rate-limited per IP.
const MANUAL_UPDATE_CHECK = Boolean(chrome.runtime.getManifest().key);

async function checkForUpdate(): Promise<void> {
  const state = await fetchLatestRelease();
  if (state) await chrome.storage.local.set({ [UPDATE_KEY]: state });
}

function scheduleAlarms(): void {
  chrome.alarms.create('sweep', { periodInMinutes: 1 });
  if (MANUAL_UPDATE_CHECK) {
    chrome.alarms.create('update-check', { delayInMinutes: 1, periodInMinutes: 60 * 24 });
  } else {
    void chrome.alarms.clear('update-check');
  }
}

chrome.runtime.onInstalled.addListener(scheduleAlarms);
chrome.runtime.onStartup.addListener(scheduleAlarms);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('sweep')) void sweep();
  if (MANUAL_UPDATE_CHECK && alarm.name === 'update-check') void checkForUpdate();
});

// Dashboard window: one shared popup window, reused/focused if already open.
// focused: true matters — an unfocused window opens behind the (often
// fullscreen) browser on macOS and looks like it never appeared.
const APP_URL = chrome.runtime.getURL('index.html');

async function openDashboard(marker?: string): Promise<void> {
  const url = marker ? `${APP_URL}?${marker}` : APP_URL;
  try {
    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
    for (const w of wins) {
      const tab = w.tabs?.find((t) => t.url?.startsWith(APP_URL));
      if (tab && w.id !== undefined) {
        if (marker && tab.id !== undefined && !tab.url?.includes(marker)) {
          await chrome.tabs.update(tab.id, { url });
        }
        await chrome.windows.update(w.id, { focused: true });
        return;
      }
    }
    await chrome.windows.create({ url, type: 'popup', width: 980, height: 680, focused: true });
  } catch (e) {
    console.warn('[MeetCC] openDashboard window failed, falling back to tab:', e);
    await chrome.tabs.create({ url }).catch(() => undefined);
  }
}

chrome.action.onClicked.addListener(() => void openDashboard());

// The notification id is the meeting id (see `notify`) — open that meeting.
chrome.notifications.onClicked.addListener((notificationId) => {
  void openDashboard(`meeting=${encodeURIComponent(notificationId)}`);
  chrome.notifications.clear(notificationId);
});

// F2: chat with transcript. Runs in the SW so the decrypted API key never
// reaches the dashboard page and every call passes the interactive limiter.
async function handleAsk(
  id: string,
  question: string,
): Promise<{ ok: true; answer: string; result: AskResult } | { ok: false; error: string }> {
  const meeting = await loadMeetingForAI(id);
  if (!meeting) return { ok: false, error: t('ext.err.meetingNotFound') };
  if (!meeting.entries.length) return { ok: false, error: 'Transcript masih kosong.' };
  const history = await loadChat(id);
  // Persist the question before asking, not after answering. A failed call
  // used to take the question with it: the dashboard held it in component
  // state, so leaving the tab lost what was typed with nothing to retry from.
  const asked: ChatMessage[] = [
    ...history,
    { role: 'user', content: question, time: new Date().toISOString() },
  ];
  await saveChat(id, asked);
  const client = await makeInteractiveClient();
  const result = await askMeeting(client, meeting, await analysisOf(id), history, question);
  const turns: ChatMessage[] = [
    ...asked,
    { role: 'assistant', content: result.answer, time: new Date().toISOString(), result },
  ];
  await saveChat(id, turns);
  await appendAudit('ask', `${id} (${result.answerability})`);
  return { ok: true, answer: result.answer, result };
}

// P1.8: Ask across every stored meeting. Retrieval is SQL + FTS5 over the
// local index; only the resulting evidence windows go to the model.
async function handleGlobalAsk(
  question: string,
): Promise<{ ok: true; result: Awaited<ReturnType<typeof askMeetings>> } | { ok: false; error: string }> {
  const client = await makeInteractiveClient();
  const result = await askMeetings(client, await getStore(), question);
  // §32.1 G3 needs the number of *distinct meetings* whose evidence supported
  // the answer. The answer's verified spans are per-meeting windows, so the
  // count comes from the ids those spans belong to — one structured audit
  // field per query, still local-only (no telemetry).
  const sessionsCited = new Set(result.evidence.map((span) => span.sessionId));
  await appendAudit(
    'ask.global',
    `question=${question.slice(0, 60)}; meetingsCited=${sessionsCited.size}; answerability=${result.answerability}`,
  );
  return { ok: true, result };
}

// F4: on-demand document generation (BRD / PRD / notulen). Orchestration and
// the double-submit guard live in @meetcc/meeting (runDocGen); this is only
// the chrome.* wiring, like the pipeline above.
const docGenDeps: DocGenDeps = {
  getMeeting: loadMeetingForAI,
  getAnalysis: analysisOf,
  createClient: makeInteractiveClient,
  saveProgress: saveDocProgress,
  clearProgress: clearDocProgress,
  saveDoc,
  getTemplate: async (templateId) =>
    templateId ? (await getStore()).templates().find((t) => t.id === templateId) : undefined,
  audit: appendAudit,
  now: () => new Date().toISOString(),
};

async function handleGenerateDoc(
  id: string,
  docType: DocType,
  templateId?: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const res = await runDocGen(id, docType, templateId, docGenDeps);
  return res.ok ? res : { ok: false, error: res.error };
}

// F1: on-demand diagram generation. Runs on the cleaned transcript when
// available and merges the diagrams into the existing (done) analysis record,
// so exports and the Diagram tab pick them up. Requires summary to exist.
async function handleGenerateDiagram(
  id: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const rec = await getAnalysis(id);
  if (rec?.status !== 'done') {
    return { ok: false, error: t('ext.err.summaryFirst') };
  }
  const meeting = await loadMeetingForAI(id);
  if (!meeting?.entries.length) return { ok: false, error: 'Transcript masih kosong.' };
  const client = await makeInteractiveClient();
  const diagrams = await generateDiagrams(client, meeting);
  await setAnalysis(id, { ...rec, analysis: { ...rec.analysis, diagrams } });
  await appendAudit('diagram', `${id}: ${diagrams.length}`);
  return { ok: true, count: diagrams.length };
}

// AI transcript cleanup: correct ASR errors on the RAW transcript, store the
// result under clean:<id> (raw stays untouched). One client reused across all
// chunks, so a whole cleanup costs a single interactive-limiter token.
async function handleCleanTranscript(
  id: string,
  fromScratch = false,
): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const meeting = (await loadMeetings()).find((m) => m.id === id);
  if (!meeting) return { ok: false, error: t('ext.err.meetingNotFound') };
  if (!meeting.entries.length) return { ok: false, error: 'Transcript masih kosong.' };

  // resume an interrupted run: reuse partial entries + continue from `done`,
  // unless the user asked to start over (fromScratch)
  const prev = await loadClean(id);
  const resumable =
    !fromScratch &&
    prev?.status === 'processing' &&
    Array.isArray(prev.entries) &&
    prev.entries.length === meeting.entries.length &&
    Number.isFinite(prev.done);
  const base = resumable ? prev.entries : meeting.entries;
  const startLine = resumable ? prev.done : 0;
  const startedAt =
    resumable && prev.startedAt ? prev.startedAt : new Date().toISOString();
  const now = () => new Date().toISOString();

  await saveClean(id, {
    status: 'processing',
    startedAt,
    updatedAt: now(),
    done: startLine,
    total: base.length,
    entries: base,
  });
  try {
    const client = await makeInteractiveClient();
    const { entries, changed } = await cleanTranscript(
      client,
      base,
      async (done, total, partial) => {
        await saveClean(id, {
          status: 'processing',
          startedAt,
          updatedAt: now(),
          done,
          total,
          entries: partial,
        });
      },
      startLine,
    );
    await saveClean(id, { status: 'done', entries, generatedAt: now(), changed });
    await appendAudit('clean', `${id}: ${changed} baris`);
    return { ok: true, changed };
  } catch (e) {
    await clearClean(id); // drop the marker so the button is usable again
    throw e;
  }
}

// P0.1: the content script knows the *room* (the Meet/Teams link); which
// *session* that is depends on what is already stored, so the decision is
// made here — one implementation, shared with the tests, instead of a copy
// of the rule inside content.js.
async function handleResolveSession(raw: string): Promise<{ sessionId: string }> {
  const roomId = sanitizeRoomId(raw);
  if (!roomId) throw new Error(t('ext.err.invalidRoomId'));
  const { sessionId, resumed } = resolveSession(roomId, await loadMeetings(), Date.now());
  if (!resumed) await appendAudit('session.start', `${roomId} -> ${sessionId}`);
  return { sessionId };
}

// §32.1 W4: the gate review reads this device's audit ring as JSON. Local
// download only — the ring never leaves the device (no telemetry, unchanged).
// The per-device §32.1 snapshot (gateSummary) rides along so the review can
// read G1/G2 numbers straight from the file.
async function handleExportAudit(): Promise<{
  ok: true; count: number; json: string;
}> {
  const events = await loadAudit();
  const gate = gateSummary(events, Date.now());
  return {
    ok: true,
    count: events.length,
    json: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        ringMax: AUDIT_RING_MAX,
        count: events.length,
        gate: { ...gate, describe: describeGate(gate) },
        events,
      },
      null,
      2,
    ),
  };
}

// §32.1 W1: whole-vault Obsidian export. Runs in the worker because the
// meeting library lives in chrome.storage (worker-owned), and the audit
// event must record the true number of exported meetings even if the
// dashboard tab dies mid-download.
async function handleExportObsidian(): Promise<{
  ok: true; count: number; base64: string; name: string;
}> {
  const [meetings, records] = await Promise.all([loadMeetings(), loadAnalyses()]);
  const files = obsidianVault(meetings, records);
  if (!files.length) throw new Error(t('ext.err.nothingToExport'));
  const blob = makeZip(files);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  await appendAudit(GATE_EVENT, `meetings=${files.length - 1}`); // minus README
  return {
    ok: true,
    count: files.length - 1,
    base64: btoa(binary),
    name: `companion-vault-${new Date().toISOString().slice(0, 10)}.zip`,
  };
}

// Native-messaging host registered by the desktop installer. Sending to it is
// best-effort: a missing / uninstalled host must never crash the worker or
// block capture, so failures resolve to an `ok:false` and the vault is rebuilt
// from the extension store as before.
const NATIVE_HOST = 'dev.suiflex.companion';

/** One audit line per worker lifetime, not one per meeting per sweep. */
let bridgeErrorLogged = false;

/** How many caption lines of a meeting the vault has already been given. */
const BRIDGE_SENT_KEY = (meetingId: string): string => `bridge:${meetingId}`;

function handleBridgeSend(
  batch: object,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  // lib is ES2022 (no Promise.withResolvers) and sendNativeMessage is
  // executor-callback-based, so the executor form is required here.
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, batch, (res) => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message ?? 'native-host-error' });
      else resolve({ ok: true, data: res });
    });
  });
}

/**
 * Hand a finished meeting to the desktop vault, captions first delivery only
 * carrying the note body.
 *
 * Deliberately incremental: the sweep runs every minute, so re-sending the
 * whole transcript each time would pile duplicates into the sidecar. The
 * counter only advances once the host confirms, and the host dedupes by the
 * operation id, so a lost counter costs a redelivery rather than a duplicate.
 */
async function deliverToDesktop(meeting: Meeting): Promise<void> {
  const key = BRIDGE_SENT_KEY(meeting.id);
  const sent = Number((await chrome.storage.local.get(key))[key] ?? 0);
  if (sent >= meeting.entries.length) return;
  const record = await getAnalysis(meeting.id);
  const batch = toBridgeBatch(meeting, sent, record?.status === 'done' ? record.analysis : null);
  const res = await handleBridgeSend(batch);
  if (!res.ok) {
    // Still never blocks capture — but a silent return was why an enabled
    // bridge could do nothing for weeks with no trace anywhere. Recorded once
    // per worker so a permanently missing host cannot flood the audit log.
    if (!bridgeErrorLogged) {
      bridgeErrorLogged = true;
      await appendAudit('bridge.error', res.error ?? 'native-host-error');
    }
    return; // desktop not installed, or host down — try again next sweep
  }
  bridgeErrorLogged = false;
  await chrome.storage.local.set({ [key]: meeting.entries.length });
  await appendAudit('bridge.send', `${meeting.id}: ${batch.entries.length} baris`);
}

// The worker is its own context: the dashboard applying a language says
// nothing about the errors this file throws. Read it at startup and follow the
// same storage key the UI writes.
const applyStoredLang = (raw: unknown): void =>
  setLang(resolveLang(asLangPref(raw), self.navigator?.languages ?? []));

void chrome.storage.local
  .get('lang')
  .then(({ lang }) => applyStoredLang(lang))
  .catch(() => undefined);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lang) applyStoredLang(changes.lang.newValue);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'db' && typeof msg.op === 'string') {
    handleDb({ op: msg.op, args: msg.args })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'export-obsidian') {
    handleExportObsidian()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'bridge-send' && msg.batch && typeof msg.batch === 'object') {
    handleBridgeSend(msg.batch as object)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'bridge-ping') {
    // The host's reply is irrelevant; what the UI needs is whether the browser
    // could launch it at all, and the error verbatim when it could not.
    handleBridgeSend({ type: 'ping' })
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'export-audit') {
    handleExportAudit()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'global-ask' && typeof msg.question === 'string') {
    handleGlobalAsk(msg.question)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'resolve-session' && typeof msg.roomId === 'string' && msg.roomId) {
    handleResolveSession(msg.roomId)
      .then(sendResponse)
      // a failed lookup must not lose the meeting: fall back to the room id
      .catch(() => sendResponse({ sessionId: sanitizeRoomId(msg.roomId) }));
    return true; // async response
  }
  if (msg?.type === 'meeting-started' && msg.meetingId) {
    void openDashboard(`meeting=${encodeURIComponent(msg.meetingId)}`);
    return;
  }
  if (msg?.type === 'meeting-left') {
    // heartbeat needs ~15s to go stale; sweep shortly after
    setTimeout(() => void sweep(), 20_000);
    chrome.alarms.create('sweep-once', { delayInMinutes: 0.5 });
    return;
  }
  if (msg?.type === 'regenerate' && msg.meetingId) {
    // Asking mid-meeting is allowed — waiting for the meeting to end is not
    // much use to someone who needs the minutes during it. The transcript so
    // far is what gets analysed, and the result is marked provisional so the
    // sweep still writes the real notes afterwards.
    void loadMeetingForAI(msg.meetingId)
      .then((m) => analyze(msg.meetingId, { force: true, provisional: !!m && isLive(m, Date.now()) }))
      .then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'ask' && msg.meetingId && typeof msg.question === 'string') {
    handleAsk(msg.meetingId, msg.question)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'generate-doc' && msg.meetingId && msg.docType) {
    handleGenerateDoc(msg.meetingId, msg.docType as DocType, msg.templateId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'clean-transcript' && msg.meetingId) {
    handleCleanTranscript(msg.meetingId, !!msg.fromScratch)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'generate-diagram' && msg.meetingId) {
    handleGenerateDiagram(msg.meetingId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
});
