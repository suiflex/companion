// MV3 service worker: detects finished meetings and runs the AI pipeline.
// Business logic lives in @meetcc/meeting; this file only wires chrome.* in.
import {
  askTranscript,
  createClient,
  createRateLimiter,
  generateDoc,
  validateSettings,
} from '@meetcc/ai';
import {
  findFinishedMeetings,
  runPipeline,
  type PipelineDeps,
} from '@meetcc/meeting';
import {
  appendAudit,
  getAnalysis,
  loadAnalyses,
  loadChat,
  loadMeetings,
  loadSettings,
  saveChat,
  saveDoc,
  setAnalysis,
  type Analysis,
  type ChatMessage,
  type DocType,
} from '@meetcc/shared';

// 6 AI runs per 10 minutes: a meeting sweep can never stampede a provider
const limiter = createRateLimiter(6, 10 * 60_000);

// Interactive calls (chat, doc generation) get a separate, roomier budget so
// they never starve the auto-analysis pipeline and vice-versa. Same mechanism.
const interactiveLimiter = createRateLimiter(20, 10 * 60_000);

async function makeInteractiveClient() {
  const settings = await loadSettings();
  const problem = validateSettings(settings);
  if (problem) throw new Error(problem);
  if (!interactiveLimiter.take()) {
    throw new Error('Terlalu banyak permintaan AI, tunggu sebentar lalu coba lagi.');
  }
  return createClient(settings);
}

async function analysisOf(id: string): Promise<Analysis | null> {
  const rec = await getAnalysis(id);
  return rec?.status === 'done' ? rec.analysis : null;
}

function notify(title: string, message: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
  });
}

const deps: PipelineDeps = {
  getMeeting: async (id) => (await loadMeetings()).find((m) => m.id === id) ?? null,
  getRecord: getAnalysis,
  setRecord: setAnalysis,
  createClient: async () => {
    const settings = await loadSettings();
    const problem = validateSettings(settings);
    if (problem) throw new Error(problem);
    if (!limiter.take()) throw new Error('Rate limit: terlalu banyak analisis, coba lagi nanti.');
    return createClient(settings);
  },
  audit: appendAudit,
  notify,
  now: () => new Date().toISOString(),
};

let sweeping = false;

async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const [meetings, records] = await Promise.all([loadMeetings(), loadAnalyses()]);
    for (const m of findFinishedMeetings(meetings, records, Date.now())) {
      await runPipeline(m.id, deps);
    }
  } finally {
    sweeping = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sweep', { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('sweep', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('sweep')) void sweep();
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

// F2: chat with transcript. Runs in the SW so the decrypted API key never
// reaches the dashboard page and every call passes the interactive limiter.
async function handleAsk(
  id: string,
  question: string,
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const meeting = (await loadMeetings()).find((m) => m.id === id);
  if (!meeting) return { ok: false, error: 'Meeting tidak ditemukan.' };
  if (!meeting.entries.length) return { ok: false, error: 'Transcript masih kosong.' };
  const history = await loadChat(id);
  const client = await makeInteractiveClient();
  const answer = await askTranscript(client, meeting, await analysisOf(id), history, question);
  const now = new Date().toISOString();
  const turns: ChatMessage[] = [
    ...history,
    { role: 'user', content: question, time: now },
    { role: 'assistant', content: answer, time: new Date().toISOString() },
  ];
  await saveChat(id, turns);
  await appendAudit('ask', id);
  return { ok: true, answer };
}

// F4: on-demand document generation (BRD / PRD / notulen).
async function handleGenerateDoc(
  id: string,
  docType: DocType,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const meeting = (await loadMeetings()).find((m) => m.id === id);
  if (!meeting) return { ok: false, error: 'Meeting tidak ditemukan.' };
  if (!meeting.entries.length) return { ok: false, error: 'Transcript masih kosong.' };
  const client = await makeInteractiveClient();
  const content = await generateDoc(client, meeting, await analysisOf(id), docType);
  await saveDoc(id, docType, {
    content,
    generatedAt: new Date().toISOString(),
    provider: client.provider,
  });
  await appendAudit('docgen', `${id}: ${docType}`);
  return { ok: true, content };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
    runPipeline(msg.meetingId, deps, { force: true }).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'ask' && msg.meetingId && typeof msg.question === 'string') {
    handleAsk(msg.meetingId, msg.question)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
  if (msg?.type === 'generate-doc' && msg.meetingId && msg.docType) {
    handleGenerateDoc(msg.meetingId, msg.docType as DocType)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true; // async response
  }
});
