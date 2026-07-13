export interface Entry {
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
  | { status: 'done'; analysis: Analysis; generatedAt: string; provider: string }
  | { status: 'error'; error: string; failedAt: string; provider: string };

export type ProviderId =
  | 'builtin'
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio'
  | 'azure'
  | 'openrouter'
  | 'custom';

export interface Settings {
  provider: ProviderId;
  apiKey: string; // decrypted in memory; encrypted at rest
  baseUrl: string; // used by ollama / lmstudio / azure / custom
  model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'builtin',
  apiKey: '',
  baseUrl: '',
  model: '',
};

export interface AuditEvent {
  time: string;
  event: string;
  detail: string;
}

/** One turn in a per-meeting "chat with transcript" conversation. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  time: string; // ISO
}

/** On-demand documents generated from a meeting. */
export type DocType = 'brd' | 'prd' | 'notulen';

export interface StoredDoc {
  content: string; // markdown
  generatedAt: string; // ISO
  provider: string;
}

export type MeetingDocs = Partial<Record<DocType, StoredDoc>>;
