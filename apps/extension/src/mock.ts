/**
 * Standalone dev mock for localhost preview (Vite dev server).
 *
 * Automatically polyfills `window.chrome` APIs when running outside an extension
 * context (e.g., http://localhost:5173). Persists to `localStorage` and seeds
 * sample meeting data with transcript, summary, action items, and diagram so UI
 * components can be previewed and styled with instant HMR.
 */

import type { AnalysisRecord, Entry, MeetingMeta } from '@meetcc/shared';

const STORAGE_KEY = 'meetcc_dev_storage';

function createInitialStorage(): Record<string, unknown> {
  const now = Date.now();
  const m1Id = 'meet/arch-sync-2026';
  const m2Id = 'meet/product-ui-revamp';

  const m1Meta: MeetingMeta = {
    id: m1Id,
    startedAt: new Date(now - 35 * 60 * 1000).toISOString(),
    lastSeenAt: new Date(now - 5 * 60 * 1000).toISOString(),
  };

  const m1Entries: Entry[] = [
    {
      speaker: 'Sarah Chen (Lead Architect)',
      text: 'Halo tim, terima kasih sudah hadir. Hari ini kita fokus bahas evaluasi lonjakan latensi di API Gateway saat peak hours kemarin.',
      time: new Date(now - 34 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Alex Rivera (Backend)',
      text: 'Dari pantauan metrik, P95 latency naik sampai 450ms karena connection pool ke database utama overload pas traffic spike.',
      time: new Date(now - 32 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Budi Santoso (DevOps)',
      text: 'Betul, pas dicek ternyata query baca laporan analitik masih diarahkan ke primary DB alih-alih read replica.',
      time: new Date(now - 30 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Maya Lin (Product)',
      text: 'Dampaknya kemarin beberapa user sempat checkout timeout sekitar 2-3 menit ya?',
      time: new Date(now - 28 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Sarah Chen (Lead Architect)',
      text: 'Iya Maya. Solusi jangka pendek kita pisahkan query read/write di level ORM dan pasang Redis caching buat token auth.',
      time: new Date(now - 26 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Alex Rivera (Backend)',
      text: 'Siap, bagian read-write splitting di repository layer bisa saya handle target selesai Jumat ini.',
      time: new Date(now - 24 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Budi Santoso (DevOps)',
      text: 'Untuk Redis cluster dan dashboard monitoring di Grafana saya setup sebelum Rabu besok.',
      time: new Date(now - 22 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Sarah Chen (Lead Architect)',
      text: 'Mantap. Sebelum rilis production Selasa depan, kita load test dulu di staging ya.',
      time: new Date(now - 20 * 60 * 1000).toISOString(),
    },
  ];

  const m1Analysis: AnalysisRecord = {
    status: 'done',
    provider: 'gemini',
    generatedAt: new Date(now - 15 * 60 * 1000).toISOString(),
    analysis: {
      executiveSummary:
        'Tim mengevaluasi lonjakan latensi P95 di API Gateway akibat bottleneck database utama saat jam sibuk. Disepakati implementasi pemisahan read/write replica pada DataSource layer serta caching token otentikasi di Redis cluster.',
      timeline: [
        { time: '14:00', topic: 'Evaluasi lonjakan latensi API Gateway saat peak hours' },
        { time: '14:10', topic: 'Investigasi database connection pool & pemakaian read replica' },
        { time: '14:20', topic: 'Keputusan arsitektur: Read/Write Splitting & Redis Session Cache' },
        { time: '14:30', topic: 'Action item dan jadwal pengujian staging' },
      ],
      keyDiscussions: [
        'Latensi P95 mencapai 450ms saat pool koneksi DB utama jenuh.',
        'Query baca laporan analitik belum diisolasi ke database replika.',
        'Perlu validasi beban (load test) di environment staging sebelum rilis production.',
      ],
      decisions: [
        {
          what: 'Implementasi Read/Write Splitting di DataSource layer',
          why: 'Menghilangkan beban query baca berat dari database utama agar latensi kembali < 100ms',
          rejected: ['Vertical scaling DB utama (biaya tinggi dan tidak menyelesaikan akar masalah)'],
          topic: 'Database Architecture',
        },
        {
          what: 'Redis Caching untuk validasi token sesi auth',
          why: 'Memangkas 60% pemanggilan query auth berulang ke database',
          rejected: ['In-memory local cache per instance (isu inkonsistensi saat rolling deployment)'],
          topic: 'Gateway Caching',
        },
      ],
      actionItems: [
        { task: 'Konfigurasi routing read replica di repository backend', owner: 'Alex Rivera', due: 'Jumat, 2 Okt 2026' },
        { task: 'Setup Redis cluster & alert monitoring di Grafana', owner: 'Budi Santoso', due: 'Rabu, 30 Sep 2026' },
        { task: 'Eksekusi end-to-end load testing di staging', owner: 'Sarah Chen', due: 'Senin, 5 Okt 2026' },
      ],
      risks: [
        'Potensi replication lag pada data transaksi baru yang langsung dibaca user.',
      ],
      openQuestions: [
        'Berapa TTL cache yang optimal untuk token auth tanpa mengorbankan keamanan?',
      ],
      nextSteps: [
        'Merge PR routing read replica',
        'Uji coba di staging dan monitoring metrik Grafana',
      ],
      diagrams: [
        {
          title: 'Arsitektur Read/Write Splitting & Caching',
          type: 'flowchart',
          mermaid:
            'graph TD\n  Client[API Client] --> Gateway[API Gateway]\n  Gateway --> Auth[Redis Session Cache]\n  Gateway --> Service[Backend Service]\n  Service -->|Writes| Primary[(Primary DB)]\n  Service -->|Reads| Replica[(Read Replica)]',
        },
      ],
    },
  };

  const m2Meta: MeetingMeta = {
    id: m2Id,
    startedAt: new Date(now - 120 * 60 * 1000).toISOString(),
    lastSeenAt: new Date(now - 80 * 60 * 1000).toISOString(),
  };

  const m2Entries: Entry[] = [
    {
      speaker: 'Maya Lin (Product)',
      text: 'Halo semua, sesi ini kita mulai kick off perombakan tampilan dashboard extension biar lebih bersih dan modern.',
      time: new Date(now - 119 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Sarah Chen (Lead Architect)',
      text: 'Bagus banget, kita sekalian siapin standalone dev mode biar tim frontend bisa styling langsung di localhost tanpa perlu bikin zip ekstensi.',
      time: new Date(now - 115 * 60 * 1000).toISOString(),
    },
    {
      speaker: 'Alex Rivera (Backend)',
      text: 'Setuju, integrasi HMR bikin iterasi styling tombol, tabs, dan layout jauh lebih cepet.',
      time: new Date(now - 110 * 60 * 1000).toISOString(),
    },
  ];

  const m2Analysis: AnalysisRecord = {
    status: 'done',
    provider: 'gemini',
    generatedAt: new Date(now - 75 * 60 * 1000).toISOString(),
    analysis: {
      executiveSummary:
        'Kickoff inisiatif redesain UI extension Companion dan implementasi standalone development mock di localhost.',
      timeline: [
        { time: '10:00', topic: 'Review feedback desain UI lama' },
        { time: '10:25', topic: 'Rencana implementasi standalone preview mode' },
      ],
      keyDiscussions: [
        'Tampilan tab summary dan sidebar perlu whitespace yang lebih rapi.',
        'Dukungan localhost preview sangat mempercepat siklus iterasi frontend.',
      ],
      decisions: [
        {
          what: 'Penggunaan standalone dev mock untuk localhost:5173',
          why: 'Mencegah kebutuhan reload manual atau build zip berulang kali saat utak-atik styling',
          rejected: ['Hanya mengandalkan manual chrome extension reload'],
          topic: 'Developer Experience',
        },
      ],
      actionItems: [
        { task: 'Buat mock polyfill chrome.storage di browser', owner: 'Frontend Team', due: 'Hari ini' },
      ],
      risks: [],
      openQuestions: [],
      nextSteps: ['Validasi tampilan di dark & light theme'],
      diagrams: [],
    },
  };

  return {
    theme: 'system',
    lang: 'system',
    [`meta:${m1Id}`]: m1Meta,
    [`title:${m1Id}`]: 'Q3 System Architecture & Performance Review',
    [`context:${m1Id}`]:
      'Quarterly architecture sync reviewing API Gateway latency bottlenecks, database read replicas, and caching strategies.',
    [`transcript:${m1Id}`]: m1Entries,
    [`analysis:${m1Id}`]: m1Analysis,
    [`meta:${m2Id}`]: m2Meta,
    [`title:${m2Id}`]: 'Product UI/UX Revamp & Standalone Mode',
    [`context:${m2Id}`]: 'Kickoff perombakan desain UI Companion dan eksplorasi localhost standalone preview.',
    [`transcript:${m2Id}`]: m2Entries,
    [`analysis:${m2Id}`]: m2Analysis,
  };
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

  // Seed initial data if empty
  if (Object.keys(memory).length === 0) {
    memory = createInitialStorage();
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

  const mockChrome = {
    storage: {
      local: storageLocal,
      onChanged: storageOnChanged,
    },
    runtime: {
      getManifest: () => ({
        name: 'Meet Companion (Dev Preview)',
        version: '1.15.0',
        manifest_version: 3,
      }),
      getURL: (path: string) => `/${path.replace(/^\//, '')}`,
      sendMessage: async (msg: unknown) => {
        console.info('[Dev Mock chrome.runtime.sendMessage]', msg);
        return { ok: true, rows: [] };
      },
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false,
      },
      lastError: undefined,
    },
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
