import type { ActionRow, SessionRow } from '@meetcc/store';

// P2.9 — push action items to the tracker the team already uses. Every
// provider is configured by the user (base URL + token + project/database id);
// nothing is hardcoded and nothing is sent unless the user asks for it.

export type TrackerId = 'jira' | 'linear' | 'notion';

export interface TrackerConfig {
  provider: TrackerId;
  /** Jira: https://your-org.atlassian.net · Linear/Notion: left empty. */
  baseUrl: string;
  /** Jira: "email:api-token" · Linear: API key · Notion: integration secret. */
  token: string;
  /** Jira project key, Linear team id, or Notion database id. */
  target: string;
}

export interface IssueDraft {
  title: string;
  description: string;
  dueDate: string;
  assignee: string;
}

/** ISO date when the AI produced one, otherwise '' — a free-text due like
 *  "minggu depan" is kept in the description instead of being invented. */
export function isoDue(due: string): string {
  const m = due.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

export function draftIssue(action: ActionRow, session: SessionRow | null): IssueDraft {
  const where = session ? `${session.title || session.id}` : action.sessionId;
  const when = session?.startedAt ? new Date(session.startedAt).toLocaleString('id-ID') : '';
  return {
    title: action.task.slice(0, 200),
    description: [
      action.task,
      '',
      `Sumber: rapat ${where}${when ? ` (${when})` : ''}`,
      action.owner ? `Owner (dari rapat): ${action.owner}` : '',
      action.dueAt ? `Due (dari rapat): ${action.dueAt}` : '',
      '',
      'Dibuat otomatis oleh Companion.',
    ]
      .filter((l) => l !== undefined)
      .join('\n'),
    dueDate: isoDue(action.dueAt),
    assignee: action.owner,
  };
}

interface Endpoint {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Where the created issue's human reference lives in the response. */
  ref: (data: Record<string, unknown>) => string;
}

/** Basic-auth encoding for Jira's email:token pair. */
function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildRequest(config: TrackerConfig, draft: IssueDraft): Endpoint {
  if (config.provider === 'jira') {
    const base = config.baseUrl.replace(/\/+$/, '');
    return {
      url: `${base}/rest/api/3/issue`,
      headers: {
        Authorization: `Basic ${toBase64(config.token)}`,
        'Content-Type': 'application/json',
      },
      body: {
        fields: {
          project: { key: config.target },
          summary: draft.title,
          issuetype: { name: 'Task' },
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: draft.description }] }],
          },
          ...(draft.dueDate ? { duedate: draft.dueDate } : {}),
        },
      },
      ref: (d) => String(d.key ?? d.id ?? ''),
    };
  }

  if (config.provider === 'linear') {
    return {
      url: 'https://api.linear.app/graphql',
      headers: { Authorization: config.token, 'Content-Type': 'application/json' },
      body: {
        query:
          'mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }',
        variables: {
          input: {
            teamId: config.target,
            title: draft.title,
            description: draft.description,
            ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
          },
        },
      },
      ref: (d) => {
        const data = d.data as { issueCreate?: { issue?: { identifier?: string } } } | undefined;
        return data?.issueCreate?.issue?.identifier ?? '';
      },
    };
  }

  return {
    url: 'https://api.notion.com/v1/pages',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: {
      parent: { database_id: config.target },
      properties: {
        Name: { title: [{ text: { content: draft.title } }] },
        ...(draft.dueDate ? { Due: { date: { start: draft.dueDate } } } : {}),
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: draft.description } }] },
        },
      ],
    },
    ref: (d) => String(d.id ?? ''),
  };
}

export function validateTracker(config: TrackerConfig): string | null {
  if (!config.token) return 'Token integrasi belum diisi.';
  if (!config.target) return 'Project / team / database id belum diisi.';
  if (config.provider === 'jira') {
    if (!/^https:\/\//.test(config.baseUrl)) return 'Base URL Jira harus https://';
    if (!config.token.includes(':')) return 'Token Jira harus berformat email:api-token.';
  }
  return null;
}

/** Create one issue. Returns the tracker's own reference so it can be stored
 *  on the action item and the same task is never pushed twice. */
export async function createIssue(
  config: TrackerConfig,
  draft: IssueDraft,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const problem = validateTracker(config);
  if (problem) throw new Error(problem);
  const ep = buildRequest(config, draft);
  const res = await fetchImpl(ep.url, {
    method: 'POST',
    headers: ep.headers,
    body: JSON.stringify(ep.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${config.provider} menolak (${res.status}): ${text.slice(0, 200)}`);
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* some trackers answer 200 with an empty body */
  }
  const ref = ep.ref(data);
  if (!ref) throw new Error(`${config.provider} tidak mengembalikan id issue.`);
  return ref;
}
