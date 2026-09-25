/**
 * Standalone dev mock for localhost preview (Vite dev server).
 *
 * Automatically polyfills `window.chrome` APIs when running outside an extension
 * context (e.g., http://localhost:5173). Persists to `localStorage` and seeds
 * sample meeting data with transcript, summary, action items, and diagram so UI
 * components can be previewed and styled with instant HMR.
 */

import type { AnalysisRecord, Diagram, Entry, MeetingMeta } from '@meetcc/shared';
import mockSeedsData from './mockSeeds.json';

const STORAGE_KEY = 'meetcc_dev_storage';

interface MockSeed {
  id: string;
  title: string;
  context: string;
  minutesAgo: number;
  durationMins: number;
  dialogue: { speaker: string; text: string }[];
  summary: string;
  timeline: { time: string; topic: string }[];
  decisions: { what: string; why: string; rejected: string[]; topic: string }[];
  actionItems: { task: string; owner: string; due: string }[];
  diagram?: Diagram;
}

const MOCK_SEEDS: MockSeed[] = mockSeedsData as MockSeed[];

function createDialogueEntries(
  dialogue: { speaker: string; text: string }[],
  minutesAgo: number,
  now: number,
): Entry[] {
  const entries: Entry[] = [];
  for (let idx = 0; idx < dialogue.length; idx++) {
    const d = dialogue[idx];
    entries.push({
      speaker: d.speaker,
      text: d.text,
      time: new Date(now - (minutesAgo - (idx + 1) * 2) * 60 * 1000).toISOString(),
    });
  }
  return entries;
}

function formatDialogueDiscussions(dialogue: { speaker: string; text: string }[]): string[] {
  const discussions: string[] = [];
  for (const d of dialogue) {
    discussions.push(`${d.speaker}: ${d.text}`);
  }
  return discussions;
}

function extractActionTasks(actionItems: { task: string; owner: string; due: string }[]): string[] {
  const tasks: string[] = [];
  for (const a of actionItems) {
    tasks.push(a.task);
  }
  return tasks;
}

function createInitialStorage(): Record<string, unknown> {
  const now = Date.now();
  const storage: Record<string, unknown> = {
    theme: 'system',
    lang: 'system',
  };

  for (const seed of MOCK_SEEDS) {
    const startedAt = new Date(now - seed.minutesAgo * 60 * 1000).toISOString();
    const lastSeenAt = new Date(now - (seed.minutesAgo - seed.durationMins) * 60 * 1000).toISOString();

    const meta: MeetingMeta = {
      id: seed.id,
      startedAt,
      lastSeenAt,
    };

    const entries: Entry[] = createDialogueEntries(seed.dialogue, seed.minutesAgo, now);

    const analysis: AnalysisRecord = {
      status: 'done',
      provider: 'gemini',
      generatedAt: lastSeenAt,
      analysis: {
        executiveSummary: seed.summary,
        timeline: seed.timeline,
        keyDiscussions: formatDialogueDiscussions(seed.dialogue),
        decisions: seed.decisions,
        actionItems: seed.actionItems,
        risks: [],
        openQuestions: [],
        nextSteps: extractActionTasks(seed.actionItems),
        diagrams: seed.diagram ? [seed.diagram] : [],
      },
    };

    storage[`meta:${seed.id}`] = meta;
    storage[`title:${seed.id}`] = seed.title;
    storage[`context:${seed.id}`] = seed.context;
    storage[`transcript:${seed.id}`] = entries;
    storage[`analysis:${seed.id}`] = analysis;
  }

  storage['mini_contexts'] = [
    {
      id: 'ctx-1',
      term: 'P95 Latency',
      definition: 'Target respon 95% request selesai di bawah nilai ini (SLA kita < 200ms).',
      tags: ['infra', 'backend', 'performance'],
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
    },
    {
      id: 'ctx-2',
      term: 'SIEM',
      definition: 'Security Information and Event Management untuk monitoring log & alert anomali.',
      tags: ['security', 'compliance'],
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
    },
    {
      id: 'ctx-3',
      term: 'KMS Rotation',
      definition: 'Rotasi otomatis asymmetric key encryption setiap 90 hari untuk vault storage.',
      tags: ['security', 'infra'],
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
    },
    {
      id: 'ctx-4',
      term: 'CaaS',
      definition: 'Container as a Service (cluster Kubernetes internal tim platform engineering).',
      tags: ['infra', 'devops'],
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
    },
    {
      id: 'ctx-5',
      term: 'KYC',
      definition: 'Know Your Customer: verifikasi identitas nasabah dan pengecekan dokumen resmi.',
      tags: ['fintech', 'compliance'],
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
    },
  ];

  return storage;
}

type StorageChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

function getStorageItem(key: string): string | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* ignore */
  }
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

interface MockActionRecord {
  id: number;
  sessionId: string;
  task: string;
  owner: string;
  dueAt: string;
  status: 'open';
  externalRef: null;
  externalUrl: null;
  createdAt: string;
}

function appendSeedActions(
  seed: MockSeed,
  sIdx: number,
  now: number,
  target: MockActionRecord[],
): void {
  for (let aIdx = 0; aIdx < seed.actionItems.length; aIdx++) {
    const item = seed.actionItems[aIdx];
    target.push({
      id: sIdx * 10 + aIdx + 1,
      sessionId: seed.id,
      task: item.task,
      owner: item.owner,
      dueAt: item.due,
      status: 'open',
      externalRef: null,
      externalUrl: null,
      createdAt: new Date(now - seed.minutesAgo * 60 * 1000).toISOString(),
    });
  }
}

function buildMockActions(seeds: MockSeed[], now: number): MockActionRecord[] {
  const actions: MockActionRecord[] = [];
  for (let sIdx = 0; sIdx < seeds.length; sIdx++) {
    appendSeedActions(seeds[sIdx], sIdx, now, actions);
  }
  return actions;
}

function buildMockEvents(seeds: MockSeed[], now: number) {
  const events = [];
  const topSeeds = seeds.slice(0, 10);
  for (let idx = 0; idx < topSeeds.length; idx++) {
    const s = topSeeds[idx];
    events.push({
      kind: (idx % 2 === 0 ? 'decision' : 'action') as 'decision' | 'action' | 'question' | 'question-resolved',
      at: new Date(now - s.minutesAgo * 60 * 1000).toISOString(),
      sessionId: s.id,
      sessionTitle: s.title,
      text: s.actionItems[0]?.task || s.decisions[0]?.what || s.title,
      entityId: idx + 1,
    });
  }
  return events;
}

function getMockRevisions(now: number) {
  return [
    {
      topic: 'Database Architecture',
      decisions: [
        {
          id: 1,
          sessionId: 'meet/arch-sync-2026',
          topic: 'Database Architecture',
          decision: 'Implementasi Read/Write Splitting di DataSource layer',
          reason: 'Menghilangkan beban query baca berat dari database utama',
          rejected: ['Vertical scaling DB utama'],
          createdAt: new Date(now - 35 * 60 * 1000).toISOString(),
          supersededBy: null,
        },
      ],
    },
    {
      topic: 'Gateway Caching',
      decisions: [
        {
          id: 2,
          sessionId: 'meet/arch-sync-2026',
          topic: 'Gateway Caching',
          decision: 'Redis Caching untuk validasi token sesi auth',
          reason: 'Memangkas 60% pemanggilan query auth berulang ke database',
          rejected: ['In-memory local cache per instance'],
          createdAt: new Date(now - 35 * 60 * 1000).toISOString(),
          supersededBy: null,
        },
      ],
    },
  ];
}

function buildGlobalAskResult(question: string) {
  const now = Date.now();
  return {
    answer: `Berdasarkan 15 rekaman rapat: Terkait pertanyaan "${question}", tim menyepakati implementasi arsitektur Read/Write Splitting DB, token caching Redis, dan standar token WCAG 2.1 AA untuk UI extension.`,
    answerability: 'grounded' as const,
    confidence: 0.94,
    sessions: [
      {
        id: 'meet/arch-sync-2026',
        title: 'Q3 System Architecture & Performance Review',
        startedAt: new Date(now - 35 * 60 * 1000).toISOString(),
      },
      {
        id: 'meet/product-ui-revamp',
        title: 'Product UI/UX Revamp & Standalone Mode',
        startedAt: new Date(now - 120 * 60 * 1000).toISOString(),
      },
    ],
    evidence: [
      {
        sessionId: 'meet/arch-sync-2026',
        speakers: ['Sarah Chen', 'Alex Rivera'],
        preview: 'Solusi jangka pendek kita pisahkan query read/write di DataSource layer dan Redis session cache.',
      },
    ],
  };
}

function handleMockDbOperation(op?: string, args?: Record<string, unknown>) {
  const now = Date.now();
  if (op === 'session') {
    const sid = (args?.id as string) || '';
    return {
      ok: true,
      data: {
        id: sid,
        startedAt: new Date(now - 35 * 60 * 1000).toISOString(),
        endedAt: null,
        durationMs: 35 * 60 * 1000,
        platform: sid.startsWith('teams/') ? 'teams' : 'google-meet',
        participants: ['Sarah Chen', 'Alex Rivera', 'Budi Santoso', 'Maya Lin'],
        projectId: null,
        agenda: '',
      },
    };
  }
  if (op === 'carry-over') {
    return { ok: true, data: { openActions: [], openQuestions: [] } };
  }
  if (op === 'chronology') {
    return {
      ok: true,
      data: {
        events: buildMockEvents(MOCK_SEEDS, now),
        revisions: getMockRevisions(now),
        openQuestions: [],
        openActions: buildMockActions(MOCK_SEEDS, now),
        overdueActions: [],
      },
    };
  }
  if (op === 'actions') {
    return { ok: true, data: buildMockActions(MOCK_SEEDS, now) };
  }
  if (op === 'set-action-status') {
    return { ok: true, data: { ok: true } };
  }
  if (op === 'push-issue') {
    return { ok: true, data: { ref: 'TRACKER-42', alreadyPushed: false } };
  }
  if (op === 'refresh-issues') {
    return { ok: true, data: { checked: 3, changed: 0, failed: [] } };
  }
  return { ok: true, data: [] };
}

async function handleMockRuntimeMessage(msg: unknown): Promise<unknown> {
  console.info('[Dev Mock chrome.runtime.sendMessage]', msg);
  const m = msg as { type?: string; op?: string; args?: Record<string, unknown>; question?: string } | undefined;
  if (m?.type === 'db') {
    return handleMockDbOperation(m.op, m.args);
  }
  if (m?.type === 'global-ask') {
    return {
      ok: true,
      result: buildGlobalAskResult(m.question || ''),
    };
  }
  return { ok: true, data: [] };
}

function createMockRuntime() {
  return {
    getManifest: () => ({
      name: 'Meet Companion (Dev Preview)',
      version: '1.15.0',
      manifest_version: 3,
    }),
    getURL: (path: string) => `/${path.replace(/^\//, '')}`,
    sendMessage: handleMockRuntimeMessage,
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
      hasListener: () => false,
    },
    lastError: undefined,
  };
}

function createMockChrome(
  storageLocal: {
    get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string | string[]) => Promise<void>;
    clear: () => Promise<void>;
  },
  storageOnChanged: {
    addListener: (callback: StorageChangeListener) => void;
    removeListener: (callback: StorageChangeListener) => void;
    hasListener: (callback: StorageChangeListener) => boolean;
  },
) {
  return {
    storage: {
      local: storageLocal,
      onChanged: storageOnChanged,
    },
    runtime: createMockRuntime(),
    permissions: {
      contains: async () => true,
      request: async () => true,
    },
    identity: {
      getRedirectURL: () => 'http://localhost:5173/oauth2',
      launchWebAuthFlow: async () => 'http://localhost:5173/oauth2#token=mock',
    },
    action: {
      onClicked: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    notifications: {
      create: () => {},
      clear: () => {},
      onClicked: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
  };
}

function setupMock(): void {
  if (typeof window === 'undefined') return;

  // If chrome.storage is already available (e.g. running inside real Chrome Extension), do nothing.
  if (window.chrome?.storage?.local) return;

  let memory: Record<string, unknown> = {};

  const raw = getStorageItem(STORAGE_KEY);
  if (raw) {
    try {
      memory = JSON.parse(raw);
    } catch {
      /* fallback to empty memory */
    }
  }

  // Seed initial data if empty or has fewer than 25 meetings
  const meetingCount = Object.keys(memory).filter((k) => k.startsWith('meta:')).length;
  if (meetingCount < 25) {
    const initial = createInitialStorage();
    memory = { ...initial, ...memory };
    setStorageItem(STORAGE_KEY, JSON.stringify(memory));
  } else if (!memory['mini_contexts'] || (Array.isArray(memory['mini_contexts']) && memory['mini_contexts'].length === 0)) {
    const initial = createInitialStorage();
    memory['mini_contexts'] = initial['mini_contexts'];
    setStorageItem(STORAGE_KEY, JSON.stringify(memory));
  }

  const listeners = new Set<StorageChangeListener>();

  const persist = () => {
    setStorageItem(STORAGE_KEY, JSON.stringify(memory));
  };

  const notify = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
    for (const listener of listeners) {
      try {
        listener(changes, 'local');
      } catch (err) {
        console.error('[Dev Mock] listener error:', err);
      }
    }
  };

  const storageLocal = {
    get: async (
      keys?: string | string[] | Record<string, unknown> | null,
    ): Promise<Record<string, unknown>> => {
      if (keys === null || keys === undefined) {
        return { ...memory };
      }
      if (typeof keys === 'string') {
        return { [keys]: memory[keys] };
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (k in memory) out[k] = memory[k];
        }
        return out;
      }
      if (typeof keys === 'object') {
        const out: Record<string, unknown> = { ...keys };
        for (const k of Object.keys(keys)) {
          if (k in memory) out[k] = memory[k];
        }
        return out;
      }
      return {};
    },

    set: async (items: Record<string, unknown>): Promise<void> => {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: memory[k], newValue: v };
        memory[k] = v;
      }
      persist();
      notify(changes);
    },

    remove: async (keys: string | string[]): Promise<void> => {
      const arr = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const k of arr) {
        if (k in memory) {
          changes[k] = { oldValue: memory[k], newValue: undefined };
          delete memory[k];
        }
      }
      persist();
      notify(changes);
    },

    clear: async (): Promise<void> => {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(memory)) {
        changes[k] = { oldValue: v, newValue: undefined };
      }
      memory = {};
      persist();
      notify(changes);
    },
  };

  const storageOnChanged = {
    addListener: (callback: StorageChangeListener) => {
      listeners.add(callback);
    },
    removeListener: (callback: StorageChangeListener) => {
      listeners.delete(callback);
    },
    hasListener: (callback: StorageChangeListener) => listeners.has(callback),
  };

  const mockChrome = createMockChrome(storageLocal, storageOnChanged);

  // Assign to window.chrome
  const win = window as unknown as { chrome?: typeof mockChrome; __resetDevData?: () => void };
  win.chrome = {
    ...(win.chrome ?? {}),
    ...mockChrome,
  } as typeof mockChrome;

  win.__resetDevData = () => {
    removeStorageItem(STORAGE_KEY);
    window.location.reload();
  };

  console.info(
    '%c[Meet Companion]%c Standalone localhost dev mock active! Call %c__resetDevData()%c to reset dummy meetings.',
    'color: #46e394; font-weight: bold;',
    'color: inherit;',
    'color: #eec26a; font-family: monospace;',
    'color: inherit;',
  );
}

setupMock();
