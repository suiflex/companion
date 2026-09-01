import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Vault, uuidV7, type VaultNote } from '@meetcc/vault'
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
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<VaultNote | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const root = await invoke<string>('vault_root')
        const v = new Vault({ io: tauriVaultIo(root) })
        setVault(v)
        await refresh(v)
      } catch (e) {
        setError(String(e))
      }
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSelected(fresh.sessionKey)
    setNote(fresh)
    setError(null)
  }

  async function save() {
    if (!vault || !note) return
    try {
      note.updatedAt = new Date().toISOString()
      await vault.writeNote(note)
      setNote({ ...note })
      await refresh(vault)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  async function remove() {
    if (!vault || !selected) return
    await vault.trash(selected)
    setNote(null)
    setSelected(null)
    await refresh(vault)
  }

  const filtered = useMemo(
    () =>
      notes.filter((n) =>
        query ? n.title.toLowerCase().includes(query.toLowerCase()) : true,
      ),
    [notes, query],
  )

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
            <li key={n.rel}>
              <button
                type="button"
                className={selected === n.rel ? 'note-item active' : 'note-item'}
                onClick={() => open(n.rel)}
              >
                <span className="note-title">{n.title}</span>
                <span className="note-date">{dayOf(n.updatedAt)}</span>
              </button>
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
