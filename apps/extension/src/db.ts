import {
  CompanionStore,
  ingestAll,
  migrationStatus,
  openDatabase,
  type SessionRow,
} from '@meetcc/store';
import { retrieve } from '@meetcc/ai';
import { t } from '@meetcc/shared/i18n';
import {
  buildChronology,
  carryOverFor,
  createIssue,
  detectHighlights,
  draftIssue,
  exportShare,
  fetchIssueStatus,
  importShare,
  fetchGoogleEvents,
  matchEvent,
  normalizeImported,
  parseIcs,
  parseTranscript,
  runSync,
  transcribeAudio,
  type CalendarEvent,
} from '@meetcc/meeting';
import {
  isPortableKey,
  loadSettings,
  makeBackup,
  makeSessionId,
  planRestore,
  readBackup,
  withEntryIds,
  type Entry,
} from '@meetcc/shared';

// The service worker owns the database. OPFS hands out exclusive file access,
// so a second context opening it would fail; the dashboard therefore asks the
// worker over runtime messages (see `dbClient` in the UI). MV3 can suspend the
// worker at any time, so the connection is opened lazily and reopened when it
// is gone (§29) — nothing caches a handle across turns.

let store: CompanionStore | null = null;
let opening: Promise<CompanionStore> | null = null;

export async function getStore(): Promise<CompanionStore> {
  if (store) return store;
  if (!opening) {
    opening = openDatabase()
      .then(({ driver, persistent }) => {
        if (!persistent) {
          console.warn('[MeetCC] database is in-memory this session; index will be rebuilt.');
        }
        store = CompanionStore.open(driver);
        return store;
      })
      .finally(() => {
        opening = null;
      });
  }
  return opening;
}

/** Evidence resolver for the memory index: the transcript lines that best
 *  support an extracted decision / action / question. */
function evidenceFinder(entries: Entry[]) {
  const withIds = withEntryIds(entries);
  return (text: string): string[] => {
    if (!text.trim() || !withIds.length) return [];
    const r = retrieve(withIds, { intent: 'recall', keywords: [text], relatedTerms: [] }, text);
    const best = r.spans.sort((a, b) => b.score - a.score)[0];
    if (!best) return [];
    return withIds.slice(best.start, best.end + 1).map((e) => e.id!).slice(0, 6);
  };
}

/**
 * Rebuild the SQLite index from chrome.storage.local. chrome.storage stays the
 * capture write-path and the rollback copy (§30 Phase 3): this only ever reads
 * from it, so dropping the database and re-running this reproduces the index.
 */
export async function syncIndex(): Promise<ReturnType<typeof ingestAll>> {
  const db = await getStore();
  const all = await chrome.storage.local.get(null);
  const report = ingestAll(db, all, evidenceFinder);
  if (report.mismatched.length) {
    console.warn('[MeetCC] index count mismatch for:', report.mismatched.join(', '));
  }
  return report;
}

/** Live highlight pass over a meeting's newest lines (P2.2). */
export async function refreshHighlights(sessionId: string, entries: Entry[]): Promise<void> {
  const settings = await loadSettings();
  if (!settings.liveHighlights) return;
  const db = await getStore();
  const seen = db.highlights(sessionId);
  const from = seen.length ? Math.max(...seen.map((h) => h.seq)) + 1 : 0;
  for (const h of detectHighlights(entries, from)) {
    db.addHighlight(sessionId, h.seq, h.kind, h.text);
  }
}

export interface DbRequest {
  op: string;
  args?: Record<string, unknown>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/**
 * Read/write operations the dashboard may run. Everything is dispatched by an
 * explicit name — the UI can never send SQL, only an operation from this list.
 */
export async function handleDb(req: DbRequest): Promise<unknown> {
  const db = await getStore();
  const a = req.args ?? {};
  switch (req.op) {
    case 'sync-index':
      return syncIndex();
    case 'migration-status':
      return migrationStatus(db);

    case 'sessions':
      return db.listSessions(a.projectId ? { projectId: str(a.projectId) } : {});
    case 'session':
      return db.getSession(str(a.id));
    case 'set-session-project':
      db.setSessionField(str(a.id), 'project_id', a.projectId ? str(a.projectId) : null);
      return { ok: true };
    case 'set-session-agenda':
      db.setSessionField(str(a.id), 'agenda', str(a.agenda));
      return { ok: true };

    case 'search':
      return db.search(str(a.query), { limit: num(a.limit) || 30, sessionId: a.sessionId ? str(a.sessionId) : undefined });

    case 'decisions':
      return db.decisions({ sessionId: a.sessionId ? str(a.sessionId) : undefined, topic: a.topic ? str(a.topic) : undefined });
    case 'actions':
      return db.actions({
        sessionId: a.sessionId ? str(a.sessionId) : undefined,
        owner: a.owner ? str(a.owner) : undefined,
        status: a.status === 'done' || a.status === 'open' ? a.status : undefined,
      });
    case 'set-action-status':
      db.setActionStatus(num(a.id), a.status === 'done' ? 'done' : 'open');
      return { ok: true };
    case 'questions':
      return db.questions({ sessionId: a.sessionId ? str(a.sessionId) : undefined });
    case 'resolve-question':
      db.resolveQuestion(num(a.id), a.resolvedIn ? str(a.resolvedIn) : null);
      return { ok: true };
    case 'evidence':
      return db.evidenceFor(str(a.entityType), num(a.entityId));

    case 'chronology':
      return buildChronology(db, a.projectId ? { projectId: str(a.projectId) } : {});
    case 'carry-over':
      return carryOverFor(db, str(a.sessionId));
    case 'highlights':
      return db.highlights(str(a.sessionId));

    case 'projects':
      return db.projects();
    case 'save-project':
      db.upsertProject(str(a.id) || `p-${Date.now()}`, str(a.name));
      return db.projects();
    case 'delete-project':
      db.deleteProject(str(a.id));
      return db.projects();

    case 'templates':
      return db.templates(a.kind ? str(a.kind) : undefined);
    case 'save-template':
      db.saveTemplate({
        id: str(a.id) || `t-${Date.now()}`,
        name: str(a.name),
        kind: str(a.kind) || 'analysis',
        instructions: str(a.instructions),
        sections: Array.isArray(a.sections) ? (a.sections as string[]) : [],
      });
      return db.templates();
    case 'delete-template':
      db.deleteTemplate(str(a.id));
      return db.templates();

    case 'push-issue': {
      const settings = await loadSettings();
      const action = db.actions().find((x) => x.id === num(a.id));
      if (!action) throw new Error(t('ext.err.actionNotFound'));
      if (action.externalRef) return { ref: action.externalRef, alreadyPushed: true };
      const ref = await createIssue(
        settings.integrations.tracker,
        draftIssue(action, db.getSession(action.sessionId)),
      );
      db.setActionExternalRef(action.id, ref);
      return { ref, alreadyPushed: false };
    }

    // Pull the tracker's own status back onto every action already pushed, so
    // an item closed in Jira/Linear/Notion stops showing as open here. One
    // unreadable issue must not abort the rest of the sweep.
    case 'refresh-issues': {
      const settings = await loadSettings();
      const pushed = db.actions().filter((x) => x.externalRef);
      let changed = 0;
      const failed: string[] = [];
      for (const action of pushed) {
        try {
          const status = await fetchIssueStatus(settings.integrations.tracker, action.externalRef as string);
          if (!status || status === action.status) continue;
          db.setActionStatus(action.id, status);
          changed++;
        } catch (e) {
          failed.push(`${action.externalRef}: ${(e as Error).message}`);
        }
      }
      return { checked: pushed.length, changed, failed };
    }

    case 'sync-now': {
      const settings = await loadSettings();
      if (!settings.integrations.sync.enabled) throw new Error(t('ext.err.syncDisabled'));
      return runSync(db, settings.integrations.sync);
    }
    case 'queue-sync':
      db.queueSync(str(a.sessionId), 'upsert');
      return { ok: true };

    case 'export-share':
      return { payload: await exportShare(db, str(a.sessionId), str(a.passphrase), { summaryOnly: !!a.summaryOnly }) };
    case 'import-share':
      return { sessionId: await importShare(db, str(a.payload), str(a.passphrase)) };

    // Audio is transcribed here, not in the dashboard page, so the user's
    // transcription key stays in the worker like every other credential.
    // 25 MB matches what OpenAI-compatible endpoints accept.
    case 'transcribe-audio': {
      const settings = await loadSettings();
      const bytes = Uint8Array.from(atob(str(a.base64)), (c) => c.charCodeAt(0));
      if (bytes.byteLength > 25 * 1024 * 1024) {
        throw new Error(t('ext.err.audioTooLarge'));
      }
      const text = await transcribeAudio(
        new Blob([bytes], { type: str(a.mime) || 'audio/mpeg' }),
        str(a.name) || 'audio.mp3',
        settings.integrations.transcription,
      );
      if (!text.trim()) throw new Error(t('ext.err.emptyTranscription'));
      return handleDb({ op: 'import-transcript', args: { text, title: a.title, startedAt: a.startedAt } });
    }

    case 'import-transcript': {
      const entries = normalizeImported(
        parseTranscript(str(a.text), { startedAt: a.startedAt ? str(a.startedAt) : undefined }),
      );
      if (!entries.length) throw new Error(t('ext.err.noTranscriptLines'));
      const id = makeSessionId(str(a.room) || 'import', Date.parse(entries[0].time) || Date.now());
      // written to chrome.storage too, so an import behaves exactly like a
      // captured meeting for every existing feature (and survives a re-index)
      await chrome.storage.local.set({
        [`transcript:${id}`]: entries,
        [`meta:${id}`]: { id, startedAt: entries[0].time, lastSeenAt: entries[entries.length - 1].time },
        ...(a.title ? { [`title:${id}`]: str(a.title) } : {}),
      });
      db.upsertSession({ id, title: str(a.title), startedAt: entries[0].time, endedAt: entries[entries.length - 1].time });
      db.replaceEntries(id, 'raw', entries);
      return { sessionId: id, entries: entries.length };
    }

    // Speech-to-text without diarization labels everyone "Speaker 1"; only a
    // human can say who that was. chrome.storage is rewritten alongside the
    // index because it stays the source of truth a re-index reads from, so a
    // rename that skipped it would silently revert (§30 Phase 3).
    case 'rename-speaker': {
      const sessionId = str(a.sessionId);
      const from = str(a.from);
      const to = str(a.to).trim();
      if (!to) throw new Error(t('ext.err.emptyName'));
      const moved = db.renameSpeaker(sessionId, from, to);
      const key = `transcript:${sessionId}`;
      const stored = (await chrome.storage.local.get(key))[key] as Entry[] | undefined;
      if (stored?.length) {
        await chrome.storage.local.set({
          [key]: stored.map((e) => (e.speaker === from ? { ...e, speaker: to } : e)),
        });
      }
      return { moved };
    }

    // P2.4: the MCP server runs outside Chrome and cannot open OPFS, so the
    // bridge is an explicit snapshot the user saves and points the server at.
    case 'export-snapshot': {
      const all = await chrome.storage.local.get(null);
      const snapshot: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(all)) {
        // secrets never travel in a snapshot — same rule the backup uses
        if (isPortableKey(key)) snapshot[key] = value;
      }
      return { snapshot };
    }

    // Every meeting in one file. The extension id is pinned now, but it changed
    // once, and storage is scoped to it — so anyone upgrading across that change
    // needs a way to carry their archive over that is not fifty share files.
    case 'export-backup': {
      const all = await chrome.storage.local.get(null);
      return { backup: makeBackup(all, chrome.runtime.getManifest().version) };
    }

    // Additive: a meeting already in this profile wins over the copy in the
    // file, because the live one may carry notes the backup predates. Restoring
    // the same file twice therefore changes nothing.
    case 'import-backup': {
      const backup = readBackup(str(a.text));
      const existing = await chrome.storage.local.get(null);
      const plan = planRestore(existing, backup);
      if (plan.added > 0) {
        await chrome.storage.local.set(plan.writes);
        // chrome.storage is the source of truth; the SQLite index is derived,
        // so it has to be rebuilt or the restored meetings stay unsearchable.
        await syncIndex();
      }
      return { added: plan.added, skipped: plan.skipped, meetings: backup.meetings };
    }

    // P2.5 — Google Calendar with the *user's* OAuth client id. launchWebAuthFlow
    // keeps the token in this call only; nothing is stored and no credential
    // ships with the extension.
    case 'connect-calendar': {
      const settings = await loadSettings();
      const clientId = settings.integrations.calendarClientId.trim();
      if (!clientId) throw new Error(t('ext.err.noCalendarClientId'));
      const redirect = chrome.identity.getRedirectURL('oauth2');
      const auth =
        'https://accounts.google.com/o/oauth2/v2/auth' +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirect)}` +
        '&response_type=token' +
        '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly') +
        '&prompt=consent';
      const responseUrl = await chrome.identity.launchWebAuthFlow({ url: auth, interactive: true });
      const token = new URLSearchParams(new URL(responseUrl ?? '').hash.slice(1)).get('access_token');
      if (!token) throw new Error(t('ext.err.noAccessToken'));

      const sessions = db.listSessions();
      const times = sessions.map((x) => Date.parse(x.startedAt ?? '')).filter(Number.isFinite);
      const from = new Date(times.length ? Math.min(...times) : Date.now() - 30 * 86_400_000).toISOString();
      const to = new Date((times.length ? Math.max(...times) : Date.now()) + 86_400_000).toISOString();
      const events = await fetchGoogleEvents({ accessToken: token }, from, to);
      return handleDb({ op: 'match-calendar', args: { events } });
    }

    case 'match-calendar': {
      const events: CalendarEvent[] = a.ics ? parseIcs(str(a.ics)) : ((a.events as CalendarEvent[]) ?? []);
      const matched: { sessionId: string; eventId: string; title: string }[] = [];
      for (const session of db.listSessions() as SessionRow[]) {
        const event = matchEvent(session, events);
        if (!event) continue;
        db.setSessionField(session.id, 'calendar_event_id', event.id);
        if (event.title && !session.title) db.setSessionField(session.id, 'title', event.title);
        matched.push({ sessionId: session.id, eventId: event.id, title: event.title });
      }
      return { matched };
    }

    default:
      throw new Error(t('ext.err.unknownDbOp', { op: req.op }));
  }
}
