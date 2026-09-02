import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openDatabase, type SqlDriver } from '@meetcc/store'
import { createIndex, search, Vault, uuidV7, type VaultNote } from '@meetcc/vault'
import { tauriVaultIo } from './vaultIo'

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
    const rel = await v.listNotes()
    const heads = await Promise.all(
      rel.map(async (r) => {
        const n = await v.readNote(r)
        return { rel: r, title: n.title || r, updatedAt: n.updatedAt }
      }),
    )
    setNotes(heads)
    if (driverRef.current) await createIndex(driverRef.current, v)
  }

  async function open(rel: string) {
    if (!vault) return
    const n = await vault.readNote(rel)
    setSelected(rel)
    setNote(n)
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
        <span className="brand">Com</span>
        <button type="button" title="Catatan" className="rail-btn rail-active" aria-label="Catatan">
          ▤
        </button>
        <button type="button" title="Rapat masuk" className="rail-btn" aria-label="Rapat masuk">
          ◈
        </button>
        <span className="rail-spacer" />
        <button type="button" title="Vault & jembatan" className="rail-btn" aria-label="Vault & jembatan">
          ⚙
        </button>
      </aside>

      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="kicker">Vault</span>
          <span className="count">{notes.length} nota</span>
          <button type="button" className="add-btn" onClick={openNew} aria-label="Nota baru">
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
                  onClick={() => open(n.rel)}
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
                onChange={(e) => setNote({ ...note, title: e.target.value })}
              />
              <textarea
                className="body-input"
                value={note.body}
                placeholder="Tulis di sini…"
                onChange={(e) => setNote({ ...note, body: e.target.value })}
              />
              <div className="editor-actions">
                <span className="meta">diperbarui {dayOf(note.updatedAt) || '—'}</span>
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
          {error && <div className="error-bar">{error}</div>}
        </section>
      </main>
    </div>
  )
}
