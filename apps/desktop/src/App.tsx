import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openDatabase, type SqlDriver } from '@meetcc/store'
import { createIndex, search, Vault, uuidV7, type VaultNote } from '@meetcc/vault'
import { tauriVaultIo } from './vaultIo'

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
}

function dayOf(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

export default function App() {
  const [vault, setVault] = useState<Vault | null>(null)
  const [notes, setNotes] = useState<NoteHeader[]>([])
  const [driver, setDriver] = useState<SqlDriver | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<VaultNote | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
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
    setNotes(read.map((n, i) => ({ rel: rel[i], title: n.title || rel[i], updatedAt: n.updatedAt })))
    if (driverRef.current) await createIndex(driverRef.current, v, read)
  }

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

  const filtered = useMemo(() => {
    if (!query.trim()) return notes
    const q = query.trim().toLowerCase()
    // FTS hits carry a vault-relative `path` (and match the note body too);
    // title-substring matches on the full list fill any gap. Dedupe by rel.
    const hits = driver
      ? search(driver, q).map((h) => ({ rel: h.path, title: h.title, updatedAt: h.updatedAt }))
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

  return (
    <div className="shell">
      <aside className="rail" aria-label="Navigasi utama">
        <BrandMark />
        <button type="button" title="Catatan" className="rail-btn rail-active" aria-label="Catatan">
          ▤
        </button>
        {/* Screens that do not exist yet. Disabled rather than removed so the
            rail keeps its shape, and so a button never looks pressable while
            doing nothing — which is how these read before. */}
        <button
          type="button"
          title="Rapat masuk — belum tersedia"
          className="rail-btn"
          aria-label="Rapat masuk (belum tersedia)"
          disabled
        >
          ◈
        </button>
        <span className="rail-spacer" />
        <button
          type="button"
          title="Vault & jembatan — belum tersedia"
          className="rail-btn"
          aria-label="Vault & jembatan (belum tersedia)"
          disabled
        >
          ⚙
        </button>
      </aside>

      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="kicker">Vault</span>
          <span className="count">{notes.length} nota</span>
          <button type="button" className="add-btn" onClick={() => guard(openNew)} aria-label="Nota baru">
            ＋
          </button>
        </div>
        <input
          className="search"
          placeholder="Cari nota…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
          {note ? (
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
