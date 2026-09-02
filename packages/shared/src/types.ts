export interface Entry {
  /** Stable within a meeting: `E<n>` by position (see `withEntryIds`).
   *  Derived on read rather than stored, so old transcripts get ids too. */
  id?: string;
  speaker: string;
  avatar?: string;
  text: string;
  time: string; // ISO
}

export interface MeetingMeta {
  id: string;
  startedAt: string;
  lastSeenAt: string; // heartbeat, every 5s while in-call
}

export interface Meeting {
  id: string;
  meta: MeetingMeta | null;
  entries: Entry[];
}

export interface ActionItem {
  task: string;
  owner: string;
  due: string;
}

export interface TimelineItem {
  time: string;
  topic: string;
}

/** An enriched decision — traceable across meetings (F3 decision log). */
export interface Decision {
  what: string;
  why: string;
  rejected: string[];
  topic: string;
}

/** Diagram types the AI may emit — kept narrow so we can validate output. */
export type DiagramType = 'flowchart' | 'sequenceDiagram';

export interface Diagram {
  title: string;
  type: DiagramType;
  /** raw Mermaid source; validated structurally at parse, rendered lazily */
  mermaid: string;
}

export interface Analysis {
  executiveSummary: string;
  timeline: TimelineItem[];
  keyDiscussions: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  risks: string[];
  openQuestions: string[];
  nextSteps: string[];
  /** 0-3 flow/sequence diagrams of processes discussed; [] when none */
  diagrams: Diagram[];
}

export type PipelineStep = 'ai' | 'saving' | 'done';

export type AnalysisRecord =
  | { status: 'processing'; step: PipelineStep; startedAt: string; provider: string }
  /** `provisional` marks a MoM generated while the meeting was still running:
   *  real notes over a partial transcript, replaced automatically once the
   *  meeting ends. */
  | {
      status: 'done';
      analysis: Analysis;
      generatedAt: string;
      provider: string;
      provisional?: boolean;
    }
  | { status: 'error'; error: string; failedAt: string; provider: string };

export type ProviderId =
  | 'builtin'
  | 'openai'
  | 'chatgpt'
  | 'gemini'
  | 'google-codeassist'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio'
  | 'azure'
  | 'openrouter'
  | 'custom';

/** Optional integrations. All of them are off until the user fills them in:
 *  there is no default endpoint and no bundled credential anywhere. */
export interface IntegrationSettings {
  /** Issue tracker for action items (P2.9). */
  tracker: {
    provider: 'jira' | 'linear' | 'notion';
    baseUrl: string;
    token: string; // encrypted at rest
    target: string;
  };
  /** Encrypted sync / team workspace (P2.6-P2.8). */
  sync: {
    enabled: boolean;
    endpoint: string;
    token: string; // encrypted at rest
    workspaceId: string;
    passphrase: string; // encrypted at rest; never leaves the machine
  };
  /** OpenAI-compatible speech-to-text for imported recordings (P2.10). */
  transcription: {
    endpoint: string;
    apiKey: string; // encrypted at rest
    model: string;
  };
  /** Google Calendar OAuth client id supplied by the user (P2.5). */
  calendarClientId: string;
}

export const DEFAULT_INTEGRATIONS: IntegrationSettings = {
  tracker: { provider: 'jira', baseUrl: '', token: '', target: '' },
  sync: { enabled: false, endpoint: '', token: '', workspaceId: '', passphrase: '' },
  transcription: { endpoint: '', apiKey: '', model: 'whisper-1' },
  calendarClientId: '',
};

/** Tokens for a provider the user signed in to instead of pasting a key.
 *  Empty `provider` means nobody is signed in. */
export interface OAuthSettings {
  provider: '' | 'chatgpt' | 'google-codeassist';
  accessToken: string; // encrypted at rest
  refreshToken: string; // encrypted at rest
  /** Epoch ms; 0 when the issuer named no lifetime. */
  expiresAt: number;
  /** ChatGPT only — the `chatgpt-account-id` header. */
  accountId: string;
  /** Code Assist only — the project discovered or provisioned at sign-in. */
  projectId: string;
  /** Code Assist only — the tier that project was resolved on. Kept because it
   *  is what a failed sign-in has to be diagnosed against. */
  tierId: string;
  /** Shown so the user can see which account is connected. */
  email: string;
}

export const DEFAULT_OAUTH: OAuthSettings = {
  provider: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  accountId: '',
  projectId: '',
  tierId: '',
  email: '',
};

/** The two per-provider fields a user edits by hand. */
export interface ProviderConfig {
  model: string;
  baseUrl: string;
}

export interface Settings {
  provider: ProviderId;
  apiKey: string; // decrypted in memory; encrypted at rest
  /** Subscription sign-in, the alternative to `apiKey` for ChatGPT / Google. */
  oauth: OAuthSettings;
  baseUrl: string; // used by ollama / lmstudio / azure / custom
  model: string;
  /** Model and Base URL last used for each provider. `model`/`baseUrl` above
   *  stay the active provider's effective values; this only remembers what the
   *  others were set to, so switching back does not hand the user a blank form
   *  and silently fall through to the preset default. */
  byProvider: Partial<Record<ProviderId, ProviderConfig>>;
  /** Auto-delete meetings older than this many days. 0 = keep forever.
   *  Opt-in only: deletion is irreversible, so the default never removes data. */
  retentionDays: number;
  /** Detect decisions/actions/deadlines while the meeting is still running. */
  liveHighlights: boolean;
  /** Hand finished meetings to Companion Desktop's vault over the native
   *  messaging host. Opt-in: the extension is a complete product on its own,
   *  and without the desktop app installed there is nothing to deliver to. */
  desktopBridge: boolean;
  integrations: IntegrationSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'builtin',
  apiKey: '',
  oauth: DEFAULT_OAUTH,
  baseUrl: '',
  model: '',
  byProvider: {},
  retentionDays: 0,
  liveHighlights: true,
  desktopBridge: false,
  integrations: DEFAULT_INTEGRATIONS,
};

/** Retention choices offered in Settings, in days (0 = off). */
export const RETENTION_OPTIONS = [0, 30, 90, 365] as const;

export interface AuditEvent {
  time: string;
  event: string;
  detail: string;
}

/** AI-corrected transcript, stored beside the raw one (never overwrites it).
 *  A 'processing' marker persists across UI remounts / tab switches so the
 *  "Merapikan…" state survives and the button can't be re-clicked mid-run. */
export type CleanRecord =
  | {
      status: 'processing';
      startedAt: string;
      updatedAt: string; // bumped each batch — staleness = crashed run
      done: number; // lines cleaned so far
      total: number;
      entries: Entry[]; // partial result, so a refresh resumes, not restarts
    }
  | {
      status: 'done';
      entries: Entry[];
      generatedAt: string;
      changed: number;
      /** §26 provenance: line indexes where the user rejected the AI's
       *  correction and kept the raw capture. Downstream AI reads the
       *  effective transcript, so a bad cleanup never silently propagates
       *  into summaries, decisions, Ask answers and documents. */
      kept?: number[];
    };

/** How well the transcript actually supports the answer. "not_found" is a last
 *  resort after retrieval, not the default for anything not stated verbatim. */
export type Answerability = 'explicit' | 'partial' | 'inferred' | 'not_found';

/** What the user is asking for. `advise` answers go beyond the transcript and
 *  the UI must label them as Companion's own analysis, not meeting content. */
export type AskIntent = 'recall' | 'explain' | 'analyze' | 'advise';

/** A contiguous stretch of transcript that supports the answer. Every id here
 *  has been checked against the real transcript — the model cannot invent one. */
export interface EvidenceSpan {
  entryIds: string[];
  startTime: string; // ISO
  endTime: string; // ISO
  speakers: string[];
  /** First line of the span, for a one-glance preview in the UI. */
  preview: string;
}

export interface AskResult {
  answer: string;
  answerability: Answerability;
  intent: AskIntent;
  confidence: number; // 0..1
  evidence: EvidenceSpan[];
  /** What the meeting did NOT settle — shown so "partial" is actionable. */
  missing: string[];
  followUps: string[];
}

/** One turn in a per-meeting "chat with transcript" conversation.
 *  `result` is present on assistant turns produced by Ask Engine v2. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string; // ISO
  result?: AskResult;
}

/** On-demand documents generated from a meeting. */
export type DocType = 'brd' | 'prd' | 'notulen' | 'recap';

export interface StoredDoc {
  content: string; // markdown
  generatedAt: string; // ISO
  provider: string;
}

export type MeetingDocs = Partial<Record<DocType, StoredDoc>>;

/** Live progress of a document being generated — persisted so "Membuat…"
 *  survives a refresh and shows a real percentage. */
export interface DocProgressRecord {
  type: DocType;
  step: number; // completed steps
  total: number;
  label: string;
  startedAt: string;
  updatedAt: string; // stale = crashed run
}
