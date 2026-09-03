import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openDatabase, type SqlDriver } from '@meetcc/store'
import { createIndex, search, Vault, uuidV7, type VaultNote } from '@meetcc/vault'
import { tauriVaultIo } from './vaultIo'
import UpdateBanner from './UpdateBanner'

/** Vault & bridge settings. Small on purpose: the only thing here that changes
 *  state is where the vault lives, and that is a decision worth making explicit
 *  rather than burying in a preferences tree. */
function Settings({
  root,
  noteCount,
  onMove,
}: {
  root: string
  noteCount: number
  onMove: () => void
}) {
  return (
    <div className="settings">
      <h1>Vault &amp; jembatan</h1>

      <section className="setting-row">
        <div>
          <h2>Lokasi vault</h2>
          <p className="setting-path">{root}</p>
          <p className="hint">
            {noteCount} nota. Semua berkas .md biasa — bisa dibuka editor apa pun, dan
            aman disalin atau di-backup seperti folder lain.
          </p>
        </div>
        <button type="button" className="btn" onClick={onMove}>
          Pindah folder…
        </button>
      </section>

      <section className="setting-row">
        <div>
          <h2>Jembatan extension</h2>
          <p className="hint">
            Extension mengirim rapat yang selesai ke vault ini lewat native messaging
            host, kalau host-nya sudah didaftarkan dan togglenya dinyalakan di Settings
            extension. Pengiriman bersifat opsional — desktop tetap jalan tanpanya.
          </p>
        </div>
      </section>

      <section className="setting-row">
        <div>
          <h2>Indeks pencarian</h2>
          <p className="hint">
            Dibangun ulang dari berkas .md setiap kali daftar nota disegarkan. Indeks
            adalah turunan: menghapusnya tidak pernah menghilangkan nota.
          </p>
        </div>
      </section>
    </div>
  )
}

/** The Companion mark from assets/brand/logo-mark.svg, inlined. */
function BrandMark() {
  return (
    <svg className="brand" viewBox="0 0 32 32" role="img" aria-label="Meet Companion">
      <rect width="32" height="32" rx="7" fill="#0a0a0a" />
      <path
        d="M10 7 H22 A4 4 0 0 1 26 11 V17 A4 4 0 0 1 22 21 H14.5 L10 25.5 V21 A4 4 0 0 1 6 17 V11 A4 4 0 0 1 10 7 Z"
        fill="#4ade80"
      />
      <rect x="10" y="11.2" width="12" height="2.6" rx="1.3" fill="#0a0a0a" />
      <rect x="10" y="15.4" width="7" height="2.6" rx="1.3" fill="#0a0a0a" opacity=".55" />
    </svg>
  )
}

interface NoteHeader {
  rel: string
  title: string
  updatedAt: string
  /** `manual` for a note written here; the meeting platform for a delivered one. */
  platform: string
  startedAt?: string
  participants: number
  /** A delivered note has no body until the extension sends the summary. */
  hasBody: boolean
}

const PLATFORM_LABELS: Record<string, string> = {
  'google-meet': 'Google Meet',
  'microsoft-teams': 'Microsoft Teams',
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  import: 'Impor',
}

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

function dayOf(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

const STATUSES = ['', 'To Do', 'In Progress', 'Blocked', 'Done']
const PRIORITIES = ['', 'Low', 'Medium', 'High', 'Urgent']

/**
 * The ticket half of a note: what the body cannot carry as prose.
 *
 * The values are free-form in the file (frontmatter is hand-editable markdown,
 * not a schema), so the selects offer a set without enforcing it — a note
 * carrying a value from somewhere else keeps it.
 */
function TicketFields({
  note,
  onChange,
}: {
  note: VaultNote
  onChange: (patch: Partial<VaultNote>) => void
}) {
  const pick = (value: string): string | undefined => value || undefined
  return (
    <div className="ticket-fields">
      <label>
        <span>Status</span>
        <select value={note.status ?? ''} onChange={(e) => onChange({ status: pick(e.target.value) })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || '—'}</option>
          ))}
          {note.status && !STATUSES.includes(note.status) && (
            <option value={note.status}>{note.status}</option>
          )}
        </select>
      </label>
      <label>
        <span>Prioritas</span>
        <select value={note.priority ?? ''} onChange={(e) => onChange({ priority: pick(e.target.value) })}>
          {PRIORITIES.map((s) => (
            <option key={s} value={s}>{s || '—'}</option>
          ))}
          {note.priority && !PRIORITIES.includes(note.priority) && (
            <option value={note.priority}>{note.priority}</option>
          )}
        </select>
      </label>
      <label>
        <span>Assignee</span>
        <input
          value={note.assignee ?? ''}
          placeholder="siapa"
          onChange={(e) => onChange({ assignee: pick(e.target.value) })}
        />
      </label>
      <label>
        <span>Tenggat</span>
        <input
          type="date"
          value={note.dueDate ?? ''}
          onChange={(e) => onChange({ dueDate: pick(e.target.value) })}
        />
      </label>
    </div>
  )
}

export default function App() {
  const [vault, setVault] = useState<Vault | null>(null)
  const [notes, setNotes] = useState<NoteHeader[]>([])
  const [driver, setDriver] = useState<SqlDriver | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<VaultNote | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'notes' | 'inbox' | 'settings'>('notes')
  const [dirty, setDirty] = useState(false)
  // Leaving a note with unsaved edits used to drop them silently. Hold the
  // action the user asked for until they say what to do with the edits.
  const [pending, setPending] = useState<null | (() => Promise<void>)>(null)
  const driverRef = useRef<SqlDriver | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const root = await invoke<string>('vault_root')
        const v = new Vault({ io: tauriVaultIo(root) })
        // Derived index is disposable and session-scoped: an in-memory SQLite
        // rebuilt from the .md files is all the UI needs for search.
        const { driver } = await openDatabase()
        driverRef.current = driver
        setDriver(driver)
        setVault(v)
        await refresh(v)
      } catch (e) {
        setError(String(e))
      }
    }
    void init()
  }, [])

  async function refresh(v: Vault) {
    // Read the vault once and feed both the sidebar and the index from it —
    // every read here is a round trip through Rust, and this runs on every save.
    const rel = await v.listNotes()
    const read = await Promise.all(rel.map((r) => v.readNote(r)))
    setNotes(
      read.map((n, i) => ({
        rel: rel[i],
        title: n.title || rel[i],
        updatedAt: n.updatedAt,
        platform: n.platform,
        startedAt: n.startedAt,
        participants: n.participants?.length ?? 0,
        hasBody: Boolean(n.body.trim()),
      })),
    )
    if (driverRef.current) await createIndex(driverRef.current, v, read)
  }

  // Notes also arrive from outside this window: the extension hands finished
  // meetings to the native host, which writes straight into the vault. Without
  // this the app only ever read the vault at startup, so a delivery looked
  // like nothing had happened until the next restart.
  //
  // ponytail: polls the note list rather than watching the filesystem — swap in
  // tauri-plugin-fs watch if a vault ever grows big enough for the walk to show.
  useEffect(() => {
    if (!vault) return
    const seen = notes.map((n) => n.rel).join('\n')
    const timer = setInterval(() => {
      // Never while editing: refresh replaces the note list the editor's
      // selection is addressed against, and unsaved work is not ours to drop.
      if (dirty) return
      void vault
        .listNotes()
        .then((rel) => {
          if (rel.join('\n') !== seen) return refresh(vault)
        })
        .catch(() => undefined)
    }, 5000)
    return () => clearInterval(timer)
  }, [vault, notes, dirty])

  /** Run `action`, unless there are unsaved edits to resolve first. */
  function guard(action: () => Promise<void>) {
    if (dirty) setPending(() => action)
    else void action()
  }

  async function resume(discard: boolean) {
    const action = pending
    setPending(null)
    if (!discard) await save()
    setDirty(false)
    if (action) await action()
  }

  async function open(rel: string) {
    if (!vault) return
    const n = await vault.readNote(rel)
    setSelected(rel)
    setNote(n)
    setDirty(false)
    setError(null)
  }

  async function openNew() {
    if (!vault) return
    const fresh: VaultNote = {
      id: uuidV7(),
      sessionKey: `nota/${Date.now().toString(36)}`,
      platform: 'manual',
      updatedAt: new Date().toISOString(),
      title: 'Nota baru',
      body: '',
    }
    // nothing on disk yet, so there is no vault path to select
    setSelected(null)
    setNote(fresh)
    setDirty(false)
    setError(null)
  }

  async function save() {
    if (!vault || !note) return
    try {
      note.updatedAt = new Date().toISOString()
      await vault.writeNote(note)
      // `selected` addresses a file, so it has to become the path the note was
      // just written to — otherwise trashing a freshly created note aims at
      // its session key and misses.
      setSelected(vault.relPath(note))
      setNote({ ...note })
      setDirty(false)
      await refresh(vault)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  async function remove() {
    if (!vault) return
    try {
      // a note that was never saved has no file — dropping it is the delete
      if (selected) {
        await vault.trash(selected)
        await refresh(vault)
      }
      setNote(null)
      setSelected(null)
      setDirty(false)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  /**
   * Point the vault at another folder.
   *
   * `set_vault_root` has existed in the backend since the first commit with
   * nothing calling it; this is what finally reaches it. The Vault is rebuilt
   * rather than mutated because its io carries the root, and the derived index
   * is repopulated from whatever the new folder holds.
   */
  async function moveVault() {
    if (!vault) return
    try {
      const picked = await openDialog({ directory: true, title: 'Pilih folder vault' })
      if (typeof picked !== 'string') return
      await invoke('set_vault_root', { path: picked })
      const next = new Vault({ io: tauriVaultIo(picked) })
      setVault(next)
      setNote(null)
      setSelected(null)
      setDirty(false)
      await refresh(next)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return notes
    const q = query.trim().toLowerCase()
    // FTS hits carry a vault-relative `path` (and match the note body too);
    // title-substring matches on the full list fill any gap. Dedupe by rel.
    const hits = driver
      ? search(driver, q).map((h) => {
          // The index carries no metadata; take it from the note list when the
          // hit is one we already read, so a search result renders like a row.
          const known = notes.find((n) => n.rel === h.path)
          return {
            rel: h.path,
            title: h.title,
            updatedAt: h.updatedAt,
            platform: known?.platform ?? '',
            startedAt: known?.startedAt,
            participants: known?.participants ?? 0,
            hasBody: known?.hasBody ?? false,
          }
        })
      : []
    const seen = new Set<string>()
    const ordered: NoteHeader[] = []
    for (const h of hits) {
      if (!h.rel) continue
      if (seen.has(h.rel)) continue
      seen.add(h.rel)
      ordered.push(h)
    }
    for (const n of notes) {
      if (n.title.toLowerCase().includes(q) && !seen.has(n.rel)) {
        seen.add(n.rel)
        ordered.push(n)
      }
    }
    return ordered
  }, [notes, driver, query])

  // Notes the extension delivered, as opposed to ones written here. The split
  // needs no new field: openNew stamps `manual`, applyBatch stamps the meeting
  // platform. Newest meeting first — an inbox is read from the top.
  const incoming = useMemo(
    () =>
      notes
        .filter((n) => n.platform && n.platform !== 'manual')
        .sort((a, b) => (b.startedAt ?? b.updatedAt).localeCompare(a.startedAt ?? a.updatedAt)),
    [notes],
  )

  return (
    <div className="shell">
      <UpdateBanner />
      <aside className="rail" aria-label="Navigasi utama">
        <BrandMark />
        <button
          type="button"
          title="Catatan"
          className={view === 'notes' ? 'rail-btn rail-active' : 'rail-btn'}
          aria-label="Catatan"
          aria-current={view === 'notes' ? 'page' : undefined}
          onClick={() => setView('notes')}
        >
          ▤
        </button>
        <button
          type="button"
          title="Rapat masuk"
          className={view === 'inbox' ? 'rail-btn rail-active' : 'rail-btn'}
          aria-label="Rapat masuk"
          aria-current={view === 'inbox' ? 'page' : undefined}
          onClick={() => setView('inbox')}
        >
          ◈
        </button>
        <span className="rail-spacer" />
        <button
          type="button"
          title="Vault & jembatan"
          className={view === 'settings' ? 'rail-btn rail-active' : 'rail-btn'}
          aria-label="Vault & jembatan"
          aria-current={view === 'settings' ? 'page' : undefined}
          onClick={() => setView('settings')}
        >
          ⚙
        </button>
      </aside>

      {view === 'notes' && (
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="kicker">Vault</span>
            <span className="count">{notes.length} nota</span>
            {/* The vault opens asynchronously (sqlite wasm) and openNew returns
                early without it, so until then the button would look live and
                answer a click with nothing. */}
            <button
              type="button"
              className="add-btn"
              onClick={() => guard(openNew)}
              aria-label="Nota baru"
              disabled={!vault}
              title={vault ? 'Nota baru' : 'Menyiapkan vault…'}
            >
              ＋
            </button>
          </div>
          <input
            className="search"
            placeholder={vault ? 'Cari nota…' : 'Menyiapkan vault…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!vault}
          />
          <ul className="note-list">
            {filtered.map((n) => (
              <li key={n.rel || n.title}>
                {n.rel ? (
                  <button
                    type="button"
                    className={selected === n.rel ? 'note-item active' : 'note-item'}
                    onClick={() => guard(() => open(n.rel))}
                  >
                    <span className="note-title">{n.title}</span>
                    <span className="note-date">{dayOf(n.updatedAt)}</span>
                  </button>
                ) : (
                  <span className="note-title muted" title="hasil pencarian isi tubuh nota">
                    {n.title}
                  </span>
                )}
              </li>
            ))}
            {filtered.length === 0 && <li className="empty-hint">Belum ada nota.</li>}
          </ul>
        </aside>
      )}

      {view === 'inbox' && (
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="kicker">Rapat masuk</span>
            <span className="count">{incoming.length} rapat</span>
          </div>
          <ul className="note-list">
            {incoming.map((n) => (
              <li key={n.rel}>
                <button
                  type="button"
                  className={selected === n.rel ? 'note-item active' : 'note-item'}
                  onClick={() => guard(() => open(n.rel))}
                >
                  <span className="note-title">{n.title}</span>
                  <span className="inbox-meta">
                    <span>{platformLabel(n.platform)}</span>
                    <span>{dayOf(n.startedAt) || dayOf(n.updatedAt)}</span>
                    {n.participants > 0 && <span>{n.participants} peserta</span>}
                    {/* A meeting arrives as captions first; the body only fills
                        once the extension has a summary to send. Saying so beats
                        an empty note looking like a failed delivery. */}
                    {!n.hasBody && <span className="pending">transkrip saja</span>}
                  </span>
                </button>
              </li>
            ))}
            {incoming.length === 0 && (
              <li className="empty-hint">
                Belum ada rapat yang masuk. Nyalakan “Kirim rapat selesai ke Companion
                Desktop” di setelan extension, lalu tekan “Tes koneksi” di sana.
              </li>
            )}
          </ul>
        </aside>
      )}

      <main className="content">
        <header className="topbar">
          <span className="vault">{vault?.io.root ?? '…'}</span>
          {note && (
            <span className="badge" title="Tersimpan lokal, tanpa sinkron">
              LOKAL
            </span>
          )}
        </header>

        <section className="editor-wrap">
          {view === 'settings' ? (
            <Settings
              root={vault?.io.root ?? '…'}
              noteCount={notes.length}
              onMove={() => guard(moveVault)}
            />
          ) : note ? (
            <>
              <input
                className="title-input"
                value={note.title}
                placeholder="Judul nota"
                onChange={(e) => {
                  setNote({ ...note, title: e.target.value })
                  setDirty(true)
                }}
              />
              <TicketFields note={note} onChange={(patch) => { setNote({ ...note, ...patch }); setDirty(true) }} />
              <textarea
                className="body-input"
                value={note.body}
                placeholder="Tulis di sini…"
                onChange={(e) => {
                  setNote({ ...note, body: e.target.value })
                  setDirty(true)
                }}
              />
              <div className="editor-actions">
                <span className="meta">
                  {dirty ? 'belum disimpan' : `diperbarui ${dayOf(note.updatedAt) || '—'}`}
                </span>
                <button type="button" className="btn danger" onClick={remove}>
                  Pindah ke sampah
                </button>
                <button type="button" className="btn primary" onClick={save}>
                  Simpan
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              <h1>Companion Desktop</h1>
              <p>
                Buka atau buat nota di vault lokal. Semua berkas .md, bisa diedit editor apa pun.
              </p>
            </div>
          )}
          {pending && (
            <div className="confirm-bar" role="alert">
              <span>Nota ini punya perubahan yang belum disimpan.</span>
              <button type="button" className="btn" onClick={() => void resume(true)}>
                Buang perubahan
              </button>
              <button type="button" className="btn primary" onClick={() => void resume(false)}>
                Simpan lalu lanjut
              </button>
            </div>
          )}
          {error && <div className="error-bar">{error}</div>}
        </section>
      </main>
    </div>
  )
}
