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

// -- reading status back --
//
// Pushing was one-way: an action closed in Jira stayed "open" in Companion
// forever. The tracker is where the team actually works, so it wins — but only
// when it answers clearly. An unreadable or unrecognised status returns null
// and the local state is left alone rather than guessed at.

/** Status names that mean "finished" across the three trackers' defaults. */
const DONE_NAMES = new Set(['done', 'completed', 'complete', 'closed', 'resolved', 'canceled', 'cancelled', 'selesai']);

interface StatusEndpoint {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  status: (data: Record<string, unknown>) => 'open' | 'done' | null;
}

/** Deep-search a Notion page for the first property that carries a status. */
function notionStatus(data: Record<string, unknown>): 'open' | 'done' | null {
  if (data.archived === true) return 'done';
  const props = data.properties as Record<string, Record<string, unknown>> | undefined;
  for (const prop of Object.values(props ?? {})) {
    if (prop?.type === 'checkbox' && typeof prop.checkbox === 'boolean') {
      return prop.checkbox ? 'done' : 'open';
    }
    const named = (prop?.status ?? prop?.select) as { name?: string } | undefined;
    if (named?.name) return DONE_NAMES.has(named.name.toLowerCase()) ? 'done' : 'open';
  }
  return null;
}

export function buildStatusRequest(config: TrackerConfig, ref: string): StatusEndpoint {
  if (config.provider === 'jira') {
    const base = config.baseUrl.replace(/\/+$/, '');
    return {
      url: `${base}/rest/api/3/issue/${encodeURIComponent(ref)}?fields=status`,
      method: 'GET',
      headers: { Authorization: `Basic ${toBase64(config.token)}`, Accept: 'application/json' },
      status: (d) => {
        const fields = d.fields as { status?: { statusCategory?: { key?: string }; name?: string } } | undefined;
        // statusCategory is the workflow-independent one: 'new' | 'indeterminate' | 'done'
        const category = fields?.status?.statusCategory?.key;
        if (category) return category === 'done' ? 'done' : 'open';
        const name = fields?.status?.name;
        return name ? (DONE_NAMES.has(name.toLowerCase()) ? 'done' : 'open') : null;
      },
    };
  }

  if (config.provider === 'linear') {
    return {
      url: 'https://api.linear.app/graphql',
      method: 'POST',
      headers: { Authorization: config.token, 'Content-Type': 'application/json' },
      body: { query: 'query($id: String!) { issue(id: $id) { state { type } } }', variables: { id: ref } },
      status: (d) => {
        const data = d.data as { issue?: { state?: { type?: string } } } | undefined;
        const type = data?.issue?.state?.type;
        if (!type) return null;
        return type === 'completed' || type === 'canceled' ? 'done' : 'open';
      },
    };
  }

  return {
    url: `https://api.notion.com/v1/pages/${encodeURIComponent(ref)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${config.token}`, 'Notion-Version': '2022-06-28' },
    status: notionStatus,
  };
}

/** Current tracker status for one pushed action, or null when unreadable. */
export async function fetchIssueStatus(
  config: TrackerConfig,
  ref: string,
  fetchImpl: typeof fetch = fetch,
): Promise<'open' | 'done' | null> {
  const problem = validateTracker(config);
  if (problem) throw new Error(problem);
  const ep = buildStatusRequest(config, ref);
  const res = await fetchImpl(ep.url, {
    method: ep.method,
    headers: ep.headers,
    ...(ep.body ? { body: JSON.stringify(ep.body) } : {}),
  });
  // a deleted issue is not an error worth stopping a whole refresh for
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${config.provider} menolak (${res.status})`);
  try {
    return ep.status((await res.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}
