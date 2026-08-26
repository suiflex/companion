import { useEffect, useRef, useState } from 'react';
import type { IntegrationSettings, Settings } from '@meetcc/shared';
import { db } from '../lib/db';
import { useToast } from '../toast';

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

function downloadText(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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
        `Sync: ${r.pushed.length} terkirim, ${r.pulled.length} diterima` +
          (r.failed.length ? `, ${r.failed.length} gagal (${r.failed[0].error})` : ''),
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
        <span>Sorotan langsung saat rapat berjalan</span>
        <span className="hint">
          Deteksi keputusan / action / deadline dari kata kuncinya saja — tanpa panggilan AI, jadi
          tidak menambah biaya dan tidak mengirim apa pun keluar.
        </span>
      </label>

      <fieldset className="field-group">
        <legend>Issue tracker (action item)</legend>
        <label className="field">
          <span>Provider</span>
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
            <span>Base URL</span>
            <input
              type="url"
              value={i.tracker.baseUrl}
              placeholder="https://org.atlassian.net"
              onChange={(e) => patch({ tracker: { ...i.tracker, baseUrl: e.target.value } })}
            />
          </label>
        )}
        <label className="field">
          <span>Token</span>
          <input
            type="password"
            autoComplete="off"
            value={i.tracker.token}
            placeholder={i.tracker.provider === 'jira' ? 'email@org.com:api-token' : 'API key'}
            onChange={(e) => patch({ tracker: { ...i.tracker, token: e.target.value } })}
          />
          <span className="hint">Disimpan terenkripsi (AES-GCM), sama seperti API key provider.</span>
        </label>
        <label className="field">
          <span>{i.tracker.provider === 'jira' ? 'Project key' : i.tracker.provider === 'linear' ? 'Team id' : 'Database id'}</span>
          <input
            type="text"
            value={i.tracker.target}
            onChange={(e) => patch({ tracker: { ...i.tracker, target: e.target.value } })}
          />
        </label>
      </fieldset>

      <fieldset className="field-group">
        <legend>Sync & workspace tim</legend>
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={i.sync.enabled}
            onChange={(e) => patch({ sync: { ...i.sync, enabled: e.target.checked } })}
          />
          <span>Aktifkan sync</span>
          <span className="hint">
            Opsional. Isi transcript dienkripsi dengan passphrase kamu sebelum dikirim — server
            tidak pernah menerima kuncinya. Tidak ada layanan Companion: jalankan{' '}
            <code>@meetcc/sync-server</code> di komputer sendiri, atau pakai endpoint https milikmu.
          </span>
        </label>
        <label className="field">
          <span>Endpoint</span>
          <input
            type="url"
            value={i.sync.endpoint}
            placeholder="http://localhost:8787"
            onChange={(e) => patch({ sync: { ...i.sync, endpoint: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Token</span>
          <input
            type="password"
            autoComplete="off"
            value={i.sync.token}
            onChange={(e) => patch({ sync: { ...i.sync, token: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Workspace id (opsional)</span>
          <input
            type="text"
            value={i.sync.workspaceId}
            placeholder="tim-platform"
            onChange={(e) => patch({ sync: { ...i.sync, workspaceId: e.target.value } })}
          />
          <span className="hint">Namespace bersama untuk satu tim; kosong = pribadi.</span>
        </label>
        <label className="field">
          <span>Passphrase enkripsi</span>
          <input
            type="password"
            autoComplete="off"
            value={i.sync.passphrase}
            onChange={(e) => patch({ sync: { ...i.sync, passphrase: e.target.value } })}
          />
          <span className="hint">
            Minimal 8 karakter. Kalau hilang, data yang sudah terkirim tidak bisa dibuka lagi —
            tidak ada pemulihan.
          </span>
        </label>
        <div className="subbar">
          <button onClick={() => void syncNow()} disabled={syncing || !i.sync.enabled}>
            {syncing ? 'Sync…' : 'Sync sekarang'}
          </button>
          <span className="hint">Simpan dulu bila baru mengubah pengaturan di atas.</span>
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>Transkripsi rekaman & kalender</legend>
        <label className="field">
          <span>Endpoint speech-to-text</span>
          <input
            type="url"
            value={i.transcription.endpoint}
            placeholder="https://api.openai.com/v1/audio/transcriptions"
            onChange={(e) => patch({ transcription: { ...i.transcription, endpoint: e.target.value } })}
          />
          <span className="hint">
            Kompatibel OpenAI (termasuk Whisper lokal). Kosong = impor file audio dimatikan.
          </span>
        </label>
        <label className="field">
          <span>API key transkripsi</span>
          <input
            type="password"
            autoComplete="off"
            value={i.transcription.apiKey}
            onChange={(e) => patch({ transcription: { ...i.transcription, apiKey: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Model</span>
          <input
            type="text"
            value={i.transcription.model}
            onChange={(e) => patch({ transcription: { ...i.transcription, model: e.target.value } })}
          />
        </label>
        <label className="field">
          <span>Google OAuth client id (kalender)</span>
          <input
            type="text"
            value={i.calendarClientId}
            placeholder="xxxx.apps.googleusercontent.com"
            onChange={(e) => patch({ calendarClientId: e.target.value })}
          />
          <span className="hint">
            Client id milikmu sendiri; extension ini tidak membawa kredensial apa pun. Tanpa ini,
            pencocokan kalender tetap bisa lewat impor file .ics di tab Data.
          </span>
        </label>
        <div className="subbar">
          <button
            disabled={!i.calendarClientId.trim()}
            onClick={() =>
              void (async () => {
                try {
                  const r = await db<{ matched: unknown[] }>('connect-calendar');
                  toast('success', `${r.matched.length} rapat dicocokkan dengan agenda kalender.`);
                } catch (e) {
                  toast('error', (e as Error).message);
                }
              })()
            }
          >
            Hubungkan Google Calendar
          </button>
          <span className="hint">Simpan settings dulu agar client id terbaca.</span>
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
      toast('success', 'Template tersimpan.');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <>
      <p className="hint">
        Template mengatur struktur dan penekanan dokumen (mis. notulen retro, MoM klien). Aturan
        grounding tetap berlaku: template mengubah bentuk, bukan mengizinkan fakta baru.
      </p>

      <label className="field">
        <span>Nama</span>
        <input
          type="text"
          value={draft.name}
          placeholder="Notulen retro tim"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Dipakai untuk</span>
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
          <option value="doc">Dokumen (BRD / PRD / Notulen)</option>
          <option value="analysis">Analisis rapat</option>
        </select>
      </label>
      <label className="field">
        <span>Instruksi</span>
        <textarea
          rows={4}
          value={draft.instructions}
          placeholder="Fokus pada apa yang berjalan baik, apa yang tidak, dan eksperimen sprint berikutnya."
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Section (satu per baris, opsional)</span>
        <textarea
          rows={3}
          value={draft.sections.join('\n')}
          onChange={(e) => setDraft({ ...draft, sections: e.target.value.split('\n').filter(Boolean) })}
        />
      </label>
      <div className="subbar">
        <span className="spacer" />
        <button className="primary" onClick={() => void save()}>
          {draft.id ? 'Perbarui template' : 'Tambah template'}
        </button>
      </div>

      <ul className="tpl-list">
        {templates.map((t) => (
          <li key={t.id}>
            <span className="tpl-name">{t.name}</span>
            <span className="dim">{t.kind}</span>
            <span className="spacer" />
            <button onClick={() => setDraft(t)}>Edit</button>
            <button
              className="danger"
              onClick={async () => {
                setTemplates(await db<Template[]>('delete-template', { id: t.id }));
              }}
            >
              Hapus
            </button>
          </li>
        ))}
        {!templates.length && <li className="section-empty">Belum ada template.</li>}
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
        <legend>Impor rapat</legend>
        <p className="hint">
          Berkas .vtt, .srt, transcript Zoom, atau teks biasa. Rekaman audio/video ikut didukung
          bila endpoint speech-to-text sudah diisi di tab Integrasi (maks 25 MB). Hasilnya jadi
          rapat biasa: bisa dianalisis, dicari, dan ditanyai seperti rapat yang direkam langsung.
        </p>
        <input
          ref={transcriptFile}
          type="file"
          accept=".vtt,.srt,.txt,text/plain,audio/*,video/mp4"
          aria-label="Berkas transcript atau audio"
        />
        <button
          disabled={!!busy}
          onClick={() =>
            void run('import', async () => {
              const file = transcriptFile.current?.files?.[0];
              if (!file) return toast('error', 'Pilih berkas dulu.');
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
              toast('success', `${res.entries} baris diimpor sebagai ${res.sessionId}.`);
            })
          }
        >
          {busy === 'import' ? 'Mengimpor…' : 'Impor transcript / audio'}
        </button>
      </fieldset>

      <fieldset className="field-group">
        <legend>Kalender (.ics)</legend>
        <input ref={icsFile} type="file" accept=".ics,text/calendar" aria-label="Berkas kalender" />
        <button
          disabled={!!busy}
          onClick={() =>
            void run('ics', async () => {
              const file = icsFile.current?.files?.[0];
              if (!file) return toast('error', 'Pilih berkas .ics dulu.');
              const res = await db<{ matched: unknown[] }>('match-calendar', { ics: await file.text() });
              toast('success', `${res.matched.length} rapat dicocokkan dengan agenda kalender.`);
            })
          }
        >
          {busy === 'ics' ? 'Mencocokkan…' : 'Cocokkan agenda'}
        </button>
      </fieldset>

      <fieldset className="field-group">
        <legend>Bagikan rapat (terenkripsi)</legend>
        <label className="field">
          <span>Passphrase</span>
          <input
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <span className="hint">
            Penerima butuh passphrase ini untuk membuka berkas. Siapa pun yang punya passphrase-nya
            bisa membaca isi rapat.
          </span>
        </label>
        <div className="subbar">
          <button
            disabled={!!busy || !selectedMeeting}
            title={selectedMeeting ? '' : 'Pilih rapat dulu di sidebar'}
            onClick={() =>
              void run('share', async () => {
                const res = await db<{ payload: string }>('export-share', {
                  sessionId: selectedMeeting,
                  passphrase,
                });
                downloadText(`${selectedMeeting}.companion-share`, res.payload, 'text/plain');
                toast('success', 'Berkas share diunduh.');
              })
            }
          >
            Ekspor rapat terpilih
          </button>
          <input ref={shareFile} type="file" accept=".companion-share" aria-label="Berkas share" />
          <button
            disabled={!!busy}
            onClick={() =>
              void run('unshare', async () => {
                const file = shareFile.current?.files?.[0];
                if (!file) return toast('error', 'Pilih berkas share dulu.');
                const res = await db<{ sessionId: string }>('import-share', {
                  payload: await file.text(),
                  passphrase,
                });
                toast('success', `Rapat ${res.sessionId} diimpor.`);
              })
            }
          >
            Impor berkas share
          </button>
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>MCP & indeks</legend>
        <p className="hint">
          Snapshot untuk MCP server (<code>companion-mcp snapshot.json</code>) agar coding agent
          bisa mencari dan membaca rapatmu. API key dan audit log tidak ikut disertakan.
        </p>
        <div className="subbar">
          <button
            disabled={!!busy}
            onClick={() =>
              void run('snapshot', async () => {
                const res = await db<{ snapshot: Record<string, unknown> }>('export-snapshot');
                downloadText('companion-snapshot.json', JSON.stringify(res.snapshot));
                toast('success', 'Snapshot diunduh.');
              })
            }
          >
            Ekspor snapshot
          </button>
          <button
            disabled={!!busy}
            onClick={() =>
              void run('reindex', async () => {
                const r = await db<{ sessions: number; entries: number; mismatched: string[] }>('sync-index');
                toast(
                  r.mismatched.length ? 'error' : 'success',
                  `Indeks dibangun ulang: ${r.sessions} rapat, ${r.entries} baris` +
                    (r.mismatched.length ? `, ${r.mismatched.length} tidak cocok` : ''),
                );
              })
            }
          >
            Bangun ulang indeks
          </button>
        </div>
      </fieldset>
    </>
  );
}
