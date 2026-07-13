import { useEffect, useState } from 'react'
import {
  isLive,
  startedAt,
  type AnalysisRecord,
  type Meeting,
} from '@meetcc/shared'

type Theme = 'dark' | 'light'

/** Dark/light switch; persisted so the next open keeps the choice. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    document.body.dataset.theme === 'light' ? 'light' : 'dark',
  )
  useEffect(() => {
    document.body.dataset.theme = theme
    try {
      void chrome.storage.local.set({ theme })
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
  }, [theme])
  return (
    <button
      className='icon-btn'
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={
        theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'
      }
      title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}>
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  )
}

interface Props {
  meetings: Meeting[]
  loading: boolean
  records: Record<string, AnalysisRecord>
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
  onSettings: () => void
  onDecisions: () => void
  onDelete: (id: string) => void
}

export function Sidebar({
  meetings,
  loading,
  records,
  now,
  selectedId,
  onSelect,
  onSettings,
  onDecisions,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(true)
  const live = meetings.filter((m) => isLive(m, now))
  const past = meetings.filter((m) => !isLive(m, now))

  const badge = (m: Meeting) => {
    const r = records[m.id]
    if (!r) return null
    if (r.status === 'processing')
      return <span className='ai-badge processing'>AI…</span>
    if (r.status === 'error') return <span className='ai-badge error'>!</span>
    return <span className='ai-badge done'>✓</span>
  }

  const item = (m: Meeting) => (
    <div key={m.id} className='meeting-row'>
      <button
        className={`meeting ${m.id === selectedId ? 'selected' : ''}`}
        onClick={() => onSelect(m.id)}>
        <span className={`status ${isLive(m, now) ? 'on' : ''}`} />
        <span className='meeting-body'>
          <span className='meeting-id'>{m.id}</span>
          <span className='meeting-sub'>
            {fmtDate(startedAt(m))} · {m.entries.length} baris
          </span>
        </span>
        {badge(m)}
      </button>
      <button
        className='meeting-del'
        aria-label={`Hapus meeting ${m.id}`}
        title='Hapus meeting (transcript, notulen, chat)'
        onClick={() => onDelete(m.id)}>
        🗑
      </button>
    </div>
  )

  // collapsed: slim icon rail — every action stays reachable, zero clutter
  if (!open) {
    return (
      <aside className='sidebar collapsed'>
        <button
          className='icon-btn'
          onClick={() => setOpen(true)}
          aria-label='Buka sidebar'
          aria-expanded='false'
          title='Buka sidebar'>
          »
        </button>
        <img className='brand-logo' src='icons/suiflex.svg' alt='Suiflex' />
        {live.length > 0 && (
          <span
            className='rail-live'
            title={`${live.length} meeting berlangsung`}
          />
        )}
        <span className='spacer' />
        <ThemeToggle />
        <button
          className='icon-btn'
          onClick={onDecisions}
          aria-label='Keputusan & carry-over'
          title='Keputusan & carry-over'>
          ▤
        </button>
        <button
          className='icon-btn'
          onClick={onSettings}
          aria-label='Settings'
          title='Settings'>
          ⚙
        </button>
      </aside>
    )
  }

  return (
    <aside className='sidebar'>
      <div className='brand'>
        <img className='brand-logo' src='icons/suiflex.svg' alt='Suiflex' />
        <span className='brand-name'>Companion</span>
        <button
          className='icon-btn'
          onClick={() => setOpen(false)}
          aria-label='Sembunyikan sidebar'
          aria-expanded='true'
          title='Sembunyikan sidebar'>
          «
        </button>
      </div>

      {loading ? (
        <div aria-hidden='true'>
          {[0, 1, 2].map((i) => (
            <div key={i} className='skeleton skeleton-row' />
          ))}
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <section>
              <h2 className='section-label'>Berlangsung</h2>
              {live.map(item)}
            </section>
          )}
          <section>
            <h2 className='section-label'>Riwayat</h2>
            {past.length ? (
              past.map(item)
            ) : (
              <p className='section-empty'>Kosong</p>
            )}
          </section>
        </>
      )}
      <div className='sidebar-foot'>
        <ThemeToggle />
        <button
          className='icon-btn'
          onClick={onDecisions}
          aria-label='Keputusan & carry-over'
          title='Keputusan & carry-over'>
          ▤
        </button>
        <button
          className='icon-btn'
          onClick={onSettings}
          aria-label='Settings'
          title='Settings'>
          ⚙
        </button>
      </div>
      <p className='sidebar-credit'>
        <img className='credit-logo' src='icons/suiflex.svg' alt='' />
        powered by suiflex
      </p>
    </aside>
  )
}
