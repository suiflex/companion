import { useEffect, useRef, useState } from 'react';
import type { BackupFile, IntegrationSettings, Settings } from '@meetcc/shared';
import { db } from '../lib/db';
import { sendMessage } from '../lib/sendMessage';
import { t } from '@meetcc/shared/i18n';
import chromeBadge from '../../../../assets/badges/chrome-web-store.svg';
import firefoxBadge from '../../../../assets/badges/firefox-addon.svg';
import { Button, TextArea, TextInput, useToast } from '@meetcc/ui';

// The panels behind the Settings tabs: optional integrations (P2.5-P2.10),
// custom templates (P2.1) and the data tools (snapshot export for the MCP
// server, transcript import, encrypted share, index rebuild).

type Patch = (patch: Partial<IntegrationSettings>) => void;

/** Files cross the runtime-message boundary as base64: transcription runs in
 *  the worker so the API key never reaches this page. */
async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function downloadText(name: string, text: string | Blob, type = 'application/json'): void {
  const blob = typeof text === 'string' ? new Blob([text], { type }) : text;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Whether the browser can reach the desktop host at all.
 *
 * Delivery is best-effort and never blocks capture, which used to mean an
 * unregistered host looked exactly like a working one: the checkbox stayed
 * ticked and nothing ever arrived. This is the only place that says so.
 */
function BridgeStatus() {
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [detail, setDetail] = useState('');

  const test = async () => {
    setState('testing');
    try {
      await sendMessage({ type: 'bridge-ping' });
      setDetail('');
      setState('ok');
    } catch (e) {
      setDetail((e as Error).message);
      setState('fail');
    }
  };

  return (
    <div className="field bridge-status">
      <div className="subbar">
        <Button type="button" onClick={() => void test()} disabled={state === 'testing'}>
          {state === 'testing' ? t('ext.bridge.testing') : t('ext.bridge.test')}
        </Button>
        {state === 'ok' && <span className="ok">{t('ext.bridge.connected')}</span>}
        {state === 'fail' && <span className="warn">{t('ext.bridge.notConnected')}</span>}
      </div>
      {state === 'fail' && (
        <span className="hint">
          {t('ext.bridge.fixHint', { detail, command: '\u0000' })
            .split('\u0000')
            .flatMap((part, i) =>
              i === 0 ? [part] : [<code key={i}>companion install</code>, part],
            )}
        </span>
      )}
    </div>
  );
}

export function IntegrationsPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const i = settings.integrations;
  const patch: Patch = (p) => onChange({ integrations: { ...i, ...p } });
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await db<{ pushed: string[]; pulled: string[]; failed: { error: string }[] }>('sync-now');
      toast(
        r.failed.length ? 'error' : 'success',
        t('ext.sync.result', { pushed: r.pushed.length, pulled: r.pulled.length }) +
          (r.failed.length
          ? t('ext.sync.failedSuffix', { count: r.failed.length, error: r.failed[0].error })
          : ''),
      );
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <label className="field checkbox-field">
        <input
          type="checkbox"
          checked={settings.liveHighlights}
          onChange={(e) => onChange({ liveHighlights: e.target.checked })}
        />
        <span>{t('ext.integrations.liveHighlights')}</span>
        <span className="hint">{t('ext.integrations.liveHighlightsHint')}</span>
      </label>

      <label className="field checkbox-field">
        <input
          type="checkbox"
          checked={settings.desktopBridge}
          onChange={(e) => onChange({ desktopBridge: e.target.checked })}
        />
        <span>{t('ext.integrations.bridge')}</span>
        <span className="hint">{t('ext.integrations.bridgeHint')}</span>
      </label>

      <BridgeStatus />

      <fieldset className="field-group">
        <legend>{t('ext.tracker.legend')}</legend>
        <label className="field">
          <span>{t('ext.tracker.provider')}</span>
          <select
            value={i.tracker.provider}
            onChange={(e) =>
              patch({ tracker: { ...i.tracker, provider: e.target.value as 'jira' | 'linear' | 'notion' } })
            }
          >
            <option value="jira">Jira</option>
            <option value="linear">Linear</option>
            <option value="notion">Notion</option>
          </select>
        </label>
        {i.tracker.provider === 'jira' && (
          <label className="field">
            <span>{t('ext.tracker.baseUrl')}</span>
            <TextInput
              type="url"
              value={i.tracker.baseUrl}
              placeholder="https://org.atlassian.net"
              onChange={(e) => patch({ tracker: { ...i.tracker, baseUrl: e.target.value } })}
            />
          </label>
        )}
        <label className="field">
          <span>{t('ext.tracker.token')}</span>
          <TextInput type="password"
            autoComplete="off"
            value={i.tracker.token}
            placeholder={i.tracker.provider === 'jira' ? 'email@org.com:api-token' : 'API key'}
            onChange={(e) => patch({ tracker: { ...i.tracker, token: e.target.value } })}
          />
          <span className="hint">{t('ext.tracker.tokenHint')}</span>
        </label>
        <label className="field">
          <span>
            {i.tracker.provider === 'jira'
              ? t('ext.tracker.projectKey')
              : i.tracker.provider === 'linear'
                ? t('ext.tracker.teamId')
                : t('ext.tracker.databaseId')}
          </span>
          <TextInput type="text"
            value={i.tracker.target}
            onChange={(e) => patch({ tracker: { ...i.tracker, target: e.target.value } })}
          />
        </label>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('ext.sync.legend')}</legend>
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={i.sync.enabled}
            onChange={(e) => patch({ sync: { ...i.sync, enabled: e.target.checked } })}
          />
          <span>{t('ext.sync.enable')}</span>
          <span className="hint">
            {t('ext.sync.enableHint', { server: '\u0000' })
              .split('\u0000')
              .flatMap((part, idx) =>
                idx === 0 ? [part] : [<code key={idx}>@meetcc/sync-server</code>, part],
              )}
          </span>
        </label>
        <label className="field">
          <span>{t('ext.sync.endpoint')}</span>
          <TextInput type="url"
            value={i.sync.endpoint}
            placeholder="http://localhost:8787"
            onChange={(e) => patch({ sync: { ...i.sync, endpoint: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>{t('ext.sync.token')}</span>
          <TextInput type="password"
            autoComplete="off"
            value={i.sync.token}
            onChange={(e) => patch({ sync: { ...i.sync, token: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>{t('ext.sync.workspace')}</span>
          <TextInput type="text"
            value={i.sync.workspaceId}
            placeholder="tim-platform"
            onChange={(e) => patch({ sync: { ...i.sync, workspaceId: e.target.value } })}
          />
          <span className="hint">{t('ext.sync.workspaceHint')}</span>
        </label>
        <label className="field">
          <span>{t('ext.sync.passphrase')}</span>
          <TextInput type="password"
            autoComplete="off"
            value={i.sync.passphrase}
            onChange={(e) => patch({ sync: { ...i.sync, passphrase: e.target.value } })}
          />
          <span className="hint">{t('ext.sync.passphraseHint')}</span>
        </label>
        <div className="subbar">
          <Button onClick={() => void syncNow()} disabled={syncing || !i.sync.enabled}>
            {syncing ? t('ext.sync.syncing') : t('ext.sync.now')}
          </Button>
          <span className="hint">{t('ext.sync.saveFirst')}</span>
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('ext.transcription.legend')}</legend>
        <label className="field">
          <span>{t('ext.transcription.endpoint')}</span>
          <TextInput type="url"
            value={i.transcription.endpoint}
            placeholder="https://api.openai.com/v1/audio/transcriptions"
            onChange={(e) => patch({ transcription: { ...i.transcription, endpoint: e.target.value } })}
          />
          <span className="hint">{t('ext.transcription.endpointHint')}</span>
        </label>
        <label className="field">
          <span>{t('ext.transcription.apiKey')}</span>
          <TextInput type="password"
            autoComplete="off"
            value={i.transcription.apiKey}
            onChange={(e) => patch({ transcription: { ...i.transcription, apiKey: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Model</span>
          <TextInput type="text"
            value={i.transcription.model}
            onChange={(e) => patch({ transcription: { ...i.transcription, model: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>{t('ext.integrations.calendarClientId')}</span>
          <TextInput type="text"
            value={i.calendarClientId}
            placeholder="xxxx.apps.googleusercontent.com"
            onChange={(e) => patch({ calendarClientId: e.target.value })}
          />
          <span className="hint">{t('ext.calendar.clientIdHint')}</span>
        </label>
        <div className="subbar">
          <Button
            disabled={!i.calendarClientId.trim()}
            onClick={() =>
              void (async () => {
                try {
                  const r = await db<{ matched: unknown[] }>('connect-calendar');
                  toast('success', t('ext.data.matched', { count: r.matched.length }));
                } catch (e) {
                  toast('error', (e as Error).message);
                }
              })()
            }
          >
            {t('ext.calendar.connect')}
          </Button>
          <span className="hint">{t('ext.calendar.saveFirst')}</span>
        </div>
      </fieldset>
    </>
  );
}

interface Template {
  id: string;
  name: string;
  kind: string;
  instructions: string;
  sections: string[];
}

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [draft, setDraft] = useState<Template>({ id: '', name: '', kind: 'doc', instructions: '', sections: [] });
  const toast = useToast();

  const reload = () => void db<Template[]>('templates').then(setTemplates).catch(() => undefined);
  useEffect(reload, []);

  const save = async () => {
    if (!draft.name.trim() || !draft.instructions.trim()) {
      return toast('error', 'Nama dan instruksi template wajib diisi.');
    }
    try {
      setTemplates(await db<Template[]>('save-template', { ...draft }));
      setDraft({ id: '', name: '', kind: 'doc', instructions: '', sections: [] });
      toast('success', t('ext.templates.saved'));
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <>
      <p className="hint">
        {t('ext.templates.intro')}
      </p>

      <label className="field">
        <span>{t('ext.templates.name')}</span>
        <TextInput type="text"
          value={draft.name}
          placeholder="Notulen retro tim"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('ext.templates.usedFor')}</span>
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
          <option value="doc">{t('ext.templates.kindDoc')}</option>
          <option value="analysis">{t('ext.templates.kindAnalysis')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t('ext.templates.instructions')}</span>
        <TextArea rows={4}
          value={draft.instructions}
          placeholder={t('ext.templates.instructionsPlaceholder')}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('ext.templates.sections')}</span>
        <TextArea rows={3}
          value={draft.sections.join('\n')}
          onChange={(e) => setDraft({ ...draft, sections: e.target.value.split('\n').filter(Boolean) })}
        />
      </label>
      <div className="subbar">
        <span className="spacer" />
        <Button variant="primary" onClick={() => void save()}>
          {draft.id ? 'Perbarui template' : 'Tambah template'}
        </Button>
      </div>

      <ul className="tpl-list">
        {templates.map((tpl) => (
          <li key={tpl.id}>
            <span className="tpl-name">{tpl.name}</span>
            <span className="dim">{tpl.kind}</span>
            <span className="spacer" />
            <Button onClick={() => setDraft(tpl)}>Edit</Button>
            <Button variant="danger"
              onClick={async () => {
                setTemplates(await db<Template[]>('delete-template', { id: tpl.id }));
              }}
            >
              {t('ext.templates.delete')}
            </Button>
          </li>
        ))}
        {!templates.length && <li className="section-empty">{t('ext.templates.empty')}</li>}
      </ul>
    </>
  );
}

export function DataPanel({ selectedMeeting }: { selectedMeeting: string | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const transcriptFile = useRef<HTMLInputElement>(null);
  const icsFile = useRef<HTMLInputElement>(null);
  const shareFile = useRef<HTMLInputElement>(null);
  const backupFile = useRef<HTMLInputElement>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <fieldset className="field-group">
        <legend>{t('ext.data.importMeeting')}</legend>
        <p className="hint">{t('ext.data.importHint')}</p>
        <input
          ref={transcriptFile}
          type="file"
          accept=".vtt,.srt,.txt,text/plain,audio/*,video/mp4"
          aria-label={t('ext.data.transcriptOrAudio')}
        />
        <Button disabled={!!busy}
        onClick={() =>
          void run('import', async () => {
            const file = transcriptFile.current?.files?.[0];
            if (!file) return toast('error', t('ext.data.pickFile'));
            const common = {
              title: file.name.replace(/\.[^.]+$/, ''),
              startedAt: new Date(file.lastModified).toISOString(),
            };
            const isAudio = /^(audio|video)\//.test(file.type);
            const res = isAudio
              ? await db<{ sessionId: string; entries: number }>('transcribe-audio', {
                  ...common,
                  name: file.name,
                  mime: file.type,
                  base64: await toBase64(file),
                })
              : await db<{ sessionId: string; entries: number }>('import-transcript', {
                  ...common,
                  text: await file.text(),
                });
            toast('success', t('ext.data.imported', { count: res.entries, id: res.sessionId }));
          })
        }>{busy === 'import' ? t('ext.data.importing') : t('ext.data.importAction')}</Button>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('ext.data.calendar')}</legend>
        <input ref={icsFile} type="file" accept=".ics,text/calendar" aria-label={t('ext.data.calendarFile')} />
        <Button disabled={!!busy}
        onClick={() =>
          void run('ics', async () => {
            const file = icsFile.current?.files?.[0];
            if (!file) return toast('error', t('ext.data.pickIcs'));
            const res = await db<{ matched: unknown[] }>('match-calendar', { ics: await file.text() });
            toast('success', t('ext.data.matched', { count: res.matched.length }));
          })
        }>{busy === 'ics' ? t('ext.data.matching') : t('ext.data.match')}</Button>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('ext.data.share')}</legend>
        <label className="field">
          <span>{t('ext.data.passphrase')}</span>
          <TextInput
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <span className="hint">{t('ext.data.sharePassphraseHint')}</span>
        </label>
        <div className="subbar">
          <Button disabled={!!busy || !selectedMeeting}
          title={selectedMeeting ? '' : t('ext.data.pickMeetingFirst')}
          onClick={() =>
            void run('share', async () => {
              const res = await db<{ payload: string }>('export-share', {
                sessionId: selectedMeeting,
                passphrase,
              });
              downloadText(`${selectedMeeting}.companion-share`, res.payload, 'text/plain');
              toast('success', t('ext.data.shareDownloaded'));
            })
          }>{t('ext.data.exportSelected')}</Button>
          <input ref={shareFile} type="file" accept=".companion-share" aria-label={t('ext.data.shareFile')} />
          <Button disabled={!!busy}
          onClick={() =>
            void run('unshare', async () => {
              const file = shareFile.current?.files?.[0];
              if (!file) return toast('error', t('ext.data.pickShareFirst'));
              const res = await db<{ sessionId: string }>('import-share', {
                payload: await file.text(),
                passphrase,
              });
              toast('success', t('ext.data.shareImported', { id: res.sessionId }));
            })
          }>{t('ext.data.importShare')}</Button>
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('ext.data.backup')}</legend>
        {/* The emphasis is spliced in as an element rather than shipped as
            markup in the catalogue: no innerHTML, and the sentence around it
            stays one translatable string. */}
        <p className="hint">
          {t('ext.data.backupHint', { not: '\u0000' })
            .split('\u0000')
            .flatMap((part, idx) =>
              idx === 0 ? [part] : [<b key={idx}>{t('ext.data.backupNot')}</b>, part],
            )}
        </p>
        <p className="hint">{t('ext.data.restoreHint')}</p>
        <div className="subbar">
          <Button disabled={!!busy}
          onClick={() =>
            void run('backup', async () => {
              const res = await db<{ backup: BackupFile }>('export-backup');
              const stamp = new Date().toISOString().slice(0, 10);
              downloadText(`companion-backup-${stamp}.json`, JSON.stringify(res.backup));
              toast('success', t('ext.data.backupDownloaded', { count: res.backup.meetings }));
            })
          }>{t('ext.data.downloadBackup')}</Button>
          <input ref={backupFile} type="file" accept=".json" aria-label={t('ext.data.backupFile')} />
          <Button disabled={!!busy}
          onClick={() =>
            void run('restore', async () => {
              const file = backupFile.current?.files?.[0];
              if (!file) return toast('error', t('ext.data.pickBackupFirst'));
              const res = await db<{ added: number; skipped: number; meetings: number }>(
                'import-backup',
                { text: await file.text() },
              );
              toast(
                'success',
                res.added
                  ? t('ext.data.restored', { added: res.added, meetings: res.meetings }) +
                    (res.skipped ? t('ext.data.restoredSkipped', { count: res.skipped }) : '')
                  : t('ext.data.restoredNothing'),
              );
            })
          }>{t('ext.data.restore')}</Button>
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('ext.mcp.legend')}</legend>
        <p className="hint">
          {t('ext.mcp.hint', { command: '\u0000' })
            .split('\u0000')
            .flatMap((part, idx) =>
              idx === 0 ? [part] : [<code key={idx}>companion-mcp snapshot.json</code>, part],
            )}
        </p>
        <div className="subbar">
          <Button disabled={!!busy}
          onClick={() =>
            void run('snapshot', async () => {
              const res = await db<{ snapshot: Record<string, unknown> }>('export-snapshot');
              downloadText('companion-snapshot.json', JSON.stringify(res.snapshot));
              toast('success', t('ext.mcp.snapshotDownloaded'));
            })
          }>{t('ext.mcp.exportSnapshot')}</Button>
          <Button disabled={!!busy}
          onClick={() =>
            void run('reindex', async () => {
              const r = await db<{ sessions: number; entries: number; mismatched: string[] }>('sync-index');
              toast(
                r.mismatched.length ? 'error' : 'success',
                t('ext.mcp.reindexed', { sessions: r.sessions, entries: r.entries }) +
                  (r.mismatched.length
                    ? t('ext.mcp.mismatched', { count: r.mismatched.length })
                    : ''),
              );
            })
          }>{t('ext.mcp.rebuildIndex')}</Button>
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>{t('ext.export.legend')}</legend>
        <p className="hint">
          {t('ext.export.hint')}
        </p>
        <div className="subbar">
          <Button disabled={!!busy}
          onClick={() =>
            void run('obsidian', async () => {
              const res = await sendMessage<{ count: number; base64: string; name: string }>({
                type: 'export-obsidian',
              });
              const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
              downloadText(res.name, new Blob([bytes], { type: 'application/zip' }));
              toast('success', t('ext.export.obsidianDone', { count: res.count, name: res.name }));
            })
          }>{busy === 'obsidian' ? t('ext.export.exporting') : t('ext.export.obsidian')}</Button>
          <Button disabled={!!busy}
          onClick={() =>
            void run('audit', async () => {
              const res = await sendMessage<{ count: number; json: string }>({ type: 'export-audit' });
              downloadText(`companion-audit-${new Date().toISOString().slice(0, 10)}.json`, res.json);
              toast('success', t('ext.export.auditDone', { count: res.count }));
            })
          }>{t('ext.data.exportAudit')}</Button>
        </div>
      </fieldset>
    </>
  );
}

const INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/suiflex/companion/develop/scripts/install.sh | bash';

export function VersionPanel() {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version ?? '0.0.0';
  const toast = useToast();

  const copyTerminalCmd = async () => {
    await navigator.clipboard.writeText(INSTALL_CMD);
    toast('success', t('ext.version.copiedCommand'));
  };

  return (
    <div className="version-panel">
      <div className="version-banner">
        <div className="version-banner-left">
          <span className="version-title-text">{t('ext.version.title')}</span>
          <span className="version-pill">{t('ext.version.current', { version })}</span>
        </div>
        <a
          className="version-release-link"
          href="https://github.com/suiflex/companion/releases"
          target="_blank"
          rel="noreferrer"
        >
          {t('ext.version.downloadReleases')}
        </a>
      </div>

      <div className="version-grid">
        <div className="version-card">
          <div className="version-card-head">
            <h3>{t('ext.version.chromeTitle')}</h3>
          </div>
          <div className="version-badges-row">
            <a
              href="https://chromewebstore.google.com/detail/meet-companion/neeapigpheabagekbdfjdekgdicfckpn"
              target="_blank"
              rel="noreferrer"
              className="version-badge-link"
            >
              <img
                src={chromeBadge}
                alt="Chrome Web Store"
                className="version-badge-img"
              />
            </a>
            <a
              href="https://github.com/suiflex/companion/releases/latest/download/meetcc-extension.zip"
              target="_blank"
              rel="noreferrer"
              className="version-zip-badge"
            >
              <span className="zip-icon">⤓</span>
              <span>{t('ext.version.downloadZip')}</span>
            </a>
          </div>
          <ol className="version-steps">
            <li>{t('ext.version.chromeStep1')}</li>
            <li>{t('ext.version.chromeStep2')}</li>
            <li>{t('ext.version.chromeStep3')}</li>
            <li>{t('ext.version.chromeStep4')}</li>
          </ol>
        </div>

        <div className="version-card">
          <div className="version-card-head">
            <h3>{t('ext.version.firefoxTitle')}</h3>
          </div>
          <div className="version-badges-row">
            <a
              href="https://addons.mozilla.org/en-US/firefox/addon/meet-companion/"
              target="_blank"
              rel="noreferrer"
              className="version-badge-link"
            >
              <img
                src={firefoxBadge}
                alt="Firefox Browser Add-on"
                className="version-badge-img"
              />
            </a>
          </div>
          <ol className="version-steps">
            <li>{t('ext.version.firefoxStep1')}</li>
            <li>{t('ext.version.firefoxStep2')}</li>
            <li>{t('ext.version.firefoxStep3')}</li>
            <li>{t('ext.version.firefoxStep4')}</li>
          </ol>
        </div>

        <div className="version-card">
          <div className="version-card-head">
            <h3>{t('ext.version.desktopTitle')}</h3>
          </div>
          <p className="hint">{t('ext.version.desktopDesc')}</p>
          <div className="version-desktop-actions">
            <a
              className="version-btn"
              href="https://github.com/suiflex/companion/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              {t('ext.version.platformMac')}
            </a>
            <a
              className="version-btn"
              href="https://github.com/suiflex/companion/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              {t('ext.version.platformWindows')}
            </a>
            <a
              className="version-btn"
              href="https://github.com/suiflex/companion/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              {t('ext.version.platformLinux')}
            </a>
          </div>
        </div>
      </div>

      <div className="version-terminal-card">
        <div className="version-terminal-head">
          <span className="version-term-title">{t('ext.version.terminalTitle')}</span>
          <span className="dim">{t('ext.version.terminalDesc')}</span>
        </div>
        <div className="version-code-box">
          <code>{INSTALL_CMD}</code>
          <Button type="button" className="version-copy-btn" onClick={() => void copyTerminalCmd()}>{t('ext.version.copy')}</Button>
        </div>
      </div>
    </div>
  );
}
